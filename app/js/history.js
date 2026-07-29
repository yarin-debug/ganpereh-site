/* מה כבר בישלנו, ומה לעשות עם זה. לוגיקה טהורה.

   שתי בעיות אמיתיות נפתרות מאותו מידע, והמידע כבר קיים: המשבצות
   שורדות בבלוב תחת מפתחות התאריך שלהן גם אחרי שהשבוע מתגלגל.

   1. תכנון שבוע מאפס, כל יום ראשון מחדש, הוא החיכוך שמפיל את סשן
      התכנון — וזו ההתנהגות שהכי קשורה לשימוש חוזר. copyWeek ממחזר
      שבוע קודם.
   2. "עייפות תפריט" — לבשל את אותו דבר בלי לשים לב. lastCookedMap
      נותן לבורר להגיד "בישלת את זה לפני יומיים" לפני שבוחרים. */

import { slotKey, weekDates } from "./store.js";
import { MEALS } from "./plan.js";

function toDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * הפרש בימים בין שני תאריכים.
 * העיגול מכסה מעברי שעון קיץ, שבהם היממה היא 23 או 25 שעות ולא 24.
 */
export function daysBetween(fromIso, toIso) {
  return Math.round((toDate(toIso) - toDate(fromIso)) / 86400000);
}

/**
 * מזהה מנה → התאריך האחרון שבו היא *בושלה*.
 * מתוכנן לא נספר: השאלה היא מתי אכלנו את זה, לא מתי התכוונו.
 */
export function lastCookedMap(slots) {
  const out = new Map();

  for (const [key, slot] of Object.entries(slots || {})) {
    if (!slot || !slot.dish_id || slot.status !== "cooked") continue;
    const date = key.split(".")[0];
    const current = out.get(slot.dish_id);
    // תאריכי ISO משתווים נכון כמחרוזות
    if (!current || date > current) out.set(slot.dish_id, date);
  }
  return out;
}

/** "לפני יומיים" ולא "2026-07-26" — טקסט שמסייע להחליט, לא נתון גולמי. */
export function recencyLabel(lastIso, todayIso) {
  if (!lastIso) return null; // עוד לא בושלה — אין מה לומר, וזה בסדר
  const days = daysBetween(lastIso, todayIso);

  if (days <= 0) return "בישלתם היום";
  if (days === 1) return "בישלתם אתמול";
  if (days < 7) return `בישלתם לפני ${days} ימים`;
  if (days < 14) return "בישלתם לפני שבוע";
  if (days < 30) return `בישלתם לפני ${Math.floor(days / 7)} שבועות`;
  if (days < 60) return "בישלתם לפני חודש";
  return `בישלתם לפני ${Math.floor(days / 30)} חודשים`;
}

/**
 * מזהי המנות שכבר בתוכנית של שבוע מסוים.
 *
 * משמש כדי לא להציע מנה שכבר על הלוח: הצעה כזו היא בעצמה עייפות
 * תפריט, ובדיוק ההפך ממה שההצעות קיימות בשבילו.
 */
export function plannedDishIds(slots, weekStart) {
  const ids = new Set();
  for (const date of weekDates(weekStart)) {
    for (const meal of MEALS) {
      const slot = slots?.[slotKey(date, meal.id)];
      if (slot && slot.dish_id) ids.add(slot.dish_id);
    }
  }
  return ids;
}

/**
 * מנות ששכחנו — בישלנו אותן פעם, ומזמן לא.
 *
 * ── למה רק מנות שכבר בושלו ───────────────────────────────────────────
 * הפיתוי הוא לדחוף לרשימה גם מנות שמעולם לא בושלו, כדי שתמיד יהיה מה
 * להציע. שתי סיבות לא לעשות את זה:
 *
 * הכותרת "לא בישלנו מזמן" פשוט אינה נכונה על מנה שמעולם לא בושלה, וזו
 * אותה משפחה של שקר קטן שהמנוע הזה נמנע ממנה בכל מקום אחר. וחוץ מזה,
 * מנה שבישלו פעם היא המלצה חזקה יותר: משק הבית כבר הצביע עליה. מנת זרע
 * שמעולם לא נגעו בה אינה "מנה שנשכחה" אלא הצעה אקראית מהקטלוג, ובקטלוג
 * אפשר לדפדף ממילא.
 *
 * לכן כשאין מה להציע — מחזירים רשימה ריקה, והממשק לא מציג כלום.
 *
 * ── ולמה סף של שבועיים ──────────────────────────────────────────────
 * מנה שבושלה לפני ארבעה ימים אינה "מזמן". סף נמוך מדי הופך את ההצעה
 * לרעש שמפסיקים להסתכל עליו.
 *
 * @param {Array} dishes              קטלוג המנות
 * @param {object} slots              משבצות התוכנית (כולל שבועות שעברו)
 * @param {string} todayIso
 * @param {object} [options]
 * @param {number} [options.limit=3]
 * @param {number} [options.minDays=14]
 * @param {Iterable<string>} [options.exclude] מזהי מנות שכבר בתוכנית
 * @returns {Array<{dish: object, last: string, days: number}>} ותיקה תחילה
 */
export function forgottenDishes(dishes, slots, todayIso, options = {}) {
  const { limit = 3, minDays = 14, exclude } = options;
  const cooked = lastCookedMap(slots);
  const skip = new Set(exclude || []);

  return (
    (dishes || [])
      .filter((dish) => dish && dish.id && !dish.archived && !skip.has(dish.id))
      .map((dish) => ({ dish, last: cooked.get(dish.id) || null }))
      .filter((entry) => entry.last)
      .map((entry) => ({ ...entry, days: daysBetween(entry.last, todayIso) }))
      .filter((entry) => entry.days >= minDays)
      // ותיקה תחילה. שובר השוויון הוא המזהה ולא סדר הקטלוג, כדי שאותו
      // מצב ייתן תמיד את אותה תוצאה — גם בבדיקות.
      .sort((a, b) => (a.days !== b.days ? b.days - a.days : a.dish.id < b.dish.id ? -1 : 1))
      .slice(0, Math.max(0, limit))
  );
}

/**
 * מעתיק תוכנית משבוע אחד לאחר.
 *
 * שלושה כללים שהופכים את זה לבטוח ללחוץ:
 * - **לא דורס.** משבצת שכבר יש בה מנה נשארת כמו שהיא, ולכן אפשר
 *   להעתיק אחרי שכבר תכננת חלק מהשבוע.
 * - **הסטטוס מתאפס ל"מתוכנן".** מעתיקים תוכנית, לא היסטוריה; בלי זה
 *   השבוע החדש היה נפתח עם "בישלנו" על ארוחות שטרם קרו, והרצף
 *   ורשימת הקניות היו משקרים.
 * - **אוכלים שכבר לא במשק הבית מסוננים.** משבצת שכל אוכליה יצאו לא
 *   מועתקת בכלל, במקום להיווצר בלי אוכלים ולשבור את חישוב המאקרו.
 *
 * @returns {{slots: object, added: number}} אובייקט חדש; הקלט לא משתנה.
 */
export function copyWeek(slots, fromWeekStart, toWeekStart, activeIds) {
  const from = weekDates(fromWeekStart);
  const to = weekDates(toWeekStart);
  const active = new Set(activeIds || []);
  const next = { ...(slots || {}) };
  let added = 0;

  for (let i = 0; i < 7; i++) {
    for (const meal of MEALS) {
      const source = slots?.[slotKey(from[i], meal.id)];
      if (!source || !source.dish_id) continue;

      const targetKey = slotKey(to[i], meal.id);
      if (next[targetKey] && next[targetKey].dish_id) continue;

      const eaters = (Array.isArray(source.eaters) ? source.eaters : []).filter((id) =>
        active.has(id),
      );
      if (!eaters.length) continue;

      next[targetKey] = {
        dish_id: source.dish_id,
        servings: Math.max(eaters.length, Number(source.servings) || eaters.length),
        eaters,
        status: "planned",
      };
      added++;
    }
  }

  return { slots: next, added };
}
