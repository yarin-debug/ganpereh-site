/* מצב המשתמש ושכבת ההתמדה.

   כללי היסוד (מהחוזה):
   - נתוני משתמש לא נדרסים לעולם. JSON פגום מגובה לפני שנטען מצב התחלתי,
     סכמה עתידית לא מוכרת נועלת את הכתיבה, ושדות שהגרסה הזו לא מכירה
     נשמרים כמו שהם במקום להיחתך.
   - שם המפתח והאחסון מוזרקים. עמוד הבדיקות רץ מול מפתח ייעודי ולעולם
     לא נוגע בייצור. */

import { DEFAULT_PROFILES } from "./data.js";

export const SCHEMA_VERSION = 1;
export const PROD_KEY = "gp_meals_v1";

const MAX_CORRUPT_BACKUPS = 5;
const SLOT_STATUSES = new Set(["planned", "cooked", "skipped", "ate_out"]);

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

/** שמות הימים, מיושרים לאינדקס שמחזיר weekDates. */
export const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** שבעת תאריכי השבוע, ראשון עד שבת. */
export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function slotKey(isoDate, meal = "dinner") {
  return `${isoDate}.${meal}`;
}

/**
 * מוודא ש-week_start הוא יום ראשון אמיתי. מחרוזת בפורמט תקין אך תאריך
 * בלתי אפשרי ("2026-99-99") הייתה מקפיאה את המתכנן בשנה אקראית, כי
 * הגלגול קדימה משווה מחרוזות ולעולם לא היה מתקן ערך עתידי.
 */
function normalizeWeekStart(value, fallback) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (isoLocal(date) !== value) return fallback;
  return date.getDay() === 0 ? value : isoLocal(sundayOf(date));
}

/* ---------- מצב ---------- */

function defaultState(now) {
  return {
    schema_version: SCHEMA_VERSION,
    plan: { week_start: isoLocal(sundayOf(now)), slots: {}, checked: {} },
    profiles: structuredClone(DEFAULT_PROFILES),
    pantry: {},
  };
}

/**
 * סימוני רשימת הקניות. נשמרים רק כ-true — מפתח שכבוי נמחק במקום
 * להישמר כ-false, כך שהאובייקט לא תופח עם כל פריט שאי פעם נראה.
 */
function coerceChecked(rawChecked) {
  const out = {};
  if (!rawChecked || typeof rawChecked !== "object") return out;
  for (const [key, value] of Object.entries(rawChecked)) {
    if (value === true) out[key] = true;
  }
  return out;
}

/**
 * מתקן משבצות פגומות במקום לתת להן להפיל את הרינדור. משבצת שנשמרה בלי
 * eaters תקין הייתה זורקת בתוך הרינדור — ומכיוון שהמסך מתנקה לפני
 * הרינדור, התוצאה הייתה מסך ריק שחוזר בכל טעינה בלי דרך מילוט.
 * שדות שלא מוכרים כאן נשמרים כמו שהם.
 */
function coerceSlots(rawSlots, profileIds) {
  const out = {};
  if (!rawSlots || typeof rawSlots !== "object") return out;

  for (const [key, slot] of Object.entries(rawSlots)) {
    if (!slot || typeof slot !== "object" || typeof slot.dish_id !== "string" || !slot.dish_id) {
      continue;
    }
    const eaters = Array.isArray(slot.eaters)
      ? slot.eaters.filter((id) => typeof id === "string")
      : [];
    const servings = Number(slot.servings);
    const safeEaters = eaters.length ? eaters : profileIds.slice();
    out[key] = {
      ...slot,
      servings:
        Number.isFinite(servings) && servings > 0 ? servings : Math.max(1, safeEaters.length),
      eaters: safeEaters,
      status: SLOT_STATUSES.has(slot.status) ? slot.status : "planned",
    };
  }
  return out;
}

function coerceProfiles(rawProfiles) {
  if (!Array.isArray(rawProfiles)) return null;
  const clean = rawProfiles
    .filter((p) => p && typeof p === "object" && typeof p.id === "string")
    .map((p) => ({ ...p, targets: p.targets && typeof p.targets === "object" ? p.targets : {} }));
  return clean.length ? clean : null;
}

/** משלים שדות חסרים בלי לדרוס מה שקיים — קלט חלקי הוא מצב תקין. */
function coerceState(raw, now) {
  const base = defaultState(now);
  if (!raw || typeof raw !== "object") return base;

  const plan = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
  const profiles = coerceProfiles(raw.profiles) || base.profiles;
  const profileIds = profiles.map((p) => p.id);

  // פריסת raw ו-plan שומרת שדות שהגרסה הזו לא מכירה — גרסה חדשה יותר
  // שהוסיפה שדה באותה סכמה לא תאבד אותו בטעינה מגרסה ישנה במטמון.
  return {
    ...raw,
    schema_version: SCHEMA_VERSION,
    plan: {
      ...plan,
      week_start: normalizeWeekStart(plan.week_start, base.plan.week_start),
      slots: coerceSlots(plan.slots, profileIds),
      checked: coerceChecked(plan.checked),
    },
    profiles,
    pantry: raw.pantry && typeof raw.pantry === "object" ? raw.pantry : {},
  };
}

/* ---------- אחסון ---------- */

/**
 * גישה ל-localStorage זורקת SecurityError כשחסימת אחסון פעילה (ספארי
 * "חסום את כל העוגיות", גלישה פרטית ישנה, חלק מה-webviews). בלי הגנה כאן
 * כל האפליקציה מתה בטעינה במקום לעבוד בזיכרון עם אזהרה כנה.
 */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    __inMemory: true,
  };
}

function resolveStorage() {
  try {
    const probe = "__gp_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

/* ---------- ה-store ---------- */

/**
 * @param {object} [options]
 * @param {string} [options.key]      מפתח localStorage. ברירת מחדל: הייצור.
 * @param {Storage} [options.storage] מנוע אחסון. מוזרק בבדיקות.
 * @param {() => Date} [options.now]  שעון. מוזרק בבדיקות גלגול שבוע.
 */
export function createStore({ key = PROD_KEY, storage, now = () => new Date() } = {}) {
  const engine = storage || resolveStorage();
  const listeners = new Set();

  let state = null;
  let writeLocked = false; // סכמה עתידית — לא נוגעים בנתונים לכל אורך הסשן
  let saveFailed = false; // setItem זרק (מכסה מלאה / גלישה פרטית)
  let recovered = false; // נטען מצב התחלתי אחרי JSON פגום
  let backupSaved = false; // האם הגיבוי של הפגום באמת נכתב
  let weekRolled = false; // week_start התקדם לשבוע הנוכחי
  let persistRequested = false;
  let lastWritten = null; // מה הטאב הזה כתב לאחרונה — לזיהוי כתיבה מטאב אחר

  function readRaw() {
    try {
      return engine.getItem(key);
    } catch {
      return null;
    }
  }

  /** מחזיר true רק כשהגיבוי באמת נכתב — הבאנר לא מבטיח מה שלא קרה. */
  function backupCorrupt(raw) {
    for (let i = 1; i <= MAX_CORRUPT_BACKUPS; i++) {
      const backupKey = i === 1 ? `${key}__corrupt` : `${key}__corrupt_${i}`;
      let taken = true;
      try {
        taken = engine.getItem(backupKey) !== null;
      } catch {
        return false;
      }
      if (!taken) {
        try {
          engine.setItem(backupKey, raw);
          return true;
        } catch {
          return false;
        }
      }
    }
    return false; // כל חמשת המקומות תפוסים
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
    // גיבוי שנכשל = המקור הפגום הוא העותק היחיד. לא דורסים אותו.
    if (recovered && !backupSaved) return false;
    try {
      const serialized = JSON.stringify(state);
      engine.setItem(key, serialized);
      lastWritten = serialized;
      saveFailed = false;
      requestPersist();
      return true;
    } catch {
      saveFailed = true;
      return false;
    }
  }

  /** מאזין שנופל לא מפיל את השאר ולא בולע את תוצאת השמירה. */
  function notify() {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch (error) {
        console.error("מאזין נכשל", error);
      }
    }
  }

  /** מגלגל את השבוע קדימה אם עבר יום ראשון. מחזיר האם משהו השתנה. */
  function rollWeek() {
    const currentSunday = isoLocal(sundayOf(now()));
    if (state.plan.week_start === currentSunday) return false;
    // גם שבוע עתידי (שעון מוטה) נתפס — לא רק שבוע שעבר.
    state.plan.week_start = currentSunday;
    // סימוני הקנייה שייכים לרשימה של שבוע מסוים. בלי האיפוס הזה הרשימה
    // החדשה הייתה נפתחת עם חצי מהפריטים כבר מסומנים, ממה שנקנה בשבוע שעבר.
    state.plan.checked = {};
    weekRolled = true;
    return true;
  }

  function load() {
    const nowDate = now();
    const raw = readRaw();

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
      backupSaved = backupCorrupt(raw);
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
    lastWritten = raw;

    // משבצות ישנות נשארות בבלוב תחת מפתחות התאריך שלהן.
    if (rollWeek()) write();
  }

  load();

  const store = {
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

    /**
     * בדיקה מחודשת מול המכשיר: קולט כתיבה מטאב אחר ומגלגל שבוע כשהטאב
     * היה פתוח מעבר לחצות של מוצ"ש. בלי זה הטאב ממשיך להציג שבוע ישן
     * ומתייק לתוכו ארוחות שייעלמו מכל המסכים בטעינה הבאה.
     */
    refresh() {
      if (writeLocked) return false;
      const raw = readRaw();
      let changed = false;

      if (raw !== null && raw !== lastWritten) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && typeof parsed.schema_version === "number") {
            if (parsed.schema_version > SCHEMA_VERSION) {
              writeLocked = true;
            } else {
              state = coerceState(parsed, now());
            }
            lastWritten = raw;
            changed = true;
          }
        } catch {
          /* בלוב פגום מטאב אחר — נשארים עם המצב שבזיכרון */
        }
      }

      if (!writeLocked && rollWeek()) {
        write();
        changed = true;
      }
      if (changed) notify();
      return changed;
    },

    status() {
      return {
        writeLocked,
        saveFailed,
        recovered,
        backupSaved,
        weekRolled,
        inMemory: !!engine.__inMemory,
      };
    },

    /** ההודעה הקבועה שמוצגת למעלה, או null כשאין מה לומר. */
    statusMessage() {
      if (writeLocked) {
        return "הנתונים במכשיר נשמרו בגרסה חדשה יותר של האפליקציה. כדי לא לפגוע בהם, שום דבר כאן לא נשמר. פתח את האפליקציה במכשיר או בדפדפן שבו הגרסה החדשה מותקנת.";
      }
      if (engine.__inMemory) {
        return "הדפדפן חוסם שמירה מקומית באתר הזה. אפשר לעבוד, אבל שום דבר לא יישמר לפעם הבאה.";
      }
      if (recovered && !backupSaved) {
        return "הנתונים השמורים לא היו קריאים ולא הצלחנו לגבות אותם, ולכן איננו כותבים עליהם. המקור עדיין במכשיר.";
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

  // כתיבה מטאב אחר על אותו מכשיר — בלי זה כל טאב כותב את הבלוב השלם
  // שלו והאחרון מוחק בשקט את התוכנית של הראשון.
  if (typeof window !== "undefined" && engine === globalThis.localStorage) {
    window.addEventListener("storage", (event) => {
      if (event.key === key) store.refresh();
    });
  }

  return store;
}

/* ה-store של האפליקציה עצמה — יחיד, ונוצר בפעם הראשונה שמבקשים אותו.
   עמוד הבדיקות לא נוגע בו: הוא בונה store משלו עם מפתח ואחסון מוזרקים. */
let appStore = null;

export function getStore() {
  if (!appStore) appStore = createStore();
  return appStore;
}
