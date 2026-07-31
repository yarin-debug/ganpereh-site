/* העברת תמונות מנה בין מכשירים — לוגיקה טהורה, בלי DOM ובלי IndexedDB.

   ── למה זה קיים ─────────────────────────────────────────────────────
   האחסון בדפדפן משויך ל-origin (הצירוף של פרוטוקול, דומיין ונתיב
   השורש שממנו האפליקציה מוגשת). מעבר לכתובת חדשה הוא origin חדש:
   הקוד נודד, הנתונים לא. קובץ הגיבוי כבר פותר את זה לתוכנית, למזווה
   ולמנות — והתמונות היו הדבר היחיד שאין ממנו דרך חזרה, כי הן יושבות
   ב-IndexedDB ולא ב-localStorage ולכן אינן בקובץ הגיבוי.

   ── למה קובץ נפרד, ולא שדה בתוך קובץ הגיבוי ─────────────────────────
   ההחלטה שתמונות אינן נכנסות לגיבוי נשארת בתוקף, ומכוונת לשימוש ולא
   לגודל: הגיבוי נועד להישלח בהודעה ולהיווצר שוב ושוב, ולכן הוא חייב
   להישאר קטן וצפוי. קובץ התמונות נשלף בדיוק פעמיים בחיי מכשיר —
   ביציאה ובכניסה — ומותר לו להיות גדול.

   פיצול לשני קבצים גם משאיר את ההבטחה שליד כפתור הגיבוי נכונה כמו
   שהיא. גיבוי שפתאום מכיל תמונות היה הופך את המשפט "תמונות מנה לא
   נכנסות אליו" לשקר, ואת הקובץ למשהו שאי אפשר לשלוח.

   ── הייבוא אינו מוחק ────────────────────────────────────────────────
   בניגוד לייבוא הגיבוי, שמחליף את כל המצב, כאן כל תמונה נכתבת לפי
   מזהה המנה שלה ותמונות שאינן בקובץ נשארות. אין כאן את הסכנה שבגללה
   ייבוא הגיבוי דורש אישור עם השוואת מספרים. */

import { BACKUP_APP } from "./backup.js";

/** מסמן את סוג הקובץ. אותו `app` כמו הגיבוי, כדי ששניהם יזוהו כשלנו. */
export const IMAGES_KIND = "images";

/**
 * מפרק data URL ל-mime ול-base64.
 *
 * מאחסנים את ה-data URL השלם ולא רק את ה-base64 כי הוא מתאר את עצמו:
 * מי שיפתח את הקובץ בעוד שנה רואה `data:image/jpeg;base64,` ויודע מה
 * הוא מחזיק, בלי להסתמך על שדה נפרד שאולי לא נכתב.
 *
 * @returns {{mime: string, base64: string}|null} null כשהמחרוזת אינה data URL של תמונה
 */
export function splitDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mime, base64] = match;
  if (!mime.startsWith("image/") || !base64) return null;
  return { mime, base64 };
}

/**
 * העטיפה שנשמרת לקובץ.
 *
 * אותה צורה כמו קובץ הגיבוי (`app`, `exported_at`, ואז התוכן), כדי
 * ששני הקבצים ייראו כמשפחה אחת למי שפותח אותם.
 *
 * @param {Array<{dishId: string, dataUrl: string}>} entries
 */
export function buildImageBundle(entries, todayIso) {
  const images = {};
  for (const entry of entries || []) {
    if (!entry || !entry.dishId) continue;
    if (!splitDataUrl(entry.dataUrl)) continue;
    images[entry.dishId] = entry.dataUrl;
  }
  return {
    app: BACKUP_APP,
    kind: IMAGES_KIND,
    exported_at: todayIso,
    images,
  };
}

/**
 * שם הקובץ.
 *
 * באנגלית מאותו נימוק כמו שם קובץ הגיבוי: הוא עובר בין מערכות קבצים
 * ואפליקציות הודעות, ושם עברי חוזר משם מדי פעם כג'יבריש או חתוך.
 */
export function imageBundleFileName(todayIso) {
  return `gp-meals-images-${todayIso}.json`;
}

/**
 * קורא קובץ תמונות ומאמת אותו.
 *
 * @returns {{ok: true, images: Array<{dishId, mime, base64}>}|{ok: false, error: string}}
 *
 * ── קובץ גיבוי שנבחר בטעות מקבל הודעה משלו ──────────────────────────
 * שני הקבצים הם JSON, נוצרים באותו מסך ונשמרים באותה תיקייה — כלומר
 * הבלבול ביניהם אינו תקלה נדירה אלא הטעות הצפויה. "הקובץ אינו תקין"
 * היה שולח מישהו לחפש קובץ פגום שאינו קיים.
 */
export function readImageBundle(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "הקובץ אינו קובץ תמונות תקין. ודא שבחרת את קובץ ה-JSON שיוצא מכאן.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "הקובץ אינו קובץ תמונות של מתכנן הארוחות." };
  }

  // קובץ גיבוי מזוהה לפי מה שיש בו, ולא לפי מה שחסר: `state` הוא
  // השדה שקיים רק בו.
  if (!parsed.images && parsed.state) {
    return {
      ok: false,
      error: "זהו קובץ הגיבוי ולא קובץ התמונות. את הגיבוי טוענים בכפתור שמעל.",
    };
  }

  if (!parsed.images || typeof parsed.images !== "object" || Array.isArray(parsed.images)) {
    return { ok: false, error: "הקובץ אינו קובץ תמונות של מתכנן הארוחות." };
  }

  const images = [];
  for (const [dishId, dataUrl] of Object.entries(parsed.images)) {
    const parts = splitDataUrl(dataUrl);
    // שורה פגומה מדלגת ואינה מפילה את הקובץ. תמונה אחת שנחתכה בהעתקה
    // אינה סיבה לוותר על התשע שנשארו שלמות.
    if (parts) images.push({ dishId, mime: parts.mime, base64: parts.base64 });
  }

  if (!images.length) {
    return { ok: false, error: "אין בקובץ אף תמונה שאפשר לטעון." };
  }

  return { ok: true, images };
}

/**
 * base64 → Blob.
 *
 * פענוח ידני ולא `fetch(dataUrl)`: ה-service worker מיירט `fetch`,
 * וכתובת data חוצה אותו בדרך שתלויה בפרטי המימוש. שמונה שורות כאן
 * עדיפות על תלות בהתנהגות שאי אפשר לבדוק מקומית.
 *
 * @returns {Blob|null} null כשה-base64 פגום
 */
export function base64ToBlob(base64, mime) {
  let binary;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
