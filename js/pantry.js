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

/* סובלנות לרעש נקודה צפה. פחות מזה בגרמים אינו הבדל שמישהו קונה. */
const EPSILON = 0.0001;

/** כמות המזווה ביחידת הבסיס של המצרך, או null כשאי אפשר להמיר. */
export function onHandInBase(entry, ingredient) {
  if (!entry || !ingredient) return null;
  const qty = Number(entry.qty);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const result = toBase(ingredient, qty, entry.unit);
  return result.ok ? result.qty : null;
}

/**
 * מקזז את המזווה מול תוצאת סכימת השבוע.
 *
 * @param {{lines:Array, manual:Array}} summed  הפלט של sumLineItems
 * @param {object} pantry                        state.pantry
 * @returns {{lines:Array, manual:Array, covered:Array}}
 *   lines/manual — מה שעוד צריך לקנות, בכמות המקוזזת.
 *   covered      — מה שהבית כבר מכסה במלואו.
 */
export function applyPantry(summed, pantry) {
  const store = pantry && typeof pantry === "object" ? pantry : {};
  const lines = [];
  const manual = [];
  const covered = [];

  for (const line of summed.lines) {
    const id = line.ingredient?.id;
    const onHand = onHandInBase(store[id], line.ingredient);

    if (onHand === null) {
      lines.push({ ...line, onHand: 0, required: line.qty });
      continue;
    }

    const need = line.qty - onHand;
    if (need <= EPSILON) {
      covered.push({ ...line, onHand, required: line.qty, manual: false });
    } else {
      lines.push({ ...line, qty: need, onHand, required: line.qty });
    }
  }

  for (const row of summed.manual) {
    const entry = store[row.ingredient_id];
    // שורה ידנית לא עברה המרה, ולכן קיזוז מותר רק מול יחידה זהה.
    const sameUnit = entry && entry.unit === row.unit && Number(entry.qty) > 0;
    if (!sameUnit) {
      manual.push({ ...row, onHand: 0, required: row.qty });
      continue;
    }

    const need = row.qty - Number(entry.qty);
    if (need <= EPSILON) {
      covered.push({ ...row, onHand: Number(entry.qty), required: row.qty, manual: true });
    } else {
      manual.push({ ...row, qty: need, onHand: Number(entry.qty), required: row.qty });
    }
  }

  return { lines, manual, covered };
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
