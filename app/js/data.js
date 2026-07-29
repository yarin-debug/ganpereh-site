/* נתוני זרע לשלב א' — קבועים בקוד, לא ב-localStorage.
   ה-store מחזיק מצב משתמש בלבד (תוכנית, פרופילים, מזווה), ולכן אין כאן
   מה להגר בשדרוג. עריכת מנות אינה בשלב א'.

   מוסכמה: nutrition_per_100 הוא תמיד לכל 100 של יחידת הבסיס. כל מצרכי הזרע
   נשמרים בגרמים, כך שהמאקרו הוא לכל 100 גרם. המנוע תומך גם ב-ml וב-unit
   כיחידת בסיס — מסלולים אלה מכוסים בעמוד הבדיקות. */

/** סדר המדפים ברשימת הקניות — הסדר שבו עוברים בסופר. */
export const SHELVES = [
  { id: "produce", name_he: "ירקות ופירות" },
  { id: "meat", name_he: "בשר ועוף" },
  { id: "dairy_eggs", name_he: "מוצרי חלב וביצים" },
  { id: "dry_goods", name_he: "מוצרים יבשים" },
  { id: "pantry", name_he: "מזווה" },
];

export const INGREDIENTS = [
  {
    id: "ing.chicken_breast",
    name_he: "חזה עוף",
    aliases: ["פילה עוף", "חזה עוף טרי"],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    shelf: "meat",
    kosher: "meat",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 165, protein_g: 31, fat_g: 3.6, carbs_g: 0 },
  },
  {
    id: "ing.onion",
    name_he: "בצל",
    aliases: ["בצל יבש", "בצל לבן"],
    base_unit: "g",
    unit_weight_g: 150,
    density_g_per_ml: null,
    shelf: "produce",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 40, protein_g: 1.1, fat_g: 0.1, carbs_g: 9.3 },
  },
  {
    id: "ing.egg",
    name_he: "ביצה",
    aliases: ["ביצים"],
    base_unit: "g",
    unit_weight_g: 55,
    density_g_per_ml: null,
    shelf: "dairy_eggs",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 143, protein_g: 12.6, fat_g: 9.5, carbs_g: 0.7 },
  },
  {
    id: "ing.rice",
    name_he: "אורז לבן",
    aliases: ["אורז"],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    shelf: "dry_goods",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 360, protein_g: 6.6, fat_g: 0.6, carbs_g: 79 },
  },
  {
    id: "ing.tomato",
    name_he: "עגבנייה",
    aliases: ["עגבניות"],
    base_unit: "g",
    unit_weight_g: 120,
    density_g_per_ml: null,
    shelf: "produce",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 18, protein_g: 0.9, fat_g: 0.2, carbs_g: 3.9 },
  },
  {
    id: "ing.potato",
    name_he: "תפוח אדמה",
    aliases: ["תפוחי אדמה", "תפו״א"],
    base_unit: "g",
    unit_weight_g: 170,
    density_g_per_ml: null,
    shelf: "produce",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 77, protein_g: 2, fat_g: 0.1, carbs_g: 17 },
  },
  {
    id: "ing.breadcrumbs",
    name_he: "פירורי לחם",
    aliases: ["פירורי ציפוי"],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    shelf: "dry_goods",
    kosher: "parve",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 395, protein_g: 13, fat_g: 5.3, carbs_g: 72 },
  },
  {
    // גביע יוגורט — משקל היחידה משתנה בין מותגים, ולכן unit_weight_g נשאר null.
    // מנה שנוקבת "1 יח'" תיפול למסלול "לבדוק ידנית" במקום להמציא המרה.
    id: "ing.yogurt",
    name_he: "יוגורט טבעי",
    aliases: ["גביע יוגורט"],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    shelf: "dairy_eggs",
    kosher: "dairy",
    pantry_staple: false,
    gtin: null,
    nutrition_per_100: { kcal: 61, protein_g: 3.5, fat_g: 3.3, carbs_g: 4.7 },
  },
  {
    id: "ing.olive_oil",
    name_he: "שמן זית",
    aliases: ["שמן"],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: 0.91,
    shelf: "pantry",
    kosher: "parve",
    pantry_staple: true,
    gtin: null,
    nutrition_per_100: { kcal: 884, protein_g: 0, fat_g: 100, carbs_g: 0 },
  },
  {
    id: "ing.salt",
    name_he: "מלח",
    aliases: [],
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    shelf: "pantry",
    kosher: "parve",
    pantry_staple: true,
    gtin: null,
    nutrition_per_100: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  },
];

/** כמויות המנה הן תמיד למנה בודדת אחת. ההכפלה קורה רק בשכבת התוכנית. */
export const DISHES = [
  {
    id: "dish.schnitzel_chips",
    name_he: "שניצל וצ'יפס",
    kosher: "meat",
    effort: "medium",
    time_min: 35,
    ingredients: [
      { ingredient_id: "ing.chicken_breast", qty: 150, unit: "g" },
      { ingredient_id: "ing.egg", qty: 0.5, unit: "unit" },
      { ingredient_id: "ing.breadcrumbs", qty: 40, unit: "g" },
      { ingredient_id: "ing.potato", qty: 250, unit: "g" },
      { ingredient_id: "ing.olive_oil", qty: 20, unit: "ml" },
      { ingredient_id: "ing.salt", qty: 3, unit: "g" },
    ],
    prep_ahead: ["לצפות את השניצל מראש"],
    tags: ["comfort"],
    macros_override: null,
  },
  {
    id: "dish.rice_veg",
    name_he: "אורז עם בצל ועגבניות",
    kosher: "parve",
    effort: "low",
    time_min: 25,
    ingredients: [
      { ingredient_id: "ing.rice", qty: 80, unit: "g" },
      { ingredient_id: "ing.onion", qty: 2, unit: "unit" },
      { ingredient_id: "ing.tomato", qty: 2, unit: "unit" },
      { ingredient_id: "ing.olive_oil", qty: 15, unit: "ml" },
      { ingredient_id: "ing.salt", qty: 2, unit: "g" },
    ],
    prep_ahead: [],
    tags: ["quick"],
    macros_override: null,
  },
  {
    id: "dish.veg_omelette",
    name_he: "חביתת ירק עם יוגורט",
    kosher: "dairy",
    effort: "low",
    time_min: 15,
    ingredients: [
      { ingredient_id: "ing.egg", qty: 2, unit: "unit" },
      { ingredient_id: "ing.onion", qty: 150, unit: "g" },
      { ingredient_id: "ing.tomato", qty: 1, unit: "unit" },
      { ingredient_id: "ing.olive_oil", qty: 10, unit: "ml" },
      { ingredient_id: "ing.salt", qty: 2, unit: "g" },
      { ingredient_id: "ing.yogurt", qty: 1, unit: "unit" },
    ],
    prep_ahead: [],
    tags: ["quick"],
    macros_override: null,
  },
];

/* פרופיל ברירת המחדל — רשת ביטחון, לא משק בית.

   ── למה אחד, ולמה בלי יעדים ─────────────────────────────────────────
   כאן ישבו פעם "ירין" ו"בן/בת הזוג" עם ארבעה מספרי מאקרו כל אחד. שני
   הדברים היו שגויים: השם היה של אדם מסוים באפליקציה שאמורה להיפתח
   לכל אחד, והמספרים היו יעדים שאיש לא ביקש — בדיוק "מספר מומצא
   שנראה כמו ידיעה", שכל שאר המנוע נבנה כדי למנוע.

   מי שממלא את משק הבית באמת הוא האפיון (`ui-onboarding.js`), והוא
   כותב שמות ויעדים שנאמרו בקול. מה שנשאר כאן הוא המינימום שמונע
   מסך מאקרו בלי אף אדם — מצב שהממשק אינו יודע להציג — למי שדילג על
   האפיון או שהגיע לכאן עם מצב פגום. אפס פירושו "אין יעד", לא "יעד
   אפס", וכך המסך אכן מציג אותו. */
export const DEFAULT_PROFILES = [
  {
    id: "p1",
    name_he: "אני",
    targets: { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    dislikes: [],
  },
];

const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((ing) => [ing.id, ing]));
const DISH_BY_ID = new Map(DISHES.map((dish) => [dish.id, dish]));

export function getIngredient(id) {
  return INGREDIENT_BY_ID.get(id) || null;
}

export function getDish(id) {
  return DISH_BY_ID.get(id) || null;
}

export function getShelfName(id) {
  const shelf = SHELVES.find((s) => s.id === id);
  return shelf ? shelf.name_he : id;
}
