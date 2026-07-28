/* הקטלוג — שכבת ההכרעה בין מנות ומצרכי הזרע לבין מה שהמשתמש ערך.

   ── למה לא פשוט להעתיק את הזרע ל-localStorage ──────────────────────
   הדרך הקצרה הייתה להעתיק את כל מנות הזרע למצב המשתמש בטעינה הראשונה
   ומשם לערוך אותן. הבעיה: תיקון בנתוני זרע (ערך תזונתי שגוי, שם, זמן
   הכנה) לעולם לא היה מגיע למי שכבר פתח את האפליקציה פעם אחת.

   לכן: הזרע נשאר בקוד, ועריכה כותבת *העתק* תחת אותו מזהה במצב המשתמש.
   ההעתק גובר. מי שלא ערך מנה מסוימת ממשיך לקבל את הגרסה המתוקנת שלה.

   ── למה ארכיון ולא מחיקה ────────────────────────────────────────────
   משבצות בתוכנית מצביעות על מנה לפי מזהה, והן שורדות שבועות אחורה.
   מחיקה הייתה הופכת כל היסטוריה שמצביעה על המנה ל"מנה לא מוכרת" —
   כולל המאקרו של שבועות שכבר נאכלו. מנה בארכיון יורדת מהבורר אבל
   ממשיכה להיפתר בכל מקום אחר, ולכן ההיסטוריה נשארת קריאה. */

import { getStore } from "./store.js";
import {
  DISHES,
  INGREDIENTS,
  SHELVES,
  getDish as getSeedDish,
  getIngredient as getSeedIngredient,
} from "./data.js";

export { SHELVES };

export const BASE_UNITS = [
  { id: "g", label: "גרם" },
  { id: "ml", label: 'מ"ל' },
  { id: "unit", label: "יחידה" },
];

export const EFFORTS = [
  { id: "low", label: "קל" },
  { id: "medium", label: "בינוני" },
  { id: "high", label: "מורכב" },
];

export const KOSHER_TYPES = [
  { id: "parve", label: "פרווה" },
  { id: "meat", label: "בשרי" },
  { id: "dairy", label: "חלבי" },
];

function userDishes() {
  return getStore().state.dishes || {};
}

function userIngredients() {
  return getStore().state.ingredients || {};
}

/* ---------- הכרעה ---------- */

/** מנה לפי מזהה. עריכת משתמש גוברת על הזרע, וגם מנה בארכיון נפתרת. */
export function resolveDish(id) {
  return userDishes()[id] || getSeedDish(id);
}

/** מצרך לפי מזהה. אותו כלל בדיוק. */
export function resolveIngredient(id) {
  return userIngredients()[id] || getSeedIngredient(id);
}

/**
 * מיזוג זרע + עריכות משתמש. פונקציה טהורה כדי שתהיה ניתנת לבדיקה בלי
 * ה-store: הכללים כאן (מי גובר, מה סדר התוצאה, מה יורד בארכיון) הם
 * מה שקובע מה המשתמש רואה בבורר.
 *
 * סדר: פריטי הזרע לפי סדרם, ואחריהם פריטי המשתמש לפי סדר ההוספה.
 * פריט זרע שנערך נשאר במקומו המקורי ולא קופץ לסוף.
 */
export function mergeCatalog(seed, overrides, { includeArchived = false } = {}) {
  const merged = new Map();

  for (const item of seed) merged.set(item.id, overrides[item.id] || item);
  for (const [id, item] of Object.entries(overrides)) merged.set(id, item);

  const all = [...merged.values()];
  return includeArchived ? all : all.filter((item) => !item.archived);
}

/**
 * כל המנות להצגה בבורר: זרע + מנות משתמש, בלי ארכיון.
 * מנת זרע שנערכה מופיעה פעם אחת בלבד — בגרסה הערוכה.
 */
export function listDishes(options) {
  return mergeCatalog(DISHES, userDishes(), options);
}

/** כל המצרכים לבחירה, באותו כלל מיזוג. */
export function listIngredients(options) {
  return mergeCatalog(INGREDIENTS, userIngredients(), options);
}

/** האם המזהה שייך לזרע — קובע אם "שחזור" מחזיר לגרסת הזרע. */
export function isSeedDish(id) {
  return !!getSeedDish(id);
}

export function isSeedIngredient(id) {
  return !!getSeedIngredient(id);
}

/* ---------- מזהים ---------- */

/**
 * המזהה הפנוי הבא בסדרה. נגזר מהמזהים הקיימים ולא משעון או מאקראי,
 * כדי שאותו רצף פעולות ייתן תמיד את אותה תוצאה — גם בבדיקות.
 */
export function nextId(prefix, taken) {
  const pattern = new RegExp(`^${prefix}\\.u(\\d+)$`);
  let max = 0;
  for (const id of taken) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}.u${max + 1}`;
}

export function nextDishId() {
  return nextId("dish", Object.keys(userDishes()));
}

export function nextIngredientId() {
  return nextId("ing", Object.keys(userIngredients()));
}

/* ---------- תצוגה ---------- */

export function shelfName(id) {
  const shelf = SHELVES.find((s) => s.id === id);
  return shelf ? shelf.name_he : id;
}

export function effortLabel(id) {
  const effort = EFFORTS.find((e) => e.id === id);
  return effort ? effort.label : "";
}

export function unitLabel(id) {
  const unit = BASE_UNITS.find((u) => u.id === id);
  return unit ? unit.label : id;
}
