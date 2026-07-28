/* לוגיקת תוכנית טהורה — בלי DOM ובלי גישה ל-store.

   כאן יושב מה שהמסכים *גוזרים* מהתוכנית ולא שומרים: מצב היום, מחזור
   הסימון, והרצף. הכל נבדק ב-app/dev/tests.html לצד מנוע הנרמול.

   הערה על הרצף: המשבצות נשמרות בבלוב תחת מפתחות התאריך שלהן וממשיכות
   לחיות אחרי שהשבוע מתגלגל, ולכן הרצף נספר אחורה על פני תאריכים ולא
   בתוך השבוע המוצג — אחרת כל מוצ"ש היה מאפס אותו. */

import { slotKey, addDays } from "./store.js";

/** הסטטוסים שמשבצת יכולה להיות בהם, לפי סדר מחזור הסימון. */
export const STATUS_ORDER = ["planned", "cooked", "ate_out", "skipped"];

export const STATUS_LABELS = {
  planned: "מתוכנן",
  cooked: "בישלנו",
  ate_out: "אכלנו בחוץ",
  skipped: "דילגנו",
};

/** כמה ימים אחורה מותר לרצף לחפש. גבול שפיות, לא כלל מוצר. */
const MAX_STREAK_LOOKBACK = 400;

/**
 * מצב יום בודד לתצוגה: מה להראות בפס השבוע ובכרטיס.
 * @returns {"empty"|"planned"|"cooked"|"ate_out"|"skipped"}
 */
export function dayState(slots, isoDate, meal = "dinner") {
  const slot = slots?.[slotKey(isoDate, meal)];
  if (!slot || !slot.dish_id) return "empty";
  return STATUS_ORDER.includes(slot.status) ? slot.status : "planned";
}

/** האם היום הזה נחשב "בושל" לצורך הרצף. */
function isCooked(slots, isoDate) {
  return dayState(slots, isoDate) === "cooked";
}

/**
 * רצף הימים הרצופים שבהם בישלנו, נספר אחורה מהיום.
 *
 * היום עצמו מקבל ארכה: בשש בערב עוד לא בישלת, וזה לא אמור לאפס רצף של
 * שבועיים. אם היום מסומן — הוא נספר; אם לא — הספירה מתחילה מאתמול.
 * כך הרצף יורד רק אחרי יום שלם שבו לא בושל.
 */
export function cookedStreak(slots, todayIso) {
  let count = 0;
  let cursor = isCooked(slots, todayIso) ? todayIso : addDays(todayIso, -1);

  for (let i = 0; i < MAX_STREAK_LOOKBACK; i++) {
    if (!isCooked(slots, cursor)) break;
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * הסטטוס שיישמר כשמקישים על כפתור סימון.
 *
 * הקשה על הכפתור שכבר פעיל מחזירה ל"מתוכנן" — סימון בטעות הוא המקרה
 * הנפוץ, וביטול שלו לא אמור לדרוש מחיקת המנה ותכנון מחדש.
 */
export function toggleStatus(current, target) {
  return current === target ? "planned" : target;
}

/**
 * מפתח יציב לשורת קנייה. חייב להיות זהה לזה שסימון הקנייה נשמר תחתיו,
 * ולכן הוא נגזר מהמצרך והיחידה בלבד — לא מהכמות, שמשתנה בכל שינוי
 * בתוכנית ואז הייתה מאבדת את הסימון.
 */
export function lineKey(row) {
  const id = row.ingredient_id || row.ingredient?.id || "";
  return row.manual ? `${id}|${row.unit}` : id;
}
