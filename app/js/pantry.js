/* המזווה — קיזוז מה שכבר בבית מול מה שהשבוע דורש.

   ── למה המזווה לא מתעדכן לבד אחרי "בישלתי" ─────────────────────────
   פיתוי מובן: יש סימון בישול, אז אפשר להוריד את המצרכים מהמלאי. לא
   עשינו את זה בכוונה. האפליקציה יודעת כמה המתכון *נוקב*, לא כמה
   באמת נכנס לסיר, ולא אם נשאר חצי בצל. מלאי שמחסיר מספרים שלא קרו
   מצטבר לשקר, והשקר הזה מתבטא בדיוק במקום הכי גרוע — רשימת קניות
   שמחסירה פריט שאין בבית. מזווה ידני שגוי הוא באחריות מי שהקליד;
   מזווה שמחסיר לבד שגוי בשקט.

   ── כלל הקיזוז ─────────────────────────────────────────────────────
   קיזוז רק כשאפשר להשוות: או ששתי הכמויות מגיעות ליחידת הבסיס, או
   שהן חולקות יחידה מקורית זהה. אין קיזוז מנוחש — בדיוק כמו שאין
   המרה מנוחשת במנוע הנרמול. */

import { toBase } from "./normalize.js";

/* סובלנות לרעש נקודה צפה. פחות מזה בגרמים אינו הבדל שמישהו קונה.
   מיוצא כדי ש-suggest.js ישאל "יש מספיק בבית?" באותה סובלנות בדיוק —
   שני ספים שונים היו נותנים שתי תשובות למצרך אחד. */
export const EPSILON = 0.0001;

/**
 * כמות המזווה ביחידת הבסיס של המצרך, או null כשאי אפשר להמיר.
 *
 * `unit` חסר פירושו "הכמות כבר ביחידת הבסיס" — כך נשמרות רשומות
 * מהצורה הישנה, שבה המזווה היה מספר חשוף בלי יחידה (ראה coercePantry).
 */
export function onHandInBase(entry, ingredient) {
  if (entry == null || !ingredient) return null;

  // מספר חשוף הוא הצורה הישנה: כמות שכבר ביחידת הבסיס. הסובלנות כאן
  // ולא רק ב-coercePantry, כי לפונקציה הזו מגיעים גם ערכים שלא עברו
  // דרך הטעינה — למשל בבדיקות.
  if (typeof entry === "number" || typeof entry === "string") {
    const bare = Number(entry);
    return Number.isFinite(bare) && bare > 0 ? bare : null;
  }

  const qty = Number(entry.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (entry.unit == null) return qty;
  const result = toBase(ingredient, qty, entry.unit);
  return result.ok ? result.qty : null;
}

/**
 * מנכה מכל שורה מנורמלת את מה שכבר קיים בבית.
 *
 * שורות "לבדוק ידנית" לא עוברות כאן בכוונה: אי אפשר לנכות מכמות שלא
 * הצלחנו לנרמל בלי להמציא בדיוק את ההמרה שסירבנו להמציא.
 *
 * מצרך שהמזווה מחזיק בו כמות שאי אפשר להמיר ליחידת הבסיס (״גביע
 * יוגורט״ בלי unit_weight_g) נחשב כאילו אין ממנו — לא כאילו יש הרבה.
 * ניכוי מנוחש היה מוריד מהרשימה פריט שבאמת חסר בבית.
 *
 * @param {Array} lines            שורות מנורמלות מ-sumLineItems
 * @param {object} pantry          state.pantry
 * @param {(id:string)=>object} resolveIngredient
 * @returns {Array} אותן שורות עם stock, needed ו-covered
 */
export function applyPantry(lines, pantry, resolveIngredient) {
  const have = pantry && typeof pantry === "object" ? pantry : {};

  return lines.map((line) => {
    const ingredient = line.ingredient || resolveIngredient?.(line.ingredient_id);
    const stock = onHandInBase(have[line.ingredient_id], ingredient);

    if (stock === null || stock <= 0) {
      return { ...line, stock: 0, needed: line.qty, covered: false };
    }
    const remaining = line.qty - stock;
    const covered = remaining < EPSILON;
    return { ...line, stock, needed: covered ? 0 : remaining, covered };
  });
}

/** שורות המזווה כמערך, ממוינות לפי שם — לתצוגה במסך המזווה. */
export function pantryRows(pantry, resolveIngredient) {
  const store = pantry && typeof pantry === "object" ? pantry : {};
  const rows = [];

  for (const [id, entry] of Object.entries(store)) {
    const ingredient = resolveIngredient(id);
    if (!ingredient) continue; // מצרך שנמחק מהקטלוג — לא מוצג ולא נמחק
    const qty = Number(entry?.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    rows.push({
      ingredient,
      qty,
      unit: entry.unit,
      // כמות שאי אפשר להביא ליחידת הבסיס תקזז רק מול שורה באותה
      // יחידה בדיוק. המסך אומר את זה במקום להשאיר את זה להפתעה.
      convertible: onHandInBase(entry, ingredient) !== null,
    });
  }

  return rows.sort((a, b) => a.ingredient.name_he.localeCompare(b.ingredient.name_he, "he"));
}
