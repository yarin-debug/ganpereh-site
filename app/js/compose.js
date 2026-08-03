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

/* ── עיקרית ותוספת: שכבה אחת מעל התפקיד ─────────────────────────────
   חמישה תפקידים הם החלוקה הנכונה *בתוך* צלחת, אבל הם לא השאלה
   שמתחילים בה. השאלה הראשונה היא תמיד "מה העיקר", ורק אחריה "מה
   לידו" — וקטלוג של שבעים מנות בחמש רשימות רצופות מכריח לגלול דרך
   כל התוספות כדי להגיע לחלבון הבא.

   ה-kind **נגזר מהתפקיד ואינו נשמר**, בדיוק כמו סדר הרכיבים: שינוי
   תפקיד בעורך מעביר מנה בין הקבוצות בלי הגירה ובלי שדה שני שיכול
   לסתור את הראשון. שדה שמור היה מאפשר "חלבון שהוא תוספת", וזה מצב
   שאין לו משמעות. */
export const KINDS = [
  { id: "main", label: "עיקריות", roles: ["main", "protein"] },
  { id: "side", label: "תוספות", roles: ["side", "veg", "dip"] },
];

/* מנה שלא סווגה היא מנה שלמה (ראה DEFAULT_ROLE), ולכן היא עיקרית. */
export const DEFAULT_KIND = "main";

const KIND_BY_ROLE = new Map(KINDS.flatMap((kind) => kind.roles.map((role) => [role, kind.id])));

export function isKind(id) {
  return KINDS.some((kind) => kind.id === id);
}

/** לאיזו קבוצה המנה שייכת — עיקרית או תוספת. */
export function dishKind(dish) {
  return KIND_BY_ROLE.get(dishRole(dish)) ?? DEFAULT_KIND;
}

/** תווית הקבוצה, לשימוש בכותרות ובתוויות נגישות. */
export function kindLabel(id) {
  return KINDS.find((kind) => kind.id === id)?.label || "";
}

/** התפקידים ששייכים לקבוצה, בסדר ROLES. הבסיס לקיבוץ בעורך המנה. */
export function rolesOfKind(id) {
  const kind = KINDS.find((k) => k.id === id);
  return kind ? ROLES.filter((role) => kind.roles.includes(role.id)) : [];
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

/** מנות הקבוצה בלבד, בסדר שבו הגיעו. */
export function dishesOfKind(dishes, kindId) {
  return (dishes || []).filter((dish) => dishKind(dish) === kindId);
}

/**
 * מקבץ לפי קבוצה ובתוכה לפי תפקיד — שתי הרמות באותה קריאה, כדי
 * שהבורר לא יקבץ פעמיים.
 *
 * קבוצה ריקה **כן** מוחזרת, בשונה מ-groupByRole. שם הכותרת יושבת מעל
 * רשימה וריקנות קוראת כתקלה; כאן הקבוצה היא לשונית שצריכה להתקיים גם
 * כשאין בה מנה — אחרת חיפוש שמצא רק תוספות היה מוחק את הלשונית
 * "עיקריות" מתחת לאצבע.
 */
export function groupByKind(dishes) {
  return KINDS.map((kind) => {
    const mine = dishesOfKind(dishes, kind.id);
    return { ...kind, dishes: mine, groups: groupByRole(mine) };
  });
}

/**
 * כמה רכיבים נבחרו מכל קבוצה. זה מה שהופך את הלשוניות למראה של
 * הצלחת ולא רק למסנן: "עיקריות 1 · תוספות 2" נקרא בלי לעבור ביניהן.
 */
export function countByKind(dishIds, resolveDish) {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind.id, 0]));
  for (const id of unique(dishIds)) {
    const dish = resolveDish(id);
    // מזהה שבור אינו נספר לאף קבוצה. ספירתו כעיקרית הייתה מציגה
    // "עיקריות 1" על צלחת שאין בה אחת — ראה componentRank.
    if (dish) counts[dishKind(dish)] += 1;
  }
  return counts;
}

/** האם בצלחת יש עיקרית. הבסיס לאמירה "בלי עיקרית" בכרטיס היום. */
export function hasMainComponent(dishIds, resolveDish) {
  return countByKind(dishIds, resolveDish).main > 0;
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

/**
 * המתכונים של הרכבה, מקובצים לפי רכיב ובסדר הצלחת.
 *
 * לא מאוחדים לרשימה אחת בכוונה, בשונה מ-prep_ahead: שם כל שורה עומדת
 * בפני עצמה ("לצפות את השניצל מראש"), וכאן הסדר הוא סדר *בתוך* מנה.
 * "לטגן 3 דקות לכל צד" אחרי "לשטוף את האורז" הוא מתכון שאי אפשר
 * לבשל לפיו. רכיב בלי מתכון פשוט אינו מוחזר.
 */
export function composedSteps(dishIds, resolveDish) {
  const out = [];
  for (const id of sortComponents(dishIds, resolveDish)) {
    const dish = resolveDish(id);
    const steps = (dish?.steps || []).filter((step) => typeof step === "string" && step.trim());
    if (steps.length) out.push({ id, name: dish.name_he, steps });
  }
  return out;
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
