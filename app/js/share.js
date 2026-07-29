/* שיתוף רשימת הקניות — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   ── המקרה שבשבילו זה קיים ───────────────────────────────────────────
   אחד מתכנן והשני קונה. עד כאן הרשימה הייתה נעולה בתוך הדפדפן של מי
   שתכנן, ומי שהלך לסופר קיבל צילום מסך או הכתבה בטלפון.

   ── מה נכנס לטקסט ומה לא ────────────────────────────────────────────
   רק מה שנשאר לקנות. פריט שכבר בעגלה אינו משימה של מי שמקבל את
   ההודעה, ורשימה שמערבבת "לקנות" עם "כבר קנינו" מחייבת את הקורא לסנן
   בעצמו — וזו בדיוק העבודה שהשיתוף אמור לחסוך. מספר הפריטים שהושמטו
   נאמר בסוף, כדי שההשמטה לא תיראה כמו רשימה שהתקצרה בלי הסבר.

   הערת "לבדוק ידנית" נשארת: היא לא קישוט אלא הדבר היחיד שאומר לקונה
   שהמספר לידה אינו מדויק. בלעדיה הוא קונה 2 יחידות של משהו שהמתכון
   נוקב בו בגרמים. */

import { formatQty, UNIT_LABELS } from "./normalize.js";

/** שורה אחת בטקסט. הכמות היא מה שצריך *לקנות*, כמו במסך. */
export function shareLine(row, manualHint) {
  const name = row.ingredient ? row.ingredient.name_he : row.ingredient_id;
  const qty = row.manual
    ? `${Number(row.qty.toFixed(2))} ${UNIT_LABELS[row.unit] || row.unit}`
    : formatQty(row.needed ?? row.qty, row.unit);
  const note = row.manual ? ` (${manualHint || "לבדוק ידנית"})` : "";
  return `• ${name} — ${qty}${note}`;
}

/**
 * הרשימה כטקסט להדבקה.
 *
 * @param {Array<{title: string, rows: Array}>} groups  מדפים לפי סדר המסך
 * @param {object} [options]
 * @param {string} [options.heading]   שורת פתיחה (טווח התאריכים)
 * @param {number} [options.inCart]    כמה כבר בעגלה ולא נכללו
 * @param {(row) => string} [options.hintOf]  הערת "לבדוק ידנית" לשורה
 * @returns {string} טקסט רגיל, בלי עיצוב. ריק כשאין מה לקנות.
 */
export function buildShareText(groups, { heading, inCart = 0, hintOf } = {}) {
  const blocks = [];

  for (const group of groups || []) {
    const rows = (group.rows || []).filter(Boolean);
    if (!rows.length) continue;
    const lines = rows.map((row) => shareLine(row, hintOf ? hintOf(row) : null));
    blocks.push(`${group.title}\n${lines.join("\n")}`);
  }

  // בלי שורות אין מה לשתף, וגם לא כותרת שתלויה באוויר.
  if (!blocks.length) return "";

  const parts = [];
  if (heading) parts.push(heading);
  parts.push(blocks.join("\n\n"));

  if (inCart > 0) {
    parts.push(
      inCart === 1 ? "פריט אחד כבר בעגלה ולא נכלל." : `${inCart} פריטים כבר בעגלה ולא נכללו.`,
    );
  }

  return parts.join("\n\n");
}
