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
import { slotComponents } from "./compose.js";

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
 *
 * נספר כל רכיב במשבצת ולא רק הראשי. בלי זה "אורז לבן" בורח מהמעקב
 * בכל פעם שהוא מגיע כתוספת — כלומר כמעט תמיד — ובורר ההרכבה מפסיק
 * להזהיר בדיוק על הרכיב שחוזר הכי הרבה.
 */
export function lastCookedMap(slots) {
  const out = new Map();

  for (const [key, slot] of Object.entries(slots || {})) {
    if (!slot || slot.status !== "cooked") continue;
    const date = key.split(".")[0];
    for (const dishId of slotComponents(slot)) {
      const current = out.get(dishId);
      // תאריכי ISO משתווים נכון כמחרוזות
      if (!current || date > current) out.set(dishId, date);
    }
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

/* ── שתי פונקציות הוסרו מכאן, ולמה זה לא אובדן ────────────────────────
   שתיהן איבדו את הקורא שלהן באותו מיזוג — זה שאיחד את בורר המנה כולו
   על `suggestDishes` (`suggest.js`) — ושתיהן הוסרו מאותו נימוק.

   `forgottenDishes` החזירה "מנות שבישלנו פעם ומזמן לא", עם סף של
   שבועיים ותקרה של שלוש. היום זו אות דירוג בתוך המנוע: המשקל
   `cookedLongAgo` קורא את *אותו* סיגנל דרך `lastCookedMap` — בדיוק
   אותם 14 יום — ומוסיף עליו כיסוי מזווה, חזרה בשבוע, ונימוק בכתב.

   `plannedDishIds` החזירה את מזהי המנות שכבר בתוכנית של שבוע, כדי לא
   להציע מנה שכבר על הלוח. גם היא ירדה לתוך המנוע, ובצורה טובה יותר:
   `plannedThisWeek` (`suggest.js`) לא מחזירה "כן/לא" אלא *סופרת* כמה
   פעמים המנה עוד מתוכננת, כי הקנס מוכפל ולא רווי — קבוצה בינארית לא
   הייתה יכולה להזין את זה. היא גם מבחינה בין מה שכבר בושל למה שעוד
   לפנינו, הבחנה שהסט הזה טשטש.

   קוד מת בלוגיקה טהורה הוא המסוכן שבסוגים: הוא נראה תקין, יש לו
   בדיקות ירוקות, והוא מזמין את הסיבוב הבא לחווט אותו בחזרה במקום
   להרחיב את המנוע שכן פועל. ההערה הזו נשארת כדי שהשאלה "למה אין פה
   פונקציה כזו" תיענה מראש. */

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
      // ההרכבה נשמרת שלמה. שבוע שהועתק בלי התוספות היה מחזיר "שניצל"
      // לבד במקום את הארוחה שבאמת אכלנו — כלומר הקיצור היה יוצר עבודה.
      const extras = slotComponents(source).slice(1);
      if (extras.length) next[targetKey].extras = extras;
      added++;
    }
  }

  return { slots: next, added };
}
