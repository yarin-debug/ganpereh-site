/* מצב המשתמש ושכבת ההתמדה.

   כללי היסוד (מהחוזה):
   - נתוני משתמש לא נדרסים לעולם. JSON פגום מגובה לפני שנטען מצב התחלתי,
     וסכמה עתידית לא מוכרת נועלת את הכתיבה במקום להחליף אותה.
   - שם המפתח מוזרק. עמוד הבדיקות רץ מול מפתח ייעודי ולעולם לא נוגע בייצור. */

import { DEFAULT_PROFILES } from "./data.js";

export const SCHEMA_VERSION = 1;
export const PROD_KEY = "gp_meals_v1";

const MAX_CORRUPT_BACKUPS = 5;

/* ---------- תאריכים ---------- */

/** תאריך ISO מקומי. לא toISOString — הוא מחזיר UTC ומזיז יום סביב חצות. */
export function isoLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** יום ראשון של השבוע שבו נופל התאריך. השבוע בישראל מתחיל בראשון. */
export function sundayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return isoLocal(date);
}

/** שבעת תאריכי השבוע, ראשון עד שבת. */
export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function slotKey(isoDate, meal = "dinner") {
  return `${isoDate}.${meal}`;
}

/* ---------- מצב ---------- */

function defaultState(now) {
  return {
    schema_version: SCHEMA_VERSION,
    plan: { week_start: isoLocal(sundayOf(now)), slots: {} },
    profiles: structuredClone(DEFAULT_PROFILES),
    pantry: {},
  };
}

/** משלים שדות חסרים בלי לדרוס מה שקיים — קלט חלקי הוא מצב תקין. */
function coerceState(raw, now) {
  const base = defaultState(now);
  if (!raw || typeof raw !== "object") return base;
  const plan = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
  return {
    schema_version: SCHEMA_VERSION,
    plan: {
      week_start:
        typeof plan.week_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(plan.week_start)
          ? plan.week_start
          : base.plan.week_start,
      slots: plan.slots && typeof plan.slots === "object" ? plan.slots : {},
    },
    profiles: Array.isArray(raw.profiles) && raw.profiles.length ? raw.profiles : base.profiles,
    pantry: raw.pantry && typeof raw.pantry === "object" ? raw.pantry : {},
  };
}

/* ---------- ה-store ---------- */

/**
 * @param {object} [options]
 * @param {string} [options.key]      מפתח localStorage. ברירת מחדל: הייצור.
 * @param {Storage} [options.storage] מנוע אחסון. מוזרק בבדיקות.
 * @param {() => Date} [options.now]  שעון. מוזרק בבדיקות גלגול שבוע.
 */
export function createStore({
  key = PROD_KEY,
  storage = localStorage,
  now = () => new Date(),
} = {}) {
  const listeners = new Set();

  let state = null;
  let writeLocked = false; // סכמה עתידית — לא נוגעים בנתונים לכל אורך הסשן
  let saveFailed = false; // setItem זרק (מכסה מלאה / גלישה פרטית)
  let recovered = false; // נטען מצב התחלתי אחרי גיבוי של JSON פגום
  let weekRolled = false; // week_start התקדם לשבוע הנוכחי בטעינה
  let persistRequested = false;

  function backupCorrupt(raw) {
    for (let i = 1; i <= MAX_CORRUPT_BACKUPS; i++) {
      const backupKey = i === 1 ? `${key}__corrupt` : `${key}__corrupt_${i}`;
      if (storage.getItem(backupKey) === null) {
        try {
          storage.setItem(backupKey, raw);
        } catch {
          /* אין מקום לגיבוי — עדיף מצב התחלתי מאשר קריסה */
        }
        return;
      }
    }
  }

  function requestPersist() {
    if (persistRequested) return;
    persistRequested = true;
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }

  function write() {
    if (writeLocked) return false;
    try {
      storage.setItem(key, JSON.stringify(state));
      saveFailed = false;
      requestPersist();
      return true;
    } catch {
      saveFailed = true;
      return false;
    }
  }

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function load() {
    const nowDate = now();
    const raw = storage.getItem(key);

    if (raw === null) {
      state = defaultState(nowDate);
      return;
    }

    let parsed = null;
    let broken = false;
    try {
      parsed = JSON.parse(raw);
    } catch {
      broken = true;
    }
    if (
      !broken &&
      (!parsed || typeof parsed !== "object" || typeof parsed.schema_version !== "number")
    ) {
      broken = true;
    }

    if (broken) {
      backupCorrupt(raw);
      recovered = true;
      state = defaultState(nowDate);
      return;
    }

    if (parsed.schema_version > SCHEMA_VERSION) {
      // גרסה חדשה יותר של האפליקציה כתבה כאן. לא נוגעים בנתונים ולא כותבים.
      writeLocked = true;
      state = defaultState(nowDate);
      return;
    }

    state = coerceState(parsed, nowDate);

    // גלגול שבוע: משבצות ישנות נשארות בבלוב תחת מפתחות התאריך שלהן.
    const currentSunday = isoLocal(sundayOf(nowDate));
    if (state.plan.week_start < currentSunday) {
      state.plan.week_start = currentSunday;
      weekRolled = true;
      write();
    }
  }

  load();

  return {
    get state() {
      return state;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** מחיל שינוי, שומר, ומודיע. מחזיר האם השמירה הצליחה. */
    update(mutator) {
      mutator(state);
      const ok = write();
      notify();
      return ok;
    },

    status() {
      return { writeLocked, saveFailed, recovered, weekRolled };
    },

    /** ההודעה הקבועה שמוצגת למעלה, או null כשאין מה לומר. */
    statusMessage() {
      if (writeLocked) {
        return "הנתונים במכשיר נשמרו בגרסה חדשה יותר של האפליקציה. כדי לא לפגוע בהם, השינויים כאן לא נשמרים — רענן את הדף.";
      }
      if (saveFailed) {
        return "השמירה נכשלה (ייתכן שאין מקום פנוי במכשיר). אפשר להמשיך לעבוד, אבל השינויים לא יישמרו לרענון הבא.";
      }
      if (recovered) {
        return "הנתונים השמורים לא היו קריאים. גיבוי שלהם נשמר במכשיר והתחלנו משבוע ריק.";
      }
      return null;
    },
  };
}

/* ה-store של האפליקציה עצמה — יחיד, ונוצר בפעם הראשונה שמבקשים אותו.
   עמוד הבדיקות לא נוגע בו: הוא בונה store משלו עם מפתח ואחסון מוזרקים. */
let appStore = null;

export function getStore() {
  if (!appStore) appStore = createStore();
  return appStore;
}
