/* מנוע ההצעות — מה להציע למשבצת ריקה, ולמה. לוגיקה טהורה.

   ── מה הפער שזה סוגר ────────────────────────────────────────────────
   האפליקציה ידעה לתכנן, לקנות, לסמן ולסכם — אבל לא לעזור *להחליט*.
   21 משבצות בשבוע, כל אחת נבחרת ידנית מרשימה. copyWeek פתר חצי מזה
   (שבוע שכבר תוכנן), והחצי השני נשאר: השבוע הריק מול מי שלא זוכר מה
   בישל ומה יש בבית.

   ── הכלל שמכתיב את כל השאר ─────────────────────────────────────────
   ההצעה חייבת לשאת את הנימוק שלה. ציון סתום ("87% התאמה") הוא בדיוק
   המספר המומצא שהמנוע הזה נועד לא לייצר — הוא נראה כמו ידיעה ואי
   אפשר לחלוק עליו. לכן כל הצעה מחזירה reasons בעברית, וכל אות דירוג
   שמשפיעה על הסדר גם אומרת את עצמה במילים. אות שאין לה מה לומר לא
   מזיזה את הסדר.

   ── ולמה שום דבר לא נכתב לבד ────────────────────────────────────────
   המנוע מדרג בלבד. האישור הוא של המשתמש, משבצת-משבצת. אותו נימוק
   כמו במזווה שלא מתעדכן לבד אחרי "בישלתי": מערכת שממלאת שבוע בשקט
   צוברת החלטות שאיש לא קיבל, והן מתגלות בסופר.

   ── "במזווה" ולא "אין מה לקנות" ─────────────────────────────────────
   הכיסוי נמדד מול המזווה כפי שהוא רשום, בלי לנכות את מה שכבר תפוס
   בשביל שאר השבוע. לכן הנוסח הוא "כל המצרכים במזווה" — אמירה על
   המלאי, שהיא נכונה — ולא "אין מה לקנות", שהיא הבטחה. רשימת הקניות
   נשארת הסמכות היחידה על מה חסר. */

import { toBase } from "./normalize.js";
import { onHandInBase, EPSILON } from "./pantry.js";
import { lastCookedMap, recencyLabel, daysBetween } from "./history.js";
import { slotKey } from "./store.js";
import { MEALS } from "./plan.js";

/* ארוחה שיצאה מהתוכנית אינה חזרה על מנה: דילגנו עליה או אכלנו בחוץ,
   כלומר היא לא הגיעה לשולחן ולא אמורה להרחיק את המנה מהשבוע. */
const OFF_STATUSES = new Set(["skipped", "ate_out"]);

/* ארוחת בוקר שנמשכת יותר מזה כבר אינה ארוחת בוקר בשבוע עבודה.
   זו האות היחידה כאן שמניחה משהו על החיים ולא קוראת נתון — ולכן היא
   גם הקטנה ביותר, וכל אות אחרת גוברת עליה בקלות. */
const BREAKFAST_MINUTES = 30;

/**
 * משקלי הדירוג. מספרים שלמים ומפורשים, כדי שאפשר יהיה לקרוא סדר
 * תוצאות ולהבין אותו בלי להריץ — וכדי שבדיקה תוכל לקבע אותו.
 */
export const WEIGHTS = {
  neverCooked: 2, // בספרייה ולא הגיעה לשולחן — שווה להזכיר
  cookedToday: -6, // 0–1 ימים
  cookedRecently: -3, // 2–3 ימים
  cookedThisWeek: -1, // 4–6 ימים
  cookedLastWeek: 1, // 7–13 ימים
  cookedLongAgo: 3, // 14 ימים ומעלה
  pantryFull: 3,
  pantryMost: 1,
  /* ── למה הקנס מוכפל ולא רווי ────────────────────────────────────
     הגרסה הראשונה נתנה −4 להופעה אחת ו−8 לשתיים ומעלה, ושם עצרה.
     התוצאה התגלתה רק כשציירנו שבוע שלם מול ספרייה קטנה: ברגע שכל
     המנות הגיעו לשתי הופעות כולן נחתו על אותה רצפה, שובר השוויון
     לפי שם הכריע תמיד לאותו צד, ואותה מנה הוצעה 16 פעם ברצף.

     קנס שגדל עם כל הופעה שומר על סדר בין המנות גם עמוק בשבוע, וכך
     ההצעות מסתובבות במקום להיתקע. */
  plannedEach: -4,
  slowBreakfast: -2,
};

/* חצי מהמצרכים ומעלה נחשב "רוב". סף נמוך מזה היה מדביק את הנימוק
   כמעט לכל מנה, ונימוק שמופיע תמיד אינו נימוק. */
const MOST_RATIO = 0.5;

/**
 * כמה מהמצרכים של המנה כבר בבית, לפי המזווה כפי שהוא רשום.
 *
 * כלל אחד, זהה לזה של applyPantry: מצרך שאי אפשר להביא ליחידת בסיס
 * משותפת נספר כ*לא* מכוסה. ניחוש לטובה כאן היה מציף מנה שחסרים לה
 * מצרכים דווקא בגלל שלא ידענו להמיר אותם.
 *
 * @param {object} dish
 * @param {object} pantry               state.pantry
 * @param {(id:string)=>object} resolveIngredient
 * @param {number} servings             כמה מנות מתכוונים להכין
 * @returns {{covered:number, total:number, ratio:number}}
 */
export function pantryCoverage(dish, pantry, resolveIngredient, servings = 1) {
  const entries = Array.isArray(dish?.ingredients) ? dish.ingredients : [];
  const have = pantry && typeof pantry === "object" ? pantry : {};
  const portions = Number(servings) > 0 ? Number(servings) : 1;

  let covered = 0;

  for (const entry of entries) {
    const ingredient = resolveIngredient?.(entry.ingredient_id);
    if (!ingredient) continue;

    const needed = toBase(ingredient, entry.qty * portions, entry.unit);
    if (!needed.ok) continue; // דרישה שאי אפשר לנרמל — לא מכוסה, לא מנוחשת

    const stock = onHandInBase(have[entry.ingredient_id], ingredient);
    if (stock === null) continue;

    if (stock - needed.qty >= -EPSILON) covered++;
  }

  // מנה בלי מצרכים אינה "מכוסה במלואה" — אין מה לכסות. יחס 0 מונע
  // ממנה לזכות בנימוק מזווה שאין לו שום גיבוי.
  const total = entries.length;
  return { covered, total, ratio: total ? covered / total : 0 };
}

/**
 * כמה פעמים המנה עוד *מתוכננת* בשבוע הזה.
 *
 * ── למה משבצת שכבר בושלה לא נספרת כאן ──────────────────────────────
 * הניסיון הראשון ספר גם אותה, והתוצאה הייתה עונש כפול על עובדה אחת:
 * מנה שבושלה אתמול קיבלה גם את קנס ההיסטוריה וגם את קנס החזרה, והציגה
 * למשתמש שני נימוקים שאומרים את אותו דבר — "בישלתם אתמול · כבר בתפריט
 * השבוע". שתי אמירות לעובדה אחת נקראות כשתי עובדות.
 *
 * לכן החלוקה היא לפי כיוון הזמן: אות ההיסטוריה מחזיקה את מה שכבר קרה,
 * והאות הזו מחזיקה את מה שעוד לפנינו. ארוחה שיצאה מהתוכנית לא נספרת
 * בשום צד — היא לא הגיעה לשולחן ולא תגיע.
 *
 * סטטוס לא מוכר נספר כמתוכנן, בדיוק כמו ב-mealState.
 */
export function plannedThisWeek(slots, dates, dishId, excludeKey = null) {
  let count = 0;
  for (const date of dates || []) {
    for (const meal of MEALS) {
      const key = slotKey(date, meal.id);
      if (key === excludeKey) continue;
      const slot = slots?.[key];
      if (!slot || slot.dish_id !== dishId) continue;
      if (OFF_STATUSES.has(slot.status) || slot.status === "cooked") continue;
      count++;
    }
  }
  return count;
}

/** נימוק אחד: טקסט + גוון. good מושך למעלה, warn מזהיר בלי לפסול. */
function reason(text, tone) {
  return { text, tone };
}

/**
 * אות ההיסטוריה: מתי בישלנו את זה, ומה זה אומר על היום.
 * הטקסט מגיע מ-recencyLabel כדי שהניסוח בהצעה ובבורר יהיה זהה —
 * שתי נוסחאות לאותה עובדה נקראות כשתי עובדות.
 */
function recencySignal(lastIso, todayIso) {
  if (!lastIso) return { score: WEIGHTS.neverCooked, reason: reason("עוד לא בישלתם", "good") };

  const days = daysBetween(lastIso, todayIso);
  const label = recencyLabel(lastIso, todayIso);

  if (days <= 1) return { score: WEIGHTS.cookedToday, reason: reason(label, "warn") };
  if (days <= 3) return { score: WEIGHTS.cookedRecently, reason: reason(label, "warn") };
  if (days <= 6) return { score: WEIGHTS.cookedThisWeek, reason: reason(label, "warn") };
  if (days <= 13) return { score: WEIGHTS.cookedLastWeek, reason: reason(label, "good") };
  return { score: WEIGHTS.cookedLongAgo, reason: reason(label, "good") };
}

/**
 * מדרג מנה אחת. מחזיר את הציון ואת הנימוקים שהרכיבו אותו.
 *
 * @param {object} dish
 * @param {object} context ראה suggestDishes
 * @returns {{dish:object, score:number, reasons:Array<{text:string,tone:string}>}}
 */
export function scoreDish(dish, context) {
  const {
    slots = {},
    dates = [],
    pantry = {},
    resolveIngredient,
    todayIso,
    meal = "dinner",
    servings = 1,
    excludeKey = null,
    cooked,
  } = context || {};

  // המפה מחושבת פעם אחת ב-suggestDishes ומועברת הלאה; חישוב מחדש לכל
  // מנה היה סורק את כל ההיסטוריה שוב ושוב.
  const lastCooked = cooked || lastCookedMap(slots);

  const reasons = [];
  let score = 0;

  const history = recencySignal(lastCooked.get(dish.id), todayIso);
  score += history.score;
  reasons.push(history.reason);

  const repeats = plannedThisWeek(slots, dates, dish.id, excludeKey);
  if (repeats > 0) {
    score += WEIGHTS.plannedEach * repeats;
    if (repeats === 1) {
      reasons.push(reason("כבר בתפריט השבוע", "warn"));
    } else {
      // "פעמיים" ולא "2 פעמים" — בעברית הזוגי הוא מילה, לא ספרה.
      const times = repeats === 2 ? "פעמיים" : `${repeats} פעמים`;
      reasons.push(reason(`${times} בתפריט השבוע`, "warn"));
    }
  }

  const coverage = pantryCoverage(dish, pantry, resolveIngredient, servings);
  if (coverage.total > 0 && coverage.covered === coverage.total) {
    score += WEIGHTS.pantryFull;
    reasons.push(reason("כל המצרכים במזווה", "good"));
  } else if (coverage.ratio >= MOST_RATIO) {
    score += WEIGHTS.pantryMost;
    reasons.push(reason("רוב המצרכים במזווה", "good"));
  }

  if (meal === "breakfast" && Number(dish.time_min) > BREAKFAST_MINUTES) {
    score += WEIGHTS.slowBreakfast;
    reasons.push(reason("ארוך לארוחת בוקר", "warn"));
  }

  return { dish, score, reasons };
}

/**
 * מדרג את כל המנות למשבצת אחת, מהמתאימה ביותר ומטה.
 *
 * שוויון ציונים נשבר לפי שם ואז לפי מזהה, ולא באקראי: אותו מצב חייב
 * לתת תמיד את אותה הצעה. הצעה שמתחלפת בכל רינדור אינה המלצה — היא
 * רעש, והמשתמש לומד להתעלם ממנה.
 *
 * @param {object} context
 * @param {Array}  context.dishes            מועמדות, בלי ארכיון
 * @param {object} context.slots             state.plan.slots
 * @param {string[]} context.dates           תאריכי השבוע הנוכחי
 * @param {object} context.pantry            state.pantry
 * @param {(id:string)=>object} context.resolveIngredient
 * @param {string} context.todayIso
 * @param {string} [context.meal]            לאיזו ארוחה
 * @param {number} [context.servings]        כמה מנות
 * @param {string|null} [context.excludeKey] משבצת שלא נספרת כחזרה
 * @param {number} [context.limit]           כמה להחזיר
 */
export function suggestDishes(context) {
  const { dishes = [], slots = {}, limit } = context || {};
  const cooked = lastCookedMap(slots);

  const ranked = dishes
    .map((dish) => scoreDish(dish, { ...context, cooked }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const byName = a.dish.name_he.localeCompare(b.dish.name_he, "he");
      if (byName !== 0) return byName;
      return a.dish.id.localeCompare(b.dish.id);
    });

  return limit > 0 ? ranked.slice(0, limit) : ranked;
}

/** מפתחות המשבצות הריקות בשבוע, בסדר שבו אוכלים אותן. */
export function emptySlotKeys(slots, dates) {
  const keys = [];
  for (const date of dates || []) {
    for (const meal of MEALS) {
      const key = slotKey(date, meal.id);
      const slot = slots?.[key];
      if (!slot || !slot.dish_id) keys.push({ key, date, meal: meal.id });
    }
  }
  return keys;
}

/**
 * הצעה אחת לכל משבצת ריקה בשבוע.
 *
 * ── הנקודה שבגללה זו לא לולאה תמימה ────────────────────────────────
 * הרצת ההצעה 21 פעם על אותו מצב הייתה מחזירה את אותה מנה 21 פעם:
 * הקלט לא משתנה, ולכן גם המנצחת לא. לכן כל הצעה נצברת לתוך *עותק
 * עבודה* של המשבצות, ומשם היא נספרת כחזרה בהצעה הבאה. אות החזרה
 * שכבר קיימת עושה את העבודה — בלי כלל נפרד ובלי רשימת "כבר הוצע".
 *
 * העותק אינו נשמר לשום מקום: הפונקציה טהורה, והכתיבה קורית רק אחרי
 * שהמשתמש אישר.
 *
 * @returns {Array<{key:string, date:string, meal:string, dish:object,
 *                  score:number, reasons:Array}>} רק משבצות שנמצאה להן מנה
 */
export function suggestForWeek(context) {
  const { dishes = [], slots = {}, dates = [], servings = 1 } = context || {};
  if (!dishes.length) return [];

  const draft = { ...slots };
  const out = [];

  for (const { key, date, meal } of emptySlotKeys(slots, dates)) {
    /* אותה מנה פעמיים באותו יום היא הצעה שאיש לא היה מקבל, וקנס
       מדורג לבדו לא מנע אותה: מנה עם כיסוי מזווה מלא יכולה לגבור על
       הקנס ולחזור בצהריים ובערב. זה הכלל היחיד כאן שהוא פסילה ולא
       שקלול — ודווקא משום כך הוא נסוג כשאין ממה לבחור: ספרייה קטנה
       משלוש ארוחות תקבל חזרה ביום, וזו עדיין תשובה טובה יותר
       ממשבצת ריקה בלי הצעה. */
    const takenToday = new Set(
      MEALS.map((m) => draft[slotKey(date, m.id)]?.dish_id).filter(Boolean),
    );
    const free = dishes.filter((dish) => !takenToday.has(dish.id));

    const [best] = suggestDishes({
      ...context,
      dishes: free.length ? free : dishes,
      slots: draft,
      meal,
      limit: 1,
    });
    if (!best) break;

    out.push({ key, date, meal, dish: best.dish, score: best.score, reasons: best.reasons });

    // מכאן והלאה המנה הזו כבר "בתפריט השבוע" מבחינת המשבצת הבאה.
    draft[key] = { dish_id: best.dish.id, servings, eaters: [], status: "planned" };
  }

  return out;
}
