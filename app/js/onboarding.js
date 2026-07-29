/* האפיון — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   כאן יושבות התשובות שהאפיון אוסף, הנרמול שלהן, והגזירות שהמסכים
   עושים מהן. המסך עצמו ב-ui-onboarding.js.

   ── למה `household` ולא עוד שדות על הפרופיל ─────────────────────────
   התשובות כאן מתארות את *המטבח*, לא את האדם: אילו ארוחות מתכננים,
   כמה זמן יש לבשל, מה לא נכנס לבית. שני בני זוג שחולקים תוכנית אחת
   חולקים גם אותן, ולכן הן שייכות למשק הבית ומסתנכרנות איתו.
   מה ששייך לאדם — שם ויעדי מאקרו — נשאר על הפרופיל, שם הוא כבר היה.

   ── ומה עם "מספר מומצא גרוע ממספר חסר" ──────────────────────────────
   הכלל הזה הוא לב המנוע, והוא חל גם כאן. לכן `targetsForGoal` מחזיר
   מספרים **עגולים בכוונה** ולעולם אינו מתחזה לחישוב אישי: הם מוצגים
   למשתמש בשאלה האחרונה, ניתנים לשינוי, וניתנים למחיקה מלאה. "אין
   יעד" הוא תשובה לגיטימית שהמסך יודע להציג.
   מה שאסור הוא לשתול מספר בשקט מאחורי הגב — וזה בדיוק מה שלא קורה. */

import { MEALS } from "./plan.js";
import { blankTargets } from "./profiles.js";

/** אילו ארוחות אפשר לתכנן. נגזר מ-plan.js כדי שלא יהיו שתי רשימות. */
export const MEAL_IDS = MEALS.map((meal) => meal.id);

/** תקציב הזמן לבישול ביום רגיל. הסף בדקות הוא מה שמדרג את הבורר. */
export const COOK_TIMES = [
  { id: "quick", label: "עד רבע שעה", max_min: 15 },
  { id: "medium", label: "חצי שעה", max_min: 35 },
  { id: "long", label: "שעה ויותר", max_min: Infinity },
];

/**
 * המטרה התזונתית של משק הבית.
 *
 * המספרים עגולים בכוונה — ראה ההערה בראש הקובץ. הם נקודת פתיחה
 * שהמשתמש רואה ומאשר, לא תחשיב אישי שמתחזה לידיעה.
 */
export const GOALS = [
  {
    id: "maintain",
    label: "לשמור על המשקל",
    targets: { kcal: 2000, protein_g: 120, fat_g: 65, carbs_g: 220 },
  },
  {
    id: "lose",
    label: "לרדת במשקל",
    targets: { kcal: 1700, protein_g: 130, fat_g: 55, carbs_g: 160 },
  },
  {
    id: "gain",
    label: "לעלות במסה",
    targets: { kcal: 2500, protein_g: 150, fat_g: 80, carbs_g: 280 },
  },
  { id: "none", label: "לא עוקבים אחרי מספרים", targets: null },
];

/** הצעות מהירות לשאלת "מה לא אוכלים". רשימה פתוחה — אפשר גם להקליד. */
export const DISLIKE_SUGGESTIONS = [
  "בשר",
  "עוף",
  "דגים",
  "חלב",
  "ביצים",
  "גלוטן",
  "חריף",
  "פטריות",
  "חצילים",
];

const COOK_TIME_IDS = new Set(COOK_TIMES.map((entry) => entry.id));
const GOAL_IDS = new Set(GOALS.map((entry) => entry.id));

/**
 * משק בית לפני שנשאלה שאלה אחת.
 *
 * `onboarded_at` ריק הוא *הסימן היחיד* שהאפיון עוד לא רץ — אין דגל
 * בוליאני נפרד שיכול לסתור אותו. שלוש הארוחות דלוקות כברירת מחדל כי
 * זו ההתנהגות שהייתה לפני האפיון, ומי שמדלג עליו מקבל בדיוק אותה.
 */
export function defaultHousehold() {
  return {
    onboarded_at: null,
    meals: MEAL_IDS.slice(),
    cook_time: "medium",
    dislikes: [],
    goal: "maintain",
  };
}

/** מנקה מחרוזות: חותך רווחים, זורק ריקים, ומסיר כפילויות תוך שמירת סדר. */
function cleanStrings(raw) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(raw) ? raw : []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * נרמול משק הבית. שדה פגום חוזר לברירת המחדל שלו במקום להפיל מסך.
 *
 * רשימת ארוחות ריקה מוחזרת למלאה: משק בית שלא מתכנן שום ארוחה אינו
 * מצב שהמתכנן יודע להציג — הוא היה מגיש שבוע בלי אף משבצת ובלי דרך
 * להוסיף אחת.
 */
export function coerceHousehold(raw) {
  const base = defaultHousehold();
  if (!raw || typeof raw !== "object") return base;

  const meals = MEAL_IDS.filter((id) => Array.isArray(raw.meals) && raw.meals.includes(id));

  return {
    ...raw,
    onboarded_at:
      typeof raw.onboarded_at === "string" && raw.onboarded_at ? raw.onboarded_at : null,
    meals: meals.length ? meals : base.meals,
    cook_time: COOK_TIME_IDS.has(raw.cook_time) ? raw.cook_time : base.cook_time,
    dislikes: cleanStrings(raw.dislikes),
    goal: GOAL_IDS.has(raw.goal) ? raw.goal : base.goal,
  };
}

/** האם האפיון כבר רץ במשק הבית הזה. */
export function isOnboarded(household) {
  return !!household?.onboarded_at;
}

/**
 * היעדים המוצעים למטרה. `null` פירושו "אין יעד" — לא אפס שקט.
 *
 * מוחזר עותק חדש בכל קריאה: הקורא כותב אותו לתוך פרופיל, ומבנה
 * משותף היה הופך שינוי אצל אדם אחד לשינוי אצל כולם.
 */
export function targetsForGoal(goalId) {
  const goal = GOALS.find((entry) => entry.id === goalId);
  if (!goal || !goal.targets) return blankTargets();
  return { ...goal.targets };
}

/**
 * בונה פרופילים מהשמות שהוזנו באפיון.
 *
 * המזהים רצים p1, p2, ... בסדר ההזנה — אותה צורה ש-nextProfileId
 * מנפיקה, כך שמיזוג בין מכשירים ממיין אותם חזרה לאותו סדר.
 */
export function profilesFromNames(names, targets) {
  return cleanStrings(names).map((name, index) => ({
    id: `p${index + 1}`,
    name_he: name,
    targets: targets ? { ...targets } : blankTargets(),
    dislikes: [],
    archived: false,
  }));
}

/**
 * אילו ארוחות להציג ליום מסוים.
 *
 * ── למה איחוד ולא סינון ─────────────────────────────────────────────
 * משק בית שמתכנן רק ערב עדיין יכול להחזיק ארוחת בוקר משבוע שעבר, או
 * מלפני ששינה את ההעדפה. סינון עיוור היה מסתיר אותה מהמסך בזמן
 * שהיא ממשיכה להיספר במאקרו וברשימת הקניות — כלומר נתון שקיים,
 * משפיע, ואי אפשר להגיע אליו כדי לתקן.
 *
 * לכן: הארוחות שנבחרו, ועוד כל ארוחה שכבר יש בה משבצת באותו יום.
 */
export function visibleMeals(household, slots, isoDate) {
  const chosen = new Set(coerceHousehold(household).meals);
  return MEALS.filter((meal) => chosen.has(meal.id) || !!slots?.[`${isoDate}.${meal.id}`]?.dish_id);
}

/* ---------- מה שהאפיון מלמד את בורר המנה ---------- */

/** התאמה רכה: "חלב" מוצא גם "חלב 3%". מתחת לשני תווים לא מחפשים. */
function mentions(text, needle) {
  if (typeof text !== "string" || needle.length < 2) return false;
  return text.includes(needle);
}

/**
 * אילו העדפות המנה הזו מתנגשת בהן.
 *
 * ── למה לסמן ולא להסתיר ─────────────────────────────────────────────
 * זו אותה החלטה שבגללה מנה בארכיון ממשיכה להיפתר וזו שבגללה מצרך לא
 * מזוהה מוצג ברשימה: הסתרה שקטה גורמת לאדם לחפש מנה שהוא יודע
 * שקיימת ולא למצוא אותה, בלי שום רמז למה. סימון אומר את האמת
 * ומשאיר את ההחלטה אצלו — אורח שאוכל בשר הוא סיבה מצוינת לבשל בשר.
 *
 * @param {object} dish              מנה פתורה
 * @param {string[]} dislikes        מה שלא אוכלים כאן
 * @param {(id: string) => object|null} resolveIngredient
 * @returns {string[]} ההעדפות שנפגעו, בסדר שבו נכתבו
 */
export function dishConflicts(dish, dislikes, resolveIngredient) {
  const hits = [];
  if (!dish) return hits;

  for (const dislike of cleanStrings(dislikes)) {
    const inName = mentions(dish.name_he, dislike);
    const inTags = (dish.tags || []).some((tag) => mentions(tag, dislike));

    const inIngredients = (dish.ingredients || []).some((line) => {
      const ing = resolveIngredient?.(line.ingredient_id);
      if (!ing) return false;
      return (
        mentions(ing.name_he, dislike) ||
        (ing.aliases || []).some((alias) => mentions(alias, dislike))
      );
    });

    if (inName || inTags || inIngredients) hits.push(dislike);
  }

  return hits;
}

/** האם המנה נכנסת בתקציב הזמן של משק הבית. */
export function withinCookTime(dish, cookTimeId) {
  const entry = COOK_TIMES.find((option) => option.id === cookTimeId);
  if (!entry) return true;
  return (Number(dish?.time_min) || 0) <= entry.max_min;
}

/**
 * סדר ההצגה בבורר המנה: קודם מה שמתאים, אחר כך מה שחורג בזמן,
 * ולבסוף מה שמתנגש במה שלא אוכלים כאן.
 *
 * מיון יציב — בתוך כל קבוצה נשמר הסדר שהגיע. `Array.prototype.sort`
 * מובטח כיציב במפרט, ולכן אין צורך לשאת אינדקס.
 */
export function rankDishes(dishes, household, resolveIngredient) {
  const prefs = coerceHousehold(household);

  const rank = (dish) => {
    if (dishConflicts(dish, prefs.dislikes, resolveIngredient).length) return 2;
    if (!withinCookTime(dish, prefs.cook_time)) return 1;
    return 0;
  };

  return (dishes || []).slice().sort((a, b) => rank(a) - rank(b));
}
