/* הרכבת הארוחה — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   ── למה בכלל רכיבים ────────────────────────────────────────────────
   "שניצל וצ'יפס" כמנה אחת מכריחה את המשתמש לקבל את ההחלטה של מי
   שהזין את הנתונים. מי שרוצה שניצל עם אורז נשאר בלי מסלול: או לתכנן
   משהו אחר, או לבנות מנה חדשה שלמה כדי להחליף תוספת אחת. לכן משבצת
   מחזיקה *רכיבים*, וכל רכיב הוא מנה בפני עצמה עם תפקיד.

   ── למה dish_id נשאר ולא הוחלף במערך ───────────────────────────────
   coerceSlots — בכל גרסה של האפליקציה, כולל גרסאות ישנות שיושבות
   במטמון של מכשירים אחרים — זורקת משבצת שאין בה dish_id מחרוזתי.
   מעבר למערך `components` בלבד היה גורם לגרסה ישנה למחוק בשקט כל
   ארוחה מורכבת שנשמרה בגרסה החדשה. זו בדיוק מחיקת נתוני המשתמש
   שהחוזה של store.js אוסר.

   לכן הצורה היא `dish_id` (הרכיב הראשי) + `extras` (השאר). גרסה ישנה
   תציג רק את הראשי, אבל תשמור את extras כמו שהוא דרך פריסת השדות
   ב-coerceSlots — כלומר תפסיד תצוגה, לא נתונים.

   ── למה סדר הרכיבים נגזר ולא נשמר ──────────────────────────────────
   הסדר מגיע מהתפקיד (חלבון לפני תוספת לפני סלט), ולכן שינוי תפקיד של
   מנה בעורך מסדר מחדש כל משבצת שמצביעה עליה בלי הגירה. סדר שמור היה
   נשאר תקוע על ההחלטה הישנה. */

/** תפקידי הרכיבים, לפי הסדר שבו בונים צלחת — והסדר שבו הם מוצגים. */
export const ROLES = [
  { id: "main", label: "מנה שלמה" },
  { id: "protein", label: "חלבון" },
  { id: "side", label: "תוספת" },
  { id: "veg", label: "ירק וסלט" },
  { id: "dip", label: "מטבל ורוטב" },
];

/* מנה בלי תפקיד היא מנה שלמה. כל המנות שנוצרו לפני שהתפקידים קיימים
   הן בדיוק זה — ארוחה בפני עצמה — ולכן ברירת המחדל אינה ניחוש. */
export const DEFAULT_ROLE = "main";

const ROLE_INDEX = new Map(ROLES.map((role, index) => [role.id, index]));

export function isRole(id) {
  return ROLE_INDEX.has(id);
}

/** תפקיד המנה, עם ברירת המחדל למנה שלא סווגה. */
export function dishRole(dish) {
  return dish && isRole(dish.role) ? dish.role : DEFAULT_ROLE;
}

/**
 * רכיבי המשבצת, כפי שהם שמורים: הראשי ואחריו התוספות.
 * משבצת ישנה (dish_id בלבד) מוחזרת כרכיב אחד — אין כאן הגירה.
 */
export function slotComponents(slot) {
  if (!slot || typeof slot.dish_id !== "string" || !slot.dish_id) return [];
  const out = [slot.dish_id];
  if (!Array.isArray(slot.extras)) return out;
  for (const id of slot.extras) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** מסיר כפילויות ושומר על סדר ההופעה הראשון. */
function unique(dishIds) {
  const out = [];
  for (const id of dishIds || []) {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * מסדר רכיבים לפי תפקיד. בתוך אותו תפקיד נשמר סדר הבחירה, כדי ששתי
 * תוספות שנבחרו לא יתחלפו במקומן בכל רינדור.
 *
 * מנה שאי אפשר לפתור יורדת לסוף ואינה מקבלת את דירוג "מנה שלמה". בלי
 * החריג הזה מזהה שבור היה קופץ לראש ההרכבה, נשמר כרכיב הראשי, ומופיע
 * בכרטיס היום בגודל מלא כ"מנה לא מוכרת" — במקום המנה שבאמת נבחרה.
 */
function componentRank(dishId, resolveDish) {
  const dish = resolveDish(dishId);
  if (!dish) return ROLES.length;
  return ROLE_INDEX.get(dishRole(dish)) ?? 0;
}

export function sortComponents(dishIds, resolveDish) {
  return unique(dishIds)
    .map((id, index) => ({ id, index, rank: componentRank(id, resolveDish) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.id);
}

/**
 * שדות ההרכבה של משבצת. מחזיר null כשלא נבחר כלום — כלומר "אין ארוחה
 * כאן", וזה מה שמוחק את המשבצת ולא משבצת ריקה שנשארת על המסך.
 * @returns {{dish_id:string, extras:string[]}|null}
 */
export function componentFields(dishIds, resolveDish) {
  const ordered = sortComponents(dishIds, resolveDish);
  if (!ordered.length) return null;
  return { dish_id: ordered[0], extras: ordered.slice(1) };
}

/**
 * המשבצת אחרי שההרכבה הוחלה עליה. מחזיר null כשלא נבחר כלום — כלומר
 * "אין כאן ארוחה", והקורא מוחק את המשבצת.
 *
 * משבצת קיימת שומרת את servings, את האוכלים ואת הסטטוס: החלפת תוספת
 * אינה מבטלת "בישלנו" ואינה מאפסת מי אוכל. משבצת חדשה נפתחת עם כל מי
 * שבמשק הבית ומנה לכל אחד.
 */
export function slotWithComponents(slot, dishIds, resolveDish, eaterIds) {
  const fields = componentFields(dishIds, resolveDish);
  if (!fields) return null;

  const eaters = Array.isArray(eaterIds) ? eaterIds : [];
  const base = slot || {
    servings: Math.max(1, eaters.length),
    eaters: eaters.slice(),
    status: "planned",
  };

  const next = { ...base, dish_id: fields.dish_id };
  if (fields.extras.length) next.extras = fields.extras;
  else delete next.extras;
  return next;
}

/** הוספה או הסרה של רכיב. הבחירה היא החלפה, לא צבירה שקטה. */
export function toggleComponent(dishIds, dishId) {
  const current = unique(dishIds);
  const index = current.indexOf(dishId);
  if (index >= 0) {
    current.splice(index, 1);
    return current;
  }
  current.push(dishId);
  return current;
}

/**
 * מקבץ מנות לפי תפקיד, בסדר ROLES. תפקיד בלי מנות אינו מוחזר — כותרת
 * מעל רשימה ריקה קוראת כמו תקלה.
 */
export function groupByRole(dishes) {
  const buckets = new Map(ROLES.map((role) => [role.id, []]));
  for (const dish of dishes || []) buckets.get(dishRole(dish)).push(dish);
  return ROLES.map((role) => ({ ...role, dishes: buckets.get(role.id) })).filter(
    (group) => group.dishes.length,
  );
}

/** שמות הרכיבים לפי הסדר. הבסיס לכל תווית מורכבת במסכים. */
export function componentNames(dishIds, resolveDish) {
  return sortComponents(dishIds, resolveDish).map((id) => {
    const dish = resolveDish(id);
    return dish ? dish.name_he : "מנה לא מוכרת";
  });
}

/**
 * זמן ההכנה של הרכבה: הרכיב הארוך ביותר, לא הסכום.
 *
 * השניצל מטגן בזמן שהאורז על האש. סכימה הייתה מציגה שעה וחצי לארוחה
 * שלוקחת ארבעים דקות, ומספר שמנפח את המאמץ הוא בדיוק מה שגורם לא
 * לבשל. המרבי אינו מדויק לגמרי — יש רכיבים שבאמת מתווספים — אבל הוא
 * הקירוב הישר היחיד מתוך המידע שיש.
 */
export function composedTime(dishIds, resolveDish) {
  let max = 0;
  for (const id of unique(dishIds)) {
    const dish = resolveDish(id);
    const time = Number(dish?.time_min);
    if (Number.isFinite(time) && time > max) max = time;
  }
  return max;
}

/** כל מה שאפשר להכין מראש, מכל הרכיבים, בלי כפילויות. */
export function composedPrepAhead(dishIds, resolveDish) {
  const out = [];
  for (const id of unique(dishIds)) {
    for (const step of resolveDish(id)?.prep_ahead || []) {
      if (typeof step === "string" && step && !out.includes(step)) out.push(step);
    }
  }
  return out;
}
