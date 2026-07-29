/* תמונות מנה — דחיסה ואחסון.

   ── למה IndexedDB ולא ה-store הרגיל ─────────────────────────────────
   כל שאר המצב יושב ב-localStorage, ולתמונות זה לא עובד: המכסה היא
   כ-5MB, האחסון הוא מחרוזות בלבד (כלומר base64, שמנפח ב-33%), והגישה
   סינכרונית וחוסמת את הרינדור. תמונה אחת מהטלפון היא 3-5MB לפני דחיסה
   — כלומר תמונה אחת הייתה מפילה את *כל* הנתונים, כולל התוכנית והמזווה.

   IndexedDB מחזיק Blob כמו שהוא, אסינכרוני, והמכסה שלו גדולה בסדרי גודל.

   ── המחיר, והוא מתועד גם בממשק ──────────────────────────────────────
   קובץ הגיבוי מכיל את המצב מ-localStorage בלבד. תמונות אינן נכנסות
   אליו: קידוד base64 של עשר תמונות היה קובץ של מגהבייטים שאי אפשר
   לשלוח בהודעה, וזו בדיוק המטרה של הגיבוי. מי שמייבא גיבוי במכשיר חדש
   מקבל את התוכנית בלי התמונות, וזה נאמר לו במפורש במקום להתגלות לבד.

   ── כשל כאן לעולם אינו מפיל את האפליקציה ────────────────────────────
   גלישה פרטית, אחסון חסום, מכסה מלאה — כל אלה מחזירים null, והמנה פשוט
   מוצגת בלי תמונה. אותו עיקרון כמו נפילת ה-store לזיכרון. */

const DB_NAME = "gp_meals_images";
const DB_VERSION = 1;
const STORE = "dishes";

/* גבול הצלע הארוכה אחרי דחיסה. 900 מספיק לרוחב מסך טלפון בצפיפות 2x,
   ומעליו רק מגדילים קובץ בלי שההבדל נראה בכרטיס. */
const MAX_EDGE = 900;
const QUALITY = 0.75;

/**
 * מידות אחרי כיווץ לצלע הארוכה. טהורה ומיוצאת כדי שתיבדק.
 *
 * תמונה שכבר קטנה מהגבול נשארת כמו שהיא — הגדלה שלה רק מנפחת את הקובץ
 * בלי להוסיף מידע.
 */
export function fitDimensions(width, height, max = MAX_EDGE) {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/* ---------- מסד הנתונים ---------- */

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    // ההעדר עצמו הוא מצב תקין ולא שגיאה: דפדפן בלי IndexedDB פשוט
    // מציג מנות בלי תמונות.
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // גלישה פרטית בפיירפוקס חוסמת בלי לירות error — בלי הזה ההבטחה
    // נשארת תלויה לנצח וכל קריאה שממתינה לה נתקעת.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/**
 * מריץ פעולה אחת על ה-store ומחזיר `{ok, value}`.
 *
 * ── למה מעטפת ולא הערך עצמו ─────────────────────────────────────────
 * גרסה קודמת החזירה `request.result ?? true`, כדי ש-put ו-delete —
 * שמחזירים undefined בהצלחה — ייראו כהצלחה. זה הרס את get: מפתח שאינו
 * קיים מחזיר undefined, כלומר "אין תמונה", וההמרה הפכה אותו ל-`true`.
 * הקורא בדק `if (!blob)`, קיבל ערך אמיתי, והעביר בוליאני ל-
 * createObjectURL — שזרק על כל מנה בלי תמונה.
 *
 * "אין תמונה" ו"הפעולה נכשלה" הם שני דברים שונים, ומעטפת מפרידה
 * ביניהם במקום להעמיס את שניהם על אותו ערך.
 */
function run(mode, action) {
  const fail = { ok: false, value: null };

  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(fail);
          return;
        }
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          resolve(fail);
          return;
        }
        const request = action(tx.objectStore(STORE));
        tx.onabort = () => resolve(fail); // מכסה מלאה נופלת לכאן
        tx.onerror = () => resolve(fail);
        request.onsuccess = () => resolve({ ok: true, value: request.result });
        request.onerror = () => resolve(fail);
      }),
  );
}

/* ---------- דחיסה ---------- */

/**
 * מכווץ קובץ תמונה ל-Blob קטן.
 *
 * הדחיסה קורית *לפני* השמירה ולא בהצגה: הקובץ המקורי מהטלפון הוא
 * מגהבייטים, ולשמור אותו כמו שהוא פירושו למלא את המכסה בשלוש תמונות
 * ואז להיכשל בשקט על הרביעית.
 *
 * @returns {Promise<Blob|null>} null כשהקובץ אינו תמונה או שהפענוח נכשל
 */
export async function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) return null;

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });

    const { width, height } = fitDimensions(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    return await new Promise((resolve) => {
      // JPEG ולא PNG: צילום אוכל הוא תמונה רציפת-גוונים, ו-PNG עליה
      // גדול פי כמה בלי שום רווח.
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- הממשק ---------- */

/** @returns {Promise<Blob|null>} null גם כשאין תמונה וגם כשהקריאה נכשלה */
export async function getImage(dishId) {
  if (!dishId) return null;
  const { ok, value } = await run("readonly", (store) => store.get(dishId));
  return ok && value instanceof Blob ? value : null;
}

/**
 * שומר תמונה למנה. מחזיר האם באמת נשמרה — הממשק לא מבטיח מה שלא קרה.
 * @returns {Promise<boolean>}
 */
export async function putImage(dishId, blob) {
  if (!dishId || !blob) return false;
  return (await run("readwrite", (store) => store.put(blob, dishId))).ok;
}

export async function deleteImage(dishId) {
  if (!dishId) return false;
  return (await run("readwrite", (store) => store.delete(dishId))).ok;
}

/** מזהי כל המנות שיש להן תמונה. */
export async function imageIds() {
  const { ok, value } = await run("readonly", (store) => store.getAllKeys());
  return ok && Array.isArray(value) ? value : [];
}

/* ---------- כתובות להצגה ---------- */

/* Blob URL חייב שחרור, אחרת הזיכרון נשאר תפוס עד רענון הדף — והמסך
   הזה נבנה מחדש בכל שינוי מצב. המפה מחזיקה כתובת אחת למנה ומשחררת
   אותה כשהתמונה מוחלפת. */
const urls = new Map();

/**
 * כתובת להצגה, או null כשאין תמונה.
 * @returns {Promise<string|null>}
 */
export async function imageUrl(dishId) {
  if (urls.has(dishId)) return urls.get(dishId);
  const blob = await getImage(dishId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(dishId, url);
  return url;
}

/** משחרר את הכתובת השמורה. נקרא אחרי החלפה או מחיקה. */
export function forgetUrl(dishId) {
  const url = urls.get(dishId);
  if (!url) return;
  URL.revokeObjectURL(url);
  urls.delete(dishId);
}
