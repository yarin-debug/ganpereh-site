/* מנוע הסנכרון — מחבר בין ה-store המקומי לשרת.

   ── העיקרון: האחסון המקומי נשאר הבעלים ─────────────────────────────
   השרת אינו מקור האמת אלא יעד סנכרון. האפליקציה נכתבה מסביב לעבודה
   בלי קליטה — רשימת הקניות נפתחת בסופר — וסנכרון שהופך את הרשת
   לתנאי לקריאה היה שובר בדיוק את התכונה שבגללה היא נבנתה.

   לכן: כל קריאה וכתיבה ממשיכות לעבור דרך localStorage כמו קודם.
   הקובץ הזה רץ *לצדן*, ומה שהוא לא מספיק לעשות פשוט יקרה בפעם הבאה.
   כישלון רשת אינו מצב שגיאה כאן; הוא מצב רגיל.

   ── סדר הפעולות, וזה הלב ───────────────────────────────────────────
   1. משיכה של מה שהשתנה בשרת
   2. חישוב מה השתנה מקומית מאז הסנכרון האחרון
   3. החלת המשיכה — **פרט למפתחות ששונו מקומית**
   4. דחיפת המקומיים

   שלב 3 הוא מה שהופך את המיזוג לנכון. בלעדיו משיכה שקדמה לדחיפה
   הייתה מבטלת את מה שהמשתמש הרגע עשה, ואז דוחפת את הביטול בחזרה. */

import { syncConfigured, SYNC_STATE_KEY } from "./config.js";
import { signedIn } from "./auth.js";
import { AuthError, myHouseholds, createHousehold, pullSince, pushChanges } from "./rest.js";
import {
  flattenState,
  fingerprintAll,
  diffAgainst,
  applyRows,
  rowKey,
  remoteSchemaVersion,
} from "./entities.js";

/* המתנה אחרי שינוי לפני דחיפה. הקלדה בשם מנה מייצרת עשרות שינויי
   מצב, וסנכרון לכל אחד מהם היה מציף את השרת בגרסאות של אותה מילה
   באמצע כתיבה. שתי שניות זה מספיק כדי לתפוס "סיים להקליד". */
const PUSH_DEBOUNCE_MS = 2000;

let householdId = null;
let lastRev = 0;
let fingerprints = new Map(); // rowKey → טביעה של הערך בסנכרון האחרון
let status = { state: "idle", message: null, at: null };
let listeners = new Set();
let pushTimer = null;
let running = null;

/* ---------- התמדה של מצב הסנכרון ---------- */

function persist() {
  try {
    localStorage.setItem(
      SYNC_STATE_KEY,
      JSON.stringify({ householdId, lastRev, fingerprints: [...fingerprints] }),
    );
  } catch {
    /* אחסון חסום — הסנכרון הבא יתחיל מאפס ויידחוף הכל מחדש. מבזבז,
       אבל לא מזיק: אותם ערכים בדיוק נכתבים שוב. */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    householdId = parsed?.householdId || null;
    lastRev = Number(parsed?.lastRev) || 0;
    fingerprints = new Map(Array.isArray(parsed?.fingerprints) ? parsed.fingerprints : []);
  } catch {
    /* מצב סנכרון פגום — מתחילים מאפס. לא נוגעים בנתוני המשתמש. */
  }
}

restore();

/* ---------- מצב לתצוגה ---------- */

function setStatus(state, message) {
  status = { state, message: message || null, at: Date.now() };
  for (const fn of listeners) {
    try {
      fn(status);
    } catch (error) {
      console.error("מאזין סנכרון נכשל", error);
    }
  }
}

export function syncStatus() {
  return status;
}

export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function householdReady() {
  return Boolean(householdId);
}

export function currentHousehold() {
  return householdId;
}

/** נקרא אחרי הצטרפות לקוד הזמנה — משק בית אחר, היסטוריה אחרת. */
export function adoptHousehold(id) {
  householdId = id;
  lastRev = 0;
  // הטביעות ריקות בכוונה: מול משק בית חדש כל מפתח מקומי הוא שינוי
  // שטרם נשלח. כך התוכנית שכבר במכשיר מצטרפת למשק הבית במקום
  // להיעלם בהחלה הראשונה.
  fingerprints = new Map();
  persist();
}

/* ---------- הסנכרון ---------- */

/** משק בית קיים, או אחד חדש בפעם הראשונה. */
async function ensureHousehold() {
  if (householdId) return householdId;
  const existing = await myHouseholds();
  householdId = existing[0] || (await createHousehold());
  persist();
  return householdId;
}

/**
 * סבב סנכרון מלא.
 *
 * לעולם לא זורק. הסנכרון הוא תוספת, וכישלון שלו לא אמור להגיע
 * לזרימת האפליקציה — רק להודעת מצב שאפשר להתעלם ממנה.
 */
export async function syncNow(store) {
  if (!syncConfigured() || !signedIn()) return false;
  // סכמה עתידית באחסון המקומי כבר נעלה את הכתיבה. סנכרון שהיה מושך
  // לתוך מצב נעול היה עוקף בדיוק את ההגנה הזו.
  if (store.status().writeLocked) return false;
  if (running) return running;

  running = (async () => {
    try {
      setStatus("syncing");
      const id = await ensureHousehold();

      const rows = await pullSince(id, lastRev);

      // גרסה חדשה יותר כתבה לשרת — אותו כלל כמו נעילת הכתיבה ב-store:
      // הגרסה הזו לא מכירה את השדות החדשים, וכל דחיפה שלה הייתה
      // חותכת אותם מהמכשיר של האדם השני.
      const remoteSchema = remoteSchemaVersion(rows);
      if (remoteSchema !== null && remoteSchema > (store.state.schema_version ?? 0)) {
        setStatus(
          "locked",
          "מכשיר אחר במשק הבית מריץ גרסה חדשה יותר של האפליקציה. הסנכרון מושהה כדי לא לפגוע בנתונים שלו. רענן את האפליקציה כדי לקבל את הגרסה החדשה.",
        );
        return false;
      }

      const flat = flattenState(store.state);
      const localChanges = diffAgainst(fingerprints, flat);
      const dirty = new Set(localChanges.map((c) => rowKey(c.entity, c.entity_key)));

      if (rows.length) {
        const merged = applyRows(store.state, rows, dirty);
        store.update((state) => {
          Object.assign(state, merged);
        });
        lastRev = rows.reduce((max, row) => Math.max(max, Number(row.rev) || 0), lastRev);
      }

      if (localChanges.length) {
        const highest = await pushChanges(id, localChanges);
        // ה-rev שחזר הוא של הכתיבות שלנו. קידום המונה מעליו מונע
        // משיכה מיותרת של מה שאנחנו עצמנו הרגע כתבנו.
        lastRev = Math.max(lastRev, highest);
      }

      // הטביעות נלקחות מהמצב **אחרי** המיזוג, לא מזה שנדחף. אחרת
      // מה שנמשך מהאדם השני היה נראה כשינוי מקומי בסבב הבא ונדחף
      // בחזרה אליו — הלוך ושוב בלי סוף.
      fingerprints = fingerprintAll(flattenState(store.state));
      persist();

      setStatus("ok");
      return true;
    } catch (error) {
      if (error instanceof AuthError) {
        setStatus("signed_out", "ההתחברות פגה. יש להתחבר מחדש כדי לחדש את הסנכרון.");
      } else {
        // מכוון: לא "שגיאה" אלא "לא עכשיו". הנתונים במכשיר שלמים,
        // וזה מה שחשוב לומר לאדם שקורא את זה בסופר בלי קליטה.
        setStatus(
          "offline",
          "אין כרגע חיבור לסנכרון. הנתונים נשמרים במכשיר וייסנכרנו כשיהיה חיבור.",
        );
      }
      return false;
    } finally {
      running = null;
    }
  })();

  return running;
}

/** דחיפה מושהית — נקרא בכל שינוי מצב. */
export function scheduleSync(store) {
  if (!syncConfigured() || !signedIn()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(store), PUSH_DEBOUNCE_MS);
}

/**
 * חיווט הסנכרון לאפליקציה.
 *
 * מכוון להיקרא פעם אחת. כשהסנכרון אינו מוגדר הפונקציה יוצאת מיד ולא
 * רושמת דבר — בלי מאזינים, בלי טיימרים, בלי בקשות. האפליקציה
 * מתנהגת בדיוק כמו לפני שהקובץ הזה נולד.
 */
export function attachSync(store) {
  if (!syncConfigured()) return;

  store.subscribe(() => scheduleSync(store));

  // חזרה למסך היא הרגע הסביר ביותר שבו האדם השני כבר שינה משהו.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncNow(store);
  });
  addEventListener("online", () => syncNow(store));

  if (signedIn()) syncNow(store);
}
