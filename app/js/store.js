/* מצב המשתמש ושכבת ההתמדה.

   כללי היסוד (מהחוזה):
   - נתוני משתמש לא נדרסים לעולם. JSON פגום מגובה לפני שנטען מצב התחלתי,
     סכמה עתידית לא מוכרת נועלת את הכתיבה, ושדות שהגרסה הזו לא מכירה
     נשמרים כמו שהם במקום להיחתך.
   - שם המפתח והאחסון מוזרקים. עמוד הבדיקות רץ מול מפתח ייעודי ולעולם
     לא נוגע בייצור. */

import { DEFAULT_PROFILES } from "./data.js";
import { coerceTargets, activeProfiles } from "./profiles.js";

export const SCHEMA_VERSION = 1;
export const PROD_KEY = "gp_meals_v1";

const MAX_CORRUPT_BACKUPS = 5;
const MAX_IMPORT_BACKUPS = 3;
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
    dishes: {},
    ingredients: {},
    prefs: defaultPrefs(),
    // התקנה טרייה עוברת דרך מסך הפתיחה. הערך ההפוך, למי שכבר עובד עם
    // האפליקציה, נקבע ב-coerceState — ההסבר המלא שם.
    onboarded: false,
  };
}

/* ---------- העדפות ---------- */

/* מזהי הארוחות. מקור האמת לסדר התצוגה הוא MEALS ב-plan.js, אבל plan.js
   מייבא מכאן — ולכן כאן יושבת רשימת האימות בלבד, בלי הסדר. מה שנשמר
   הוא קבוצה; הסדר שבו היא מוצגת נגזר תמיד מ-MEALS. */
const MEAL_IDS = ["breakfast", "lunch", "dinner"];

function defaultPrefs() {
  return { meals: [...MEAL_IDS] };
}

/**
 * העדפת הארוחות שמתכננים.
 *
 * רשימה ריקה אינה מצב תקין: היא הייתה מותירה את מסך היום בלי שום ארוחה
 * לבחור, ובלי דרך לצאת מזה חוץ מהגדרה מחדש. לכן היא נופלת חזרה לשלוש.
 *
 * ברירת המחדל היא **כל השלוש** גם למי שאין לו את השדה — כלומר לכל מי
 * שהתקין את האפליקציה לפני שההעדפה נולדה. הוא רואה היום את שלוש
 * הארוחות, וגרסה שהייתה מצמצמת אותו בשקט לארוחת ערב הייתה מסתירה לו
 * ארוחות שכבר תוכננו.
 */
function coercePrefs(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const meals = Array.isArray(source.meals) ? source.meals.filter((m) => MEAL_IDS.includes(m)) : [];
  // שדות העדפה שהגרסה הזו לא מכירה נשמרים כמו שהם, כמו בשאר המצב.
  return { ...source, meals: meals.length ? [...new Set(meals)] : [...MEAL_IDS] };
}

/* ---------- קטלוג המשתמש ---------- */

const BASE_UNITS = new Set(["g", "ml", "unit"]);
const KOSHER_TYPES = new Set(["meat", "dairy", "parve"]);
const EFFORTS = new Set(["low", "medium", "high"]);
const NUTRITION_FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"];

/** מספר חיובי או null. משמש למשקל יחידה ולצפיפות, ששניהם אופציונליים. */
function positiveOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ערכי תזונה ל-100. שדה חלקי נשמר כמו שהוא ולא מושלם באפס — מנוע
 * המאקרו מסמן מנה כזו כחלקית, וזה עדיף על מספר שנראה כמו ידיעה.
 */
function coerceNutrition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const field of NUTRITION_FIELDS) {
    const n = Number(raw[field]);
    if (Number.isFinite(n) && n >= 0) out[field] = n;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * המזווה.
 *
 * ── שתי צורות אחסון, וזה מכוון ──────────────────────────────────────
 * שתי גרסאות של האפליקציה כתבו כאן צורות שונות: מספר חשוף (`300`),
 * שפירושו "כמות ביחידת הבסיס של המצרך", ואובייקט (`{qty, unit}`)
 * שנושא יחידה משלו ומאפשר להזין "2 יחידות בצל".
 *
 * הפונקציה קולטת את שתיהן. בלי זה כל גרסה הייתה מוחקת בשקט את המזווה
 * של השנייה — המספר החשוף נזרק כ"לא אובייקט", והאובייקט הפך ל-NaN
 * תחת Number(). מחיקה שקטה של נתוני משתמש היא בדיוק מה שהחוזה של
 * הקובץ הזה אוסר.
 *
 * הצורה הקנונית היא `{qty, unit}`, ו-`unit` חסר פירושו "כבר ביחידת
 * הבסיס" — כך שמספר חשוף עובר הלאה בלי להמציא לו יחידה שלא נכתבה.
 *
 * כמות אפס או שלילית נמחקת: "יש לי 0 בצל" ו"אין לי בצל" הם אותו דבר,
 * ושמירת השורה הייתה מותירה במסך ערימת שורות ריקות.
 */
function coercePantry(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [id, entry] of Object.entries(raw)) {
    // הצורה הישנה: מספר חשוף ביחידת הבסיס.
    if (typeof entry === "number" || typeof entry === "string") {
      const qty = Number(entry);
      if (Number.isFinite(qty) && qty > 0) out[id] = { qty, unit: null };
      continue;
    }

    if (!entry || typeof entry !== "object") continue;
    const qty = Number(entry.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    out[id] = { ...entry, qty, unit: BASE_UNITS.has(entry.unit) ? entry.unit : null };
  }
  return out;
}

function coerceUserIngredients(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [id, ing] of Object.entries(raw)) {
    if (!ing || typeof ing !== "object") continue;
    const name = typeof ing.name_he === "string" ? ing.name_he.trim() : "";
    if (!name) continue; // מצרך בלי שם אינו ניתן להצגה או לבחירה

    out[id] = {
      ...ing,
      id,
      name_he: name,
      aliases: Array.isArray(ing.aliases) ? ing.aliases.filter((a) => typeof a === "string") : [],
      base_unit: BASE_UNITS.has(ing.base_unit) ? ing.base_unit : "g",
      unit_weight_g: positiveOrNull(ing.unit_weight_g),
      density_g_per_ml: positiveOrNull(ing.density_g_per_ml),
      shelf: typeof ing.shelf === "string" && ing.shelf ? ing.shelf : "pantry",
      kosher: KOSHER_TYPES.has(ing.kosher) ? ing.kosher : "parve",
      pantry_staple: ing.pantry_staple === true,
      nutrition_per_100: coerceNutrition(ing.nutrition_per_100),
      archived: ing.archived === true,
    };
  }
  return out;
}

/** שורות המצרכים של מנה. שורה בלי מזהה או בלי כמות תקינה נזרקת. */
function coerceDishIngredients(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.ingredient_id !== "string" || !entry.ingredient_id) continue;
    const qty = Number(entry.qty);
    if (!Number.isFinite(qty) || qty < 0) continue;
    out.push({
      ingredient_id: entry.ingredient_id,
      qty,
      unit: BASE_UNITS.has(entry.unit) ? entry.unit : "g",
    });
  }
  return out;
}

function coerceUserDishes(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;

  for (const [id, dish] of Object.entries(raw)) {
    if (!dish || typeof dish !== "object") continue;
    const name = typeof dish.name_he === "string" ? dish.name_he.trim() : "";
    if (!name) continue;

    const time = Number(dish.time_min);
    out[id] = {
      ...dish,
      id,
      name_he: name,
      kosher: KOSHER_TYPES.has(dish.kosher) ? dish.kosher : "parve",
      effort: EFFORTS.has(dish.effort) ? dish.effort : "medium",
      time_min: Number.isFinite(time) && time >= 0 ? time : 0,
      ingredients: coerceDishIngredients(dish.ingredients),
      prep_ahead: Array.isArray(dish.prep_ahead)
        ? dish.prep_ahead.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim())
        : [],
      tags: Array.isArray(dish.tags) ? dish.tags.filter((t) => typeof t === "string") : [],
      macros_override:
        dish.macros_override && typeof dish.macros_override === "object"
          ? dish.macros_override
          : null,
      archived: dish.archived === true,
    };
  }
  return out;
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
    .filter((p) => p && typeof p === "object" && typeof p.id === "string" && p.id)
    .map((p, index) => ({
      ...p,
      // שם ריק היה משאיר כרטיס בלי כותרת וצ'יפ בלי טקסט. עדיף שם
      // ממלא-מקום שאפשר לזהות ולתקן מאשר ממשק שבור.
      name_he:
        typeof p.name_he === "string" && p.name_he.trim() ? p.name_he.trim() : `אדם ${index + 1}`,
      targets: coerceTargets(p.targets),
      dislikes: Array.isArray(p.dislikes) ? p.dislikes.filter((d) => typeof d === "string") : [],
      archived: p.archived === true,
    }));
  return clean.length ? clean : null;
}

/** משלים שדות חסרים בלי לדרוס מה שקיים — קלט חלקי הוא מצב תקין. */
function coerceState(raw, now) {
  const base = defaultState(now);
  if (!raw || typeof raw !== "object") return base;

  const plan = raw.plan && typeof raw.plan === "object" ? raw.plan : {};
  const profiles = coerceProfiles(raw.profiles) || base.profiles;
  // הגיבוי למשבצת עם רשימת אוכלים ריקה הוא *משק הבית הנוכחי*. פרופיל
  // בארכיון לא נשתל בחזרה לתוך משבצות בטעינה הבאה.
  const active = activeProfiles(profiles);
  const profileIds = (active.length ? active : profiles).map((p) => p.id);

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
    pantry: coercePantry(raw.pantry),
    dishes: coerceUserDishes(raw.dishes),
    ingredients: coerceUserIngredients(raw.ingredients),
    prefs: coercePrefs(raw.prefs),
    /* ── שתי ברירות מחדל לאותו שדה, וזה הלב של מסך הפתיחה ────────────
       defaultState מחזיר false: התקנה טרייה עוברת דרך ההגדרה.
       כאן ההיפוך, כי הפונקציה הזו רצה רק על בלוב *שכבר קיים במכשיר* —
       בלוב שנשמר לפני שמסך הפתיחה נולד שייך בהגדרה למי שכבר עובד עם
       האפליקציה. לשלוח אותו להגדרה מחדש היה מציע לו לבנות משק בית
       שכבר קיים לו, מעל תוכנית שכבר תוכננה.
       רק false מפורש — כלומר מישהו שפתח את המסך ולא סיים אותו —
       מחזיר אותו לשם. */
    onboarded: raw.onboarded !== false,
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

  /**
   * מצניע עותק של בלוב תחת מפתח צדדי.
   *
   * **המקום הראשון הפנוי מנצח, וקיים לא נדרס.** זה מה שמבטיח שהעותק
   * המקורי — זה שנשמר בפעם הראשונה שמשהו השתבש — הוא זה ששורד. דריסה
   * של המקום הראשון הייתה הופכת את הגיבוי השני למחיקה של הראשון,
   * כלומר בדיוק להתנהגות שהוא נועד למנוע.
   *
   * מחזיר true רק כשהעותק באמת נכתב — הבאנר לא מבטיח מה שלא קרה.
   */
  function stashBackup(suffix, raw, maxSlots) {
    for (let i = 1; i <= maxSlots; i++) {
      const backupKey = i === 1 ? `${key}__${suffix}` : `${key}__${suffix}_${i}`;
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
    return false; // כל המקומות תפוסים
  }

  function backupCorrupt(raw) {
    return stashBackup("corrupt", raw, MAX_CORRUPT_BACKUPS);
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

    /**
     * מחליף את כל המצב בתוכן שיובא מקובץ גיבוי.
     *
     * ── הפעולה היחידה באפליקציה שמוחקת נתוני משתמש בכוונה ─────────────
     * ולכן גם היא אינה באמת מוחקת: הבלוב הקיים מוצנע תחת מפתח צדדי
     * *לפני* הכתיבה, ואם ההצנעה הזו נכשלה — הייבוא לא קורה בכלל. אותו
     * כלל בדיוק כמו במסלול ה-JSON הפגום, ומאותה סיבה: גיבוי שנכשל
     * פירושו שהעותק הקיים הוא היחיד, ואז לא נוגעים בו.
     *
     * שלושה מקומות, והראשון לא נדרס. מי שייבא פעמיים ברצף בטעות ימצא
     * את המצב שקדם לייבוא *הראשון* תחת `__before_import` — כלומר את
     * הנתונים האמיתיים שלו, ולא את התוצאה של הטעות הקודמת.
     *
     * @param {object} next מצב גולמי מקובץ (עובר coerceState כמו כל קלט)
     * @returns {{ok: boolean, reason?: "locked"|"backup_failed"|"write_failed"}}
     */
    importState(next) {
      if (writeLocked) return { ok: false, reason: "locked" };

      const current = readRaw();
      if (current !== null && !stashBackup("before_import", current, MAX_IMPORT_BACKUPS)) {
        return { ok: false, reason: "backup_failed" };
      }

      const previous = state;
      state = coerceState(next, now());
      if (!write()) {
        // הכתיבה נכשלה (מכסה מלאה): חוזרים למצב שהיה, אחרת המסך היה
        // מציג נתונים מיובאים שאינם שמורים בשום מקום.
        state = previous;
        return { ok: false, reason: "write_failed" };
      }
      notify();
      return { ok: true };
    },

    /**
     * האם להציג את מסך הפתיחה.
     *
     * מסך שמבקש להגדיר משק בית בזמן שכתיבה ממילא תיכשל הוא הבטחה ריקה:
     * המשתמש היה ממלא שמות ויעדים, לוחץ "אפשר להתחיל", ומגלה בטעינה
     * הבאה שכלום לא נשמר. בשני המצבים האלה נכנסים ישר לאפליקציה עם
     * הודעת המצב, שהיא המידע שבאמת רלוונטי.
     *
     * אחסון חסום (זיכרון בלבד) דווקא כן מקבל את המסך: שם *הסשן הזה*
     * עובד, וההודעה בראש המסך כבר אומרת שהוא לא יישמר.
     */
    needsOnboarding() {
      if (writeLocked) return false;
      if (recovered && !backupSaved) return false;
      return state.onboarded !== true;
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
