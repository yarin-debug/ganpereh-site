/* בדיקות המנוע וה-store.

   מפתח האחסון מוזרק, כך שהדף הזה רץ מול מפתח בדיקה ייעודי ומנקה אותו
   בסיום — גם כשהוא נפתח באוויר על אותו origin כמו האפליקציה. */

import {
  toBase,
  planLineItems,
  sumLineItems,
  dishMacros,
  composedMacros,
  slotMacrosPerEater,
  ingredientMacros,
  formatQty,
  coerceMacroOverride,
} from "../js/normalize.js";
import {
  extrasOn,
  extraMacrosPerEater,
  extrasMacrosFor,
  extraLineItems,
  frequentExtras,
  starterExtras,
  nextExtraId,
  makeExtra,
} from "../js/extras.js";
import {
  createStore,
  isoLocal,
  sundayOf,
  addDays,
  weekDates,
  PROD_KEY,
  SCHEMA_VERSION,
} from "../js/store.js";
import { INGREDIENTS, DISHES, SHELVES, getIngredient, getDish } from "../js/data.js";
import {
  normalizeEmail,
  normalizeOtpCode,
  agoPhrase,
  syncPhrase,
  authErrorMessage,
  otpErrorMessage,
} from "../js/ui-account.js";
import {
  normalizeInviteCode,
  formatInviteCode,
  inviteExpiryPhrase,
  inviteErrorMessage,
} from "../js/ui-invite.js";
import { CODE_ALPHABET } from "../js/sync/rest.js";
import { otpPath } from "../js/sync/auth.js";
import {
  dayState,
  mealState,
  dayMeals,
  visibleMeals,
  cookedStreak,
  toggleStatus,
  lineKey,
} from "../js/plan.js";
import { mergeCatalog, nextId, EFFORTS, KOSHER_TYPES } from "../js/catalog.js";
import {
  ROLES,
  isRole,
  dishRole,
  slotComponents,
  sortComponents,
  componentFields,
  componentNames,
  composedTime,
  composedPrepAhead,
  groupByRole,
  toggleComponent,
  slotWithComponents,
} from "../js/compose.js";
import { applyPantry, onHandInBase, pantryRows } from "../js/pantry.js";
import {
  activeProfiles,
  nextProfileId,
  removeEaterFromSlots,
  coerceTargets,
  dislikedBy,
  dislikedDishIds,
  setDislikes,
  dislikeLabel,
} from "../js/profiles.js";
import { lastCookedMap, recencyLabel, daysBetween, copyWeek } from "../js/history.js";
import {
  suggestDishes,
  suggestForWeek,
  scoreDish,
  pantryCoverage,
  plannedThisWeek,
  emptySlotKeys,
  WEIGHTS,
} from "../js/suggest.js";
import {
  buildBackup,
  backupFileName,
  backupSummary,
  readBackup,
  BACKUP_APP,
} from "../js/backup.js";
import { buildShareText, shareLine } from "../js/share.js";
import { fitDimensions } from "../js/images.js";
import {
  ENTITY,
  META,
  canonical,
  rowKey,
  flattenState,
  fingerprint,
  fingerprintAll,
  diffAgainst,
  applyRows,
  remoteSchemaVersion,
} from "../js/sync/entities.js";
import { weekCounts } from "../js/ui-week.js";
import { dishInitial } from "../js/ui-sheet.js";
import { dishArtUrl } from "../js/dish-art.js";
import { splitList } from "../js/ui-list.js";
import { dailyForProfile } from "../js/ui-score.js";

const TEST_KEY = "gp_meals_test__do_not_use";

/* ---------- הרנס ---------- */

const groups = [];
let current = null;
let passed = 0;
let failed = 0;

function group(name) {
  current = { name, rows: [] };
  groups.push(current);
}

function check(name, fn) {
  try {
    const detail = fn();
    current.rows.push({ name, ok: true, detail: detail || "" });
    passed++;
  } catch (error) {
    current.rows.push({ name, ok: false, detail: error.message });
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "נכשל");
}

function near(actual, expected, tolerance = 0.001) {
  assert(Math.abs(actual - expected) <= tolerance, `ציפינו ל-${expected}, קיבלנו ${actual}`);
  return `${actual}`;
}

/** אחסון מדומה — Map פשוט עם אותו ממשק. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function throwingStorage() {
  const store = fakeStorage();
  return {
    ...store,
    setItem() {
      throw new DOMException("QuotaExceededError");
    },
  };
}

const at =
  (y, m, d, h = 12) =>
  () =>
    new Date(y, m - 1, d, h);

/* ---------- המרות יחידות ---------- */

group("המרות יחידות");

const onion = getIngredient("ing.onion");
const oil = getIngredient("ing.olive_oil");
const yogurt = getIngredient("ing.yogurt");

check("בצל: 2 יחידות → 300 גרם (unit_weight_g=150)", () => {
  const r = toBase(onion, 2, "unit");
  assert(r.ok, "ההמרה נכשלה");
  return near(r.qty, 300);
});

check("בצל: 150 גרם נשאר 150 גרם", () => {
  const r = toBase(onion, 150, "g");
  assert(r.ok && r.unit === "g");
  return near(r.qty, 150);
});

check('שמן זית: 15 מ"ל × 0.91 → 13.65 גרם', () => {
  const r = toBase(oil, 15, "ml");
  assert(r.ok, "ההמרה נכשלה");
  return near(r.qty, 13.65);
});

check('ק"ג מומר לגרמים', () => {
  const r = toBase(onion, 1.5, "kg");
  assert(r.ok);
  return near(r.qty, 1500);
});

check("Covers AE5 — יחידות בלי unit_weight_g נשמרות כ'לבדוק ידנית'", () => {
  const r = toBase(yogurt, 1, "unit");
  assert(!r.ok, "היינו אמורים לא להמיר");
  assert(r.reason === "no_unit_weight", `סיבה לא צפויה: ${r.reason}`);
  assert(r.qty === 1 && r.unit === "unit", "הכמות המקורית לא נשמרה");
  return "לא הומר, הכמות המקורית נשמרה";
});

check('מ"ל בלי density לא מומר ולא מנוחש', () => {
  const r = toBase(onion, 100, "ml");
  assert(!r.ok && r.reason === "no_density", `סיבה לא צפויה: ${r.reason}`);
  return "no_density";
});

check("יחידת קלט לא מוכרת לא קורסת", () => {
  const r = toBase(onion, 2, "כוס");
  assert(!r.ok && r.reason === "unknown_unit");
  return "unknown_unit";
});

check("מצרך חסר לא קורס", () => {
  const r = toBase(null, 2, "g");
  assert(!r.ok && r.reason === "unknown_ingredient");
  return "unknown_ingredient";
});

check('בסיס ml נתמך: 20 גרם שמן → 21.978 מ"ל', () => {
  const mlOil = { ...oil, base_unit: "ml" };
  const r = toBase(mlOil, 20, "g");
  assert(r.ok && r.unit === "ml");
  return near(r.qty, 20 / 0.91, 0.01);
});

check("בסיס unit נתמך: 300 גרם בצל → 2 יחידות", () => {
  const countOnion = { ...onion, base_unit: "unit" };
  const r = toBase(countOnion, 300, "g");
  assert(r.ok && r.unit === "unit");
  return near(r.qty, 2);
});

/* ---------- סכימה ורשימת קניות ---------- */

group("סכימה ורשימת קניות");

check("Covers AE1 — 2 יח' בצל + 150 גרם בצל = 450 גרם בשורה אחת", () => {
  const items = [
    { ingredient_id: "ing.onion", qty: 2, unit: "unit" },
    { ingredient_id: "ing.onion", qty: 150, unit: "g" },
  ];
  const { lines } = sumLineItems(items, getIngredient);
  assert(lines.length === 1, `ציפינו לשורה אחת, קיבלנו ${lines.length}`);
  return near(lines[0].qty, 450);
});

check("מצרכים שונים לא מתמזגים גם כששמם דומה", () => {
  const a = { ...onion, id: "ing.onion_a", name_he: "בצל" };
  const b = { ...onion, id: "ing.onion_b", name_he: "בצל " };
  const resolve = (id) => (id === a.id ? a : b);
  const { lines } = sumLineItems(
    [
      { ingredient_id: a.id, qty: 100, unit: "g" },
      { ingredient_id: b.id, qty: 100, unit: "g" },
    ],
    resolve,
  );
  assert(lines.length === 2, `ציפינו לשתי שורות, קיבלנו ${lines.length}`);
  return "מוזג לפי id בלבד";
});

check("Covers AE2 — servings=3 מכפיל כל מצרך פי 3", () => {
  const dates = ["2026-08-02"];
  const slots = {
    "2026-08-02.dinner": {
      dish_id: "dish.schnitzel_chips",
      servings: 3,
      eaters: ["p1"],
      status: "planned",
    },
  };
  const items = planLineItems(dates, slots, getDish);
  const chicken = items.find((i) => i.ingredient_id === "ing.chicken_breast");
  assert(chicken, "חזה עוף לא נמצא");
  return near(chicken.qty, 450);
});

check("ההכפלה קורית רק בשכבת התוכנית — הגדרת המנה לא משתנה", () => {
  const dish = getDish("dish.schnitzel_chips");
  const chicken = dish.ingredients.find((i) => i.ingredient_id === "ing.chicken_breast");
  return near(chicken.qty, 150);
});

check("פריטי 'לבדוק ידנית' נצברים בנפרד ולא נבלעים", () => {
  const items = [
    { ingredient_id: "ing.yogurt", qty: 1, unit: "unit" },
    { ingredient_id: "ing.yogurt", qty: 2, unit: "unit" },
  ];
  const { lines, manual } = sumLineItems(items, getIngredient);
  assert(lines.length === 0, "לא היה אמור להיווצר סכום מנורמל");
  assert(manual.length === 1, `ציפינו לפריט ידני אחד, קיבלנו ${manual.length}`);
  return near(manual[0].qty, 3);
});

check("רשימה ריקה מחזירה תוצאה ריקה תקינה", () => {
  const { lines, manual } = sumLineItems([], getIngredient);
  assert(lines.length === 0 && manual.length === 0);
  return "אין שורות, אין קריסה";
});

check("כמות 0 מסתכמת ל-0 ולא נופלת", () => {
  const { lines } = sumLineItems(
    [{ ingredient_id: "ing.onion", qty: 0, unit: "g" }],
    getIngredient,
  );
  assert(lines.length === 1);
  return near(lines[0].qty, 0);
});

check("משבצת שדולגה או נאכלה בחוץ לא נכנסת לרשימה", () => {
  const dates = ["2026-08-02", "2026-08-03"];
  const slots = {
    "2026-08-02.dinner": {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "skipped",
    },
    "2026-08-03.dinner": {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "ate_out",
    },
  };
  const items = planLineItems(dates, slots, getDish);
  assert(items.length === 0, `ציפינו ל-0 פריטים, קיבלנו ${items.length}`);
  return "0 פריטים";
});

check("משבצות מחוץ לשבוע המוצג לא נכנסות לרשימה", () => {
  const slots = {
    "2026-07-26.dinner": {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "planned",
    },
    "2026-08-02.dinner": {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "planned",
    },
  };
  const items = planLineItems(["2026-08-02"], slots, getDish);
  const onions = items.filter((i) => i.ingredient_id === "ing.onion");
  assert(onions.length === 1, "נספרו משבצות משבוע אחר");
  return near(onions[0].qty, 2);
});

/* ---------- מזווה ומקורות ---------- */

group("מזווה ומקורות");

/** שורה מנורמלת אחת, כמו שסכימה מחזירה. */
function lineOf(id, qty, unit = "g") {
  return { ingredient: getIngredient(id), ingredient_id: id, qty, unit, sources: [] };
}

function slotOfDish(dish_id, servings) {
  return { dish_id, servings, eaters: ["p1"], status: "planned" };
}

check("בלי מזווה — צריך לקנות את הכמות המלאה", () => {
  const [row] = applyPantry([lineOf("ing.onion", 450)], {});
  assert(row.covered === false && row.stock === 0);
  return near(row.needed, 450);
});

check("כיסוי חלקי מקטין את הכמות ולא מוחק את השורה", () => {
  const [row] = applyPantry([lineOf("ing.onion", 450)], { "ing.onion": 150 });
  assert(row.covered === false, "סומן כמכוסה למרות שחסר");
  assert(row.qty === 450, "הכמות המקורית נמחקה");
  return near(row.needed, 300);
});

check("כיסוי מלא ועודף — needed לא יורד מתחת לאפס", () => {
  const [exact] = applyPantry([lineOf("ing.onion", 450)], { "ing.onion": 450 });
  const [extra] = applyPantry([lineOf("ing.onion", 450)], { "ing.onion": 1000 });
  assert(exact.covered && extra.covered, "לא סומן כמכוסה");
  assert(exact.needed === 0 && extra.needed === 0, `needed שלילי: ${extra.needed}`);
  return "0 בשני המקרים";
});

check("שארית צפה זעירה נחשבת כיסוי מלא ולא כ'צריך עוד'", () => {
  // 15 מ"ל שמן × 0.91 = 13.65 גרם, שלא נשמר בדיוק בבינארי.
  const { lines } = sumLineItems(
    [{ ingredient_id: "ing.olive_oil", qty: 15, unit: "ml" }],
    getIngredient,
  );
  const [row] = applyPantry(lines, { "ing.olive_oil": 13.65 });
  assert(row.covered, `נשארה שארית של ${row.needed}`);
  return "מכוסה";
});

check("ערך מזווה פגום מטופל כ'אין', ולא מחלחל כ-NaN לרשימה", () => {
  const junk = { "ing.onion": "הרבה", "ing.rice": -5, "ing.potato": null };
  const rows = applyPantry(
    [lineOf("ing.onion", 450), lineOf("ing.rice", 160), lineOf("ing.potato", 500)],
    junk,
  );
  for (const row of rows) {
    assert(Number.isFinite(row.needed), `needed לא מספרי אצל ${row.ingredient_id}`);
    assert(row.needed === row.qty, `נוכה משהו מערך פגום אצל ${row.ingredient_id}`);
  }
  return "3 שורות נקיות";
});

check("מזווה פגום שנשמר באחסון מנוקה בטעינה, והרשימה שנבנית ממנו תקינה", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {} },
      pantry: { "ing.onion": "הרבה", "ing.rice": 1500, "ing.potato": -3 },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 2) });
  const pantry = store.state.pantry;
  assert(pantry["ing.onion"] === undefined, "ערך טקסטואלי שרד");
  assert(pantry["ing.potato"] === undefined, "ערך שלילי שרד");
  // הצורה הישנה (מספר חשוף) מהוגרת לצורה הקנונית ולא נמחקת.
  assert(pantry["ing.rice"].qty === 1500, "ערך תקין נמחק");
  assert(pantry["ing.rice"].unit === null, "הומצאה יחידה שלא נכתבה");

  // הצרכן הבא: הרשימה שנבנית מהמזווה הזה חייבת לצאת עם מספרים אמיתיים.
  const rows = applyPantry([lineOf("ing.onion", 450), lineOf("ing.rice", 160)], pantry);
  assert(Number.isFinite(rows[0].needed) && Number.isFinite(rows[1].needed));
  assert(rows[1].covered, "1500 גרם אורז לא כיסו 160");
  return "המזווה נוקה והרשימה תקינה";
});

check("שתי ארוחות שחולקות מצרך מייצרות שורה אחת עם שני מקורות", () => {
  const dates = ["2026-08-02", "2026-08-03"];
  const slots = {
    "2026-08-02.dinner": slotOfDish("dish.rice_veg", 1),
    "2026-08-03.dinner": slotOfDish("dish.veg_omelette", 2),
  };
  const items = planLineItems(dates, slots, getDish);
  const { lines } = sumLineItems(items, getIngredient);
  const onionLine = lines.find((l) => l.ingredient_id === "ing.onion");
  assert(onionLine, "שורת בצל לא נמצאה");
  assert(onionLine.sources.length === 2, `ציפינו ל-2 מקורות, קיבלנו ${onionLine.sources.length}`);

  // הפירוט חייב להסתדר עם הסכום, אחרת השורה הפתוחה סותרת את הסגורה.
  const sum = onionLine.sources.reduce((acc, s) => acc + s.qty, 0);
  near(sum, onionLine.qty);
  // אורז עם בצל: 2 יח' × 150 = 300. חביתה: 150 גרם × 2 מנות = 300.
  return near(onionLine.qty, 600);
});

check("מקור נושא את היום, המנה והכמות המנורמלת", () => {
  const items = planLineItems(
    ["2026-08-02"],
    { "2026-08-02.dinner": slotOfDish("dish.rice_veg", 3) },
    getDish,
  );
  const { lines } = sumLineItems(items, getIngredient);
  const onionLine = lines.find((l) => l.ingredient_id === "ing.onion");
  const [source] = onionLine.sources;
  assert(source.date === "2026-08-02", `תאריך: ${source.date}`);
  assert(source.dish_id === "dish.rice_veg", `מנה: ${source.dish_id}`);
  assert(source.servings === 3, `מנות: ${source.servings}`);
  assert(source.unit === "g", `יחידה: ${source.unit}`);
  return near(source.qty, 900);
});

check("גם שורה ידנית נושאת מקורות, ביחידה המקורית שלה", () => {
  const items = planLineItems(
    ["2026-08-02"],
    { "2026-08-02.dinner": slotOfDish("dish.veg_omelette", 2) },
    getDish,
  );
  const { manual } = sumLineItems(items, getIngredient);
  const yogurt = manual.find((m) => m.ingredient_id === "ing.yogurt");
  assert(yogurt, "היוגורט לא הגיע לפריטים הידניים");
  assert(yogurt.sources.length === 1, `מקורות: ${yogurt.sources.length}`);
  assert(yogurt.sources[0].unit === "unit", `יחידה: ${yogurt.sources[0].unit}`);
  return near(yogurt.sources[0].qty, 2);
});

check("מוצר בסיס וכמות מכוסה יורדים שניהם מהמדפים", () => {
  const lines = applyPantry(
    [lineOf("ing.onion", 450), lineOf("ing.rice", 160), lineOf("ing.salt", 5)],
    { "ing.rice": 500 },
  );
  const split = splitList(lines, []);
  assert(split.toBuy === 1, `ציפינו לפריט אחד לקנייה, קיבלנו ${split.toBuy}`);
  assert(split.atHome === 2, `ציפינו ל-2 בבית, קיבלנו ${split.atHome}`);
  const shelfRows = split.shelves.flatMap((s) => s.rows).map((r) => r.ingredient_id);
  assert(shelfRows.length === 1 && shelfRows[0] === "ing.onion", shelfRows.join(","));
  return "בצל לקנות · אורז מכוסה · מלח מוצר בסיס";
});

check("הכותרת והמסך לא יכולים לסתור: אין מדפים = אין מה לקנות", () => {
  // המצב שנתפס בדפדפן: הכותרת ספרה מלח ושמן כ'פריטים לקנות' בזמן
  // שהמסך הציג 'אין מה לקנות'. שניהם נגזרים עכשיו מאותה חלוקה.
  const lines = applyPantry([lineOf("ing.onion", 450), lineOf("ing.salt", 5)], {
    "ing.onion": 9999,
  });
  const split = splitList(lines, []);
  assert(split.shelves.length === 0, `נשארו ${split.shelves.length} מדפים`);
  assert(split.toBuy === 0, `הכותרת הייתה אומרת ${split.toBuy} פריטים`);
  assert(split.atHome === 2);
  return "0 מדפים · 0 לקנות";
});

check("ספירת 'לבדיקה ידנית' סופרת רק מה שבאמת על מדף", () => {
  const onShelf = { ...lineOf("ing.yogurt", 2, "unit"), reason: "no_unit_weight" };
  const atHome = { ...lineOf("ing.olive_oil", 1, "unit"), reason: "no_unit_weight" };
  const split = splitList([], [onShelf, atHome]);
  assert(split.manualToBuy === 1, `ציפינו ל-1, קיבלנו ${split.manualToBuy}`);
  assert(split.atHome === 1, "שמן הזית לא ירד לקבוצת הבית");
  return "יוגורט נספר, שמן לא";
});

check("מצרך שלא נמצא בטקסונומיה מוצג ולא נעלם מהרשימה", () => {
  // מנה שמפנה למזהה שלא קיים — התרחיש של הזנה ידנית בשלב ג'.
  const ghost = {
    id: "dish.ghost",
    name_he: "מנת רפאים",
    ingredients: [{ ingredient_id: "ing.does_not_exist", qty: 100, unit: "g" }],
  };
  const items = planLineItems(
    ["2026-08-02"],
    { "2026-08-02.dinner": slotOfDish("dish.ghost", 1) },
    (id) => (id === "dish.ghost" ? ghost : null),
  );
  const { lines, manual } = sumLineItems(items, getIngredient);
  const split = splitList(lines, manual);

  assert(
    split.unknownRows.length === 1,
    `ציפינו לשורה אחת לא מזוהה, קיבלנו ${split.unknownRows.length}`,
  );
  assert(split.toBuy === 1, `השורה לא נספרה לקנייה: ${split.toBuy}`);
  assert(split.unknownRows[0].ingredient_id === "ing.does_not_exist");
  assert(split.atHome === 0, "שורה לא מזוהה הוגדרה בטעות כ'יש בבית'");
  return "מוצגת תחת 'לא מזוהה'";
});

check("פריט בלי מקור לא מפיל את הסכימה", () => {
  const { lines } = sumLineItems(
    [{ ingredient_id: "ing.onion", qty: 100, unit: "g" }],
    getIngredient,
  );
  assert(Array.isArray(lines[0].sources) && lines[0].sources.length === 0, "sources לא ריק");
  return "sources ריק, בלי קריסה";
});

/* ---------- סטייה מהתוכנית ---------- */

group("סטייה מהתוכנית");

const WEEK = weekDates("2026-08-02");

function slotOf(dish_id, status, eaters = ["p1"]) {
  return { dish_id, servings: 1, eaters, status };
}

check("ספירת השבוע מפרידה בין מה שבתוכנית למה שיצא ממנה", () => {
  const slots = {
    "2026-08-02.dinner": slotOf("dish.rice_veg", "planned"),
    "2026-08-03.dinner": slotOf("dish.rice_veg", "cooked"),
    "2026-08-04.dinner": slotOf("dish.rice_veg", "skipped"),
    "2026-08-05.dinner": slotOf("dish.rice_veg", "ate_out"),
  };
  const { active, off } = weekCounts(WEEK, slots);
  assert(active === 2, `ציפינו ל-2 בתוכנית, קיבלנו ${active}`);
  assert(off === 2, `ציפינו ל-2 שיצאו, קיבלנו ${off}`);
  return "2 בתוכנית · 2 יצאו";
});

check("'בישלנו' נשאר בתוכנית ולא נספר כסטייה", () => {
  const { active, off } = weekCounts(WEEK, {
    "2026-08-02.dinner": slotOf("dish.rice_veg", "cooked"),
  });
  assert(active === 1 && off === 0, `active=${active} off=${off}`);
  return "בושל = נאכל";
});

check("שבוע ריק ומשבצות ריקות לא נספרים ולא מפילים", () => {
  const empty = weekCounts(WEEK, {});
  const noSlots = weekCounts(WEEK, null);
  const noDish = weekCounts(WEEK, { "2026-08-02.dinner": { servings: 1, status: "planned" } });
  assert(empty.active === 0 && empty.off === 0);
  assert(noSlots.active === 0 && noSlots.off === 0);
  assert(noDish.active === 0 && noDish.off === 0, "משבצת בלי מנה נספרה");
  return "0 בכל המקרים";
});

check("דילוג מוציא את היום מהסקורבורד ולא מאפס אותו", () => {
  const state = {
    plan: {
      week_start: "2026-08-02",
      slots: {
        "2026-08-02.dinner": slotOf("dish.rice_veg", "planned"),
        "2026-08-03.dinner": slotOf("dish.rice_veg", "skipped"),
        "2026-08-04.dinner": slotOf("dish.rice_veg", "ate_out"),
      },
    },
  };
  const rows = dailyForProfile(state, "p1");
  assert(rows[0].status === "eaten", `יום ראשון: ${rows[0].status}`);
  assert(rows[1].status === "not_eaten", `יום שני: ${rows[1].status}`);
  assert(rows[2].status === "not_eaten", `יום שלישי: ${rows[2].status}`);
  // "לא נאכל" הוא לא אפס: יום בלי נתונים לא מושך את הסיכום כלפי מטה.
  assert(rows[1].macros === null && rows[2].macros === null, "נספר כאפס במקום כלא-נאכל");
  return "יום שדולג לא נספר ולא מאופס";
});

check("סטייה שנשמרה שורדת טעינה מחדש, וגם החזרה ממנה", () => {
  const storage = fakeStorage();
  const first = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 2) });
  first.update((s) => {
    s.plan.slots["2026-08-02.dinner"] = slotOf("dish.rice_veg", "planned");
  });
  first.update((s) => {
    s.plan.slots["2026-08-02.dinner"].status = "ate_out";
  });

  const reloaded = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 2) });
  assert(
    reloaded.state.plan.slots["2026-08-02.dinner"].status === "ate_out",
    "הסטייה לא שרדה רענון",
  );

  // הדרך חזרה: לחיצה נוספת על אותו פקד מחזירה ל-planned.
  reloaded.update((s) => {
    s.plan.slots["2026-08-02.dinner"].status = "planned";
  });
  const again = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 2) });
  const slot = again.state.plan.slots["2026-08-02.dinner"];
  assert(slot.status === "planned", `לא חזר לתכנון: ${slot.status}`);

  // והראיה שהחזרה באמת מחזירה: המצרכים חוזרים לרשימה.
  const items = planLineItems(WEEK, again.state.plan.slots, getDish);
  assert(items.length > 0, "המצרכים לא חזרו לרשימה");
  return `חזר לתוכנית עם ${items.length} מצרכים`;
});

/* ---------- מאקרו ---------- */

group("מאקרו");

check("מאקרו מנה = סכום nutrition_per_100 × qty/100", () => {
  const dish = {
    id: "dish.test",
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 200, unit: "g" }],
    macros_override: null,
  };
  const m = dishMacros(dish, getIngredient);
  assert(!m.partial, "לא היה אמור להיות חלקי");
  near(m.kcal, 330);
  return near(m.protein_g, 62);
});

check("המרת יחידות נכנסת לחישוב המאקרו", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.onion", qty: 2, unit: "unit" }],
    macros_override: null,
  };
  const m = dishMacros(dish, getIngredient);
  return near(m.kcal, 120); // 300 גרם × 40 קלוריות ל-100
});

check("macros_override גובר ומסומן כדריסה ידנית", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 200, unit: "g" }],
    macros_override: { kcal: 700, protein_g: 20, fat_g: 30, carbs_g: 60 },
  };
  const m = dishMacros(dish, getIngredient);
  assert(m.override === true, "לא סומן כדריסה");
  assert(m.partial === false, "דריסה מפורשת אינה חלקית");
  return near(m.kcal, 700);
});

check("מצרך בלי נתוני תזונה מסמן את המנה כחלקית", () => {
  const mystery = { id: "ing.x", base_unit: "g", nutrition_per_100: null };
  const dish = {
    ingredients: [
      { ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" },
      { ingredient_id: "ing.x", qty: 50, unit: "g" },
    ],
    macros_override: null,
  };
  const m = dishMacros(dish, (id) => (id === "ing.x" ? mystery : getIngredient(id)));
  assert(m.partial === true, "המנה לא סומנה כחלקית");
  return near(m.kcal, 165);
});

check("מצרך שלא ניתן להמיר מסמן את המנה כחלקית ולא כאפס שקט", () => {
  const m = dishMacros(getDish("dish.veg_omelette"), getIngredient);
  assert(m.partial === true, "היוגורט היה אמור לסמן חלקיות");
  assert(m.kcal > 0, "שאר המצרכים כן נספרו");
  return `חלקי, ${Math.round(m.kcal)} קלוריות מהשאר`;
});

check("מנה בלי מצרכים מחזירה אפסים בלי לקרוס", () => {
  const m = dishMacros({ ingredients: [], macros_override: null }, getIngredient);
  assert(m.kcal === 0 && m.partial === false);
  return "0";
});

check("חלוקה בין אוכלים: servings=3 ו-2 אוכלים → 1.5 מנות לכל אחד", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }],
    macros_override: null,
  };
  const slot = { dish_id: "x", servings: 3, eaters: ["p1", "p2"], status: "planned" };
  const m = slotMacrosPerEater(slot, [dish], getIngredient);
  return near(m.kcal, 165 * 1.5);
});

check("משבצת בלי אוכלים מסומנים לא מחלקת באפס", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }],
    macros_override: null,
  };
  const m = slotMacrosPerEater({ servings: 2, eaters: [] }, [dish], getIngredient);
  assert(m.unresolved === true, "לא סומן כלא-ניתן-לחישוב");
  assert(Number.isFinite(m.kcal), "התקבל NaN או אינסוף");
  return "unresolved, בלי NaN";
});

/* ---------- תאריכים ---------- */

group("תאריכים ושבוע");

check("week_start הוא תמיד יום ראשון — נבדק באמצע שבוע", () => {
  const wednesday = new Date(2026, 7, 5, 12); // רביעי 5.8.2026
  const sunday = sundayOf(wednesday);
  assert(sunday.getDay() === 0, "לא יום ראשון");
  return isoLocal(sunday);
});

check("week_start הוא תמיד יום ראשון — נבדק בשבת", () => {
  const saturday = new Date(2026, 7, 8, 12); // שבת 8.8.2026
  const sunday = sundayOf(saturday);
  assert(sunday.getDay() === 0);
  assert(isoLocal(sunday) === "2026-08-02", `קיבלנו ${isoLocal(sunday)}`);
  return "2026-08-02";
});

check("ביום ראשון עצמו week_start הוא אותו יום", () => {
  const sunday = new Date(2026, 7, 2, 12);
  assert(isoLocal(sundayOf(sunday)) === "2026-08-02");
  return "2026-08-02";
});

check("isoLocal לא מזיז יום בשעה 23:30 (באג UTC)", () => {
  const lateNight = new Date(2026, 7, 5, 23, 30);
  assert(isoLocal(lateNight) === "2026-08-05", `קיבלנו ${isoLocal(lateNight)}`);
  return "2026-08-05";
});

check("weekDates מחזיר שבעה ימים רצופים מראשון", () => {
  const dates = weekDates("2026-08-02");
  assert(dates.length === 7);
  assert(dates[0] === "2026-08-02" && dates[6] === "2026-08-08", dates.join(","));
  return dates[0] + " … " + dates[6];
});

check("addDays חוצה גבול חודש נכון", () => {
  assert(addDays("2026-08-30", 3) === "2026-09-02", addDays("2026-08-30", 3));
  return "2026-09-02";
});

/* ---------- אחסון ---------- */

group("אחסון והתמדה");

check("טעינה ראשונה בלי מפתח יוצרת מצב ברירת מחדל עם schema_version 1", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.schema_version === SCHEMA_VERSION);
  assert(store.state.plan.week_start === "2026-08-02", store.state.plan.week_start);
  assert(store.state.profiles.length === 2);
  assert(Object.keys(store.state.plan.slots).length === 0);
  return "ברירת מחדל תקינה";
});

check("שמירה ואז טעינה מחדש מחזירות את אותו מצב", () => {
  const storage = fakeStorage();
  const a = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  a.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = {
      dish_id: "dish.rice_veg",
      servings: 2,
      eaters: ["p1", "p2"],
      status: "planned",
    };
  });
  const b = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const slot = b.state.plan.slots["2026-08-03.dinner"];
  assert(slot && slot.dish_id === "dish.rice_veg" && slot.servings === 2, "המשבצת לא שרדה");
  return "שרד רענון";
});

check("JSON פגום מגובה, נטען מצב התחלתי, והמקור לא נדרס", () => {
  const storage = fakeStorage({ [TEST_KEY]: "{ this is not json" });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().recovered === true, "לא סומן כשוחזר");
  assert(storage.getItem(`${TEST_KEY}__corrupt`) === "{ this is not json", "הגיבוי לא נשמר");
  assert(store.statusMessage() !== null, "לא הוצגה הודעה");
  return "גובה ל-__corrupt";
});

check("פגם שני לא דורס את הגיבוי הראשון", () => {
  const storage = fakeStorage({
    [TEST_KEY]: "broken-two",
    [`${TEST_KEY}__corrupt`]: "broken-one",
  });
  createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(storage.getItem(`${TEST_KEY}__corrupt`) === "broken-one", "הגיבוי הראשון נדרס");
  assert(storage.getItem(`${TEST_KEY}__corrupt_2`) === "broken-two", "הגיבוי השני לא נשמר");
  return "שני גיבויים נשמרו";
});

check("schema_version עתידי נועל כתיבה ולא נוגע בנתונים", () => {
  const future = JSON.stringify({
    schema_version: 99,
    plan: { week_start: "2026-08-02", slots: {} },
  });
  const storage = fakeStorage({ [TEST_KEY]: future });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().writeLocked === true, "לא ננעל");
  store.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = { dish_id: "dish.rice_veg", servings: 1, eaters: ["p1"] };
  });
  assert(storage.getItem(TEST_KEY) === future, "הנתונים העתידיים נדרסו");
  assert(store.statusMessage() !== null, "לא הוצגה הודעה");
  return "ננעל, הנתונים שלמים";
});

check("כשל setItem לא קורס ומדליק אזהרה", () => {
  const store = createStore({ key: TEST_KEY, storage: throwingStorage(), now: at(2026, 8, 5) });
  const ok = store.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = { dish_id: "dish.rice_veg", servings: 1, eaters: ["p1"] };
  });
  assert(ok === false, "השמירה דיווחה על הצלחה");
  assert(store.status().saveFailed === true, "לא סומן ככשל");
  assert(store.statusMessage() !== null, "לא הוצגה אזהרה");
  return "המשיך לעבוד עם אזהרה";
});

check("גלגול שבוע: כניסה בשבוע חדש מציגה אותו, והמשבצות הישנות שרדו", () => {
  const saved = JSON.stringify({
    schema_version: 1,
    plan: {
      week_start: "2026-07-26",
      slots: {
        "2026-07-27.dinner": {
          dish_id: "dish.rice_veg",
          servings: 1,
          eaters: ["p1"],
          status: "planned",
        },
      },
    },
    profiles: [],
    pantry: {},
  });
  const storage = fakeStorage({ [TEST_KEY]: saved });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.plan.week_start === "2026-08-02", store.state.plan.week_start);
  assert(store.state.plan.slots["2026-07-27.dinner"], "המשבצת הישנה נמחקה");
  assert(store.status().weekRolled === true);
  const shown = planLineItems(
    weekDates(store.state.plan.week_start),
    store.state.plan.slots,
    getDish,
  );
  assert(shown.length === 0, "השבוע החדש לא ריק");
  return "שבוע חדש ריק, הישן שמור";
});

check("מצב חלקי מושלם, ומשבצת אמיתית שורדת לצד זבל שנזרק", () => {
  const partial = JSON.stringify({
    schema_version: 1,
    plan: {
      slots: {
        a: 1, // זבל — לא משבצת, ואסור שיגיע לרינדור
        "2026-08-03.dinner": {
          dish_id: "dish.rice_veg",
          servings: 2,
          eaters: ["p1", "p2"],
          status: "planned",
        },
      },
    },
  });
  const storage = fakeStorage({ [TEST_KEY]: partial });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.profiles.length === 2, "פרופילים לא נזרעו");
  assert(store.state.plan.week_start === "2026-08-02");
  assert(store.state.plan.slots["2026-08-03.dinner"], "המשבצת האמיתית אבדה");
  assert(store.state.plan.slots.a === undefined, "זבל שרד עד לרינדור");
  return "הושלם";
});

check("בדיקות רצות מול מפתח ייעודי — מפתח הייצור לא נגע", () => {
  const before = localStorage.getItem(PROD_KEY);
  // עוטפים את האחסון האמיתי: כל נגיעה במפתח שאינו מפתח הבדיקה נופלת
  // *לפני* הכתיבה, במקום להתגלות אחריה כשהנזק כבר נעשה.
  const guarded = {
    getItem(k) {
      assert(k.startsWith(TEST_KEY), `ניסיון קריאה ממפתח זר: ${k}`);
      return localStorage.getItem(k);
    },
    setItem(k, v) {
      assert(k.startsWith(TEST_KEY), `ניסיון כתיבה למפתח זר: ${k}`);
      localStorage.setItem(k, v);
    },
    removeItem(k) {
      assert(k.startsWith(TEST_KEY), `ניסיון מחיקת מפתח זר: ${k}`);
      localStorage.removeItem(k);
    },
  };
  try {
    const store = createStore({ key: TEST_KEY, storage: guarded, now: at(2026, 8, 5) });
    store.update((s) => {
      s.plan.slots["2026-08-03.dinner"] = { dish_id: "dish.rice_veg", servings: 1, eaters: ["p1"] };
    });
    assert(localStorage.getItem(TEST_KEY) !== null, "מפתח הבדיקה לא נכתב");
    assert(before === localStorage.getItem(PROD_KEY), "מפתח הייצור השתנה");
  } finally {
    // ניקוי ב-finally: אסרשן שנופל לא משאיר שאריות באחסון של הייצור.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(TEST_KEY)) localStorage.removeItem(key);
    }
  }
  assert(localStorage.getItem(TEST_KEY) === null, "הניקוי נכשל");
  return "נכתב ונוקה, הייצור שלם";
});

check("גיבוי שנכשל לא מדווח כאילו הצליח, והמקור לא נדרס", () => {
  const storage = fakeStorage({ [TEST_KEY]: "{ broken" });
  const original = storage.setItem;
  storage.setItem = (k, v) => {
    if (k.includes("__corrupt")) throw new DOMException("QuotaExceededError");
    return original.call(storage, k, v);
  };
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().recovered === true);
  assert(store.status().backupSaved === false, "דווח על גיבוי שלא נכתב");
  const ok = store.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = { dish_id: "dish.rice_veg", servings: 1, eaters: ["p1"] };
  });
  assert(ok === false, "כתבנו למרות שאין גיבוי");
  assert(storage.getItem(TEST_KEY) === "{ broken", "המקור הפגום נדרס");
  return "המקור שרד";
});

check("כל מקומות הגיבוי תפוסים → לא מדווח על גיבוי", () => {
  const storage = fakeStorage({
    [TEST_KEY]: "broken-new",
    [`${TEST_KEY}__corrupt`]: "1",
    [`${TEST_KEY}__corrupt_2`]: "2",
    [`${TEST_KEY}__corrupt_3`]: "3",
    [`${TEST_KEY}__corrupt_4`]: "4",
    [`${TEST_KEY}__corrupt_5`]: "5",
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().backupSaved === false);
  assert(storage.getItem(TEST_KEY) === "broken-new", "המקור נדרס");
  return "לא הובטח גיבוי";
});

check("משבצת פגומה מתוקנת ולא מפילה את הרינדור", () => {
  const stored = JSON.stringify({
    schema_version: 1,
    plan: {
      week_start: "2026-08-02",
      slots: {
        "2026-08-03.dinner": { dish_id: "dish.rice_veg" }, // בלי eaters ובלי servings
        "2026-08-04.dinner": { dish_id: "dish.rice_veg", servings: -5, eaters: "לא מערך" },
        "2026-08-05.dinner": { nonsense: true }, // בלי מנה — נזרקת
      },
    },
  });
  const storage = fakeStorage({ [TEST_KEY]: stored });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const a = store.state.plan.slots["2026-08-03.dinner"];
  const b = store.state.plan.slots["2026-08-04.dinner"];
  assert(Array.isArray(a.eaters) && a.eaters.length === 2, "eaters לא הושלם");
  assert(a.servings === 2 && a.status === "planned", "servings/status לא הושלמו");
  assert(b.servings > 0 && Array.isArray(b.eaters), "ערכים לא תקינים לא תוקנו");
  assert(!store.state.plan.slots["2026-08-05.dinner"], "משבצת בלי מנה נשמרה");
  return "תוקן";
});

check("שדות לא מוכרים בבלוב שורדים טעינה", () => {
  const stored = JSON.stringify({
    schema_version: 1,
    plan: { week_start: "2026-08-02", slots: {}, future_field: "שמור אותי" },
    profiles: [],
    pantry: {},
    top_level_extra: 42,
  });
  const storage = fakeStorage({ [TEST_KEY]: stored });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.top_level_extra === 42, "שדה עליון נחתך");
  assert(store.state.plan.future_field === "שמור אותי", "שדה בתוך plan נחתך");
  return "נשמרו";
});

check("תאריך בלתי אפשרי או לא-ראשון מתוקן ולא מקפיא את המתכנן", () => {
  const impossible = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: 1,
      plan: { week_start: "2026-99-99", slots: {} },
    }),
  });
  const a = createStore({ key: TEST_KEY, storage: impossible, now: at(2026, 8, 5) });
  assert(a.state.plan.week_start === "2026-08-02", a.state.plan.week_start);

  const wednesday = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: 1,
      plan: { week_start: "2026-08-05", slots: {} },
    }),
  });
  const b = createStore({ key: TEST_KEY, storage: wednesday, now: at(2026, 8, 5) });
  assert(b.state.plan.week_start === "2026-08-02", b.state.plan.week_start);
  return "נותב ליום ראשון";
});

check("שבוע עתידי (שעון מוטה) נתפס גם הוא", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: 1,
      plan: { week_start: "2026-09-06", slots: {} },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.plan.week_start === "2026-08-02", store.state.plan.week_start);
  return "נסגר לשבוע הנוכחי";
});

check("refresh קולט שבוע חדש בטאב שנשאר פתוח מעבר לחצות", () => {
  const storage = fakeStorage();
  let clock = new Date(2026, 7, 8, 23, 40); // מוצ"ש 8.8
  const store = createStore({ key: TEST_KEY, storage, now: () => clock });
  assert(store.state.plan.week_start === "2026-08-02", store.state.plan.week_start);
  clock = new Date(2026, 7, 9, 0, 5); // חצי שעה אחר כך — כבר ראשון
  const changed = store.refresh();
  assert(changed === true, "refresh לא זיהה שבוע חדש");
  assert(store.state.plan.week_start === "2026-08-09", store.state.plan.week_start);
  return "התגלגל ל-2026-08-09";
});

check("refresh קולט כתיבה מטאב אחר במקום לדרוס אותה", () => {
  const storage = fakeStorage();
  const tabA = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const tabB = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });

  tabA.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = {
      dish_id: "dish.rice_veg",
      servings: 2,
      eaters: ["p1", "p2"],
      status: "planned",
    };
  });
  tabB.refresh();
  tabB.update((s) => {
    s.plan.slots["2026-08-04.dinner"] = {
      dish_id: "dish.veg_omelette",
      servings: 2,
      eaters: ["p1", "p2"],
      status: "planned",
    };
  });

  const stored = JSON.parse(storage.getItem(TEST_KEY));
  assert(stored.plan.slots["2026-08-03.dinner"], "התוכנית של הטאב הראשון נמחקה");
  assert(stored.plan.slots["2026-08-04.dinner"], "התוכנית של הטאב השני לא נשמרה");
  return "שתי המשבצות שרדו";
});

check("מאזין שנופל לא מפיל את השאר", () => {
  const store = createStore({ key: TEST_KEY, storage: fakeStorage(), now: at(2026, 8, 5) });
  let reached = false;
  store.subscribe(() => {
    throw new Error("מאזין תקול");
  });
  store.subscribe(() => {
    reached = true;
  });
  const ok = store.update((s) => {
    s.pantry["ing.rice"] = 500;
  });
  assert(reached === true, "המאזין השני לא נקרא");
  assert(ok === true, "תוצאת השמירה אבדה");
  return "בודד";
});

check("אחסון חסום נופל לזיכרון עם אזהרה, בלי לקרוס", () => {
  const blocked = {
    getItem() {
      throw new DOMException("SecurityError");
    },
    setItem() {
      throw new DOMException("SecurityError");
    },
    removeItem() {},
  };
  const store = createStore({ key: TEST_KEY, storage: blocked, now: at(2026, 8, 5) });
  assert(store.state.plan.week_start === "2026-08-02", "לא נטען מצב ברירת מחדל");
  const ok = store.update((s) => {
    s.pantry["ing.rice"] = 100;
  });
  assert(ok === false, "דווח על שמירה שלא קרתה");
  assert(store.statusMessage() !== null, "לא הוצגה אזהרה");
  return "המשיך לעבוד";
});

/* ---------- שלמות נתוני הזרע ---------- */

group("שלמות נתוני הזרע");

check("הקטלוג גדול מסף ההצעות", () => {
  /* הבלוק "לא בישלנו מזמן" מוסתר כשבקטלוג פחות משבע מנות. קטלוג זרע
     מתחת לסף הזה פירושו שהפיצ'ר מת בהתקנה טרייה ומתעורר רק אצל מי
     שכבר הקליד ארבע מנות ביד — כלומר בדיוק אצל מי שהכי פחות צריך
     קיצור. הסף כאן קשור לזה ולא למספר שרירותי. */
  assert(DISHES.length > 6, `מנות: ${DISHES.length}`);
  return `${INGREDIENTS.length} מצרכים · ${DISHES.length} מנות`;
});

check("מזהים ייחודיים", () => {
  assert(new Set(INGREDIENTS.map((i) => i.id)).size === INGREDIENTS.length, "מצרך כפול");
  assert(new Set(DISHES.map((d) => d.id)).size === DISHES.length, "מנה כפולה");
  return "אין כפילויות";
});

check("כל מדף שמצרך מצביע עליו קיים ברשימת המדפים", () => {
  const known = new Set(SHELVES.map((s) => s.id));
  for (const ing of INGREDIENTS) {
    assert(known.has(ing.shelf), `${ing.id} → ${ing.shelf}`);
  }
  return `${SHELVES.length} מדפים`;
});

check("לכל מנת זרע תפקיד מוכר, ויש רכיבים מכל תפקיד", () => {
  /* נמדד דרך dishRole ולא דרך dish.role: מנה בלי השדה נופלת ל-main
     בכוונה, וזה מה שמאפשר ל-25 מנות הזרע של הקטלוג המלא להישאר מנות
     שלמות בלי לשאת שדה שכולן חולקות. בדיקה על השדה החשוף הייתה
     דורשת להדביק role: "main" על כל אחת מהן — רעש שמסתיר את המנות
     שבאמת בחרו תפקיד אחר. */
  for (const dish of DISHES) {
    assert(isRole(dishRole(dish)), `${dish.id} → ${dishRole(dish)}`);
    if ("role" in dish) assert(isRole(dish.role), `${dish.id} נושאת role לא מוכר`);
  }
  // בלי רכיב אחד לפחות מכל תפקיד, קבוצה שלמה בבורר ההרכבה נפתחת ריקה.
  for (const role of ROLES) {
    assert(
      DISHES.some((dish) => dishRole(dish) === role.id),
      `אין אף מנה בתפקיד ${role.id}`,
    );
  }
  return ROLES.map((r) => `${r.id}:${DISHES.filter((d) => dishRole(d) === r.id).length}`).join(" ");
});

check("כל המצרכים נושאים gtin (גם כשהוא null)", () => {
  assert(INGREDIENTS.every((i) => "gtin" in i));
  return "קיים על כולם";
});

check("כל מצרך במנה קיים בטקסונומיה", () => {
  for (const dish of DISHES) {
    for (const entry of dish.ingredients) {
      assert(getIngredient(entry.ingredient_id), `${dish.id} → ${entry.ingredient_id}`);
    }
  }
  return "כולם נפתרים";
});

check("כל מצרך יושב על מדף מוכר", () => {
  const known = new Set(SHELVES.map((s) => s.id));
  for (const ing of INGREDIENTS) assert(known.has(ing.shelf), `${ing.id} → ${ing.shelf}`);
  return `${SHELVES.length} מדפים`;
});

check("כשרות ומאמץ מתוך הרשימות המוכרות", () => {
  const kosher = new Set(KOSHER_TYPES.map((k) => k.id));
  const efforts = new Set(EFFORTS.map((e) => e.id));
  for (const ing of INGREDIENTS) assert(kosher.has(ing.kosher), `${ing.id} → ${ing.kosher}`);
  for (const dish of DISHES) {
    assert(kosher.has(dish.kosher), `${dish.id} → ${dish.kosher}`);
    assert(efforts.has(dish.effort), `${dish.id} → ${dish.effort}`);
  }
  return "תקין";
});

check("כשרות המנה קוהרנטית עם המצרכים שלה", () => {
  /* הבדיקה שתופסת טעות אמיתית ולא רק הקלדה: מנה שמסומנת פרווה ויש בה
     גבינה משקרת למי שסומך על התווית, ובמטבח כשר זו טעות שעולה בכלים.
     דג הוא פרווה בהלכה ולכן סלמון עובר — המדף הנפרד שלו הוא מסלול
     בסופר, לא כשרות. */
  for (const dish of DISHES) {
    for (const entry of dish.ingredients) {
      const ing = getIngredient(entry.ingredient_id);
      if (dish.kosher === "parve") {
        assert(ing.kosher === "parve", `${dish.id} פרווה, אבל ${ing.id} הוא ${ing.kosher}`);
      } else {
        assert(
          ing.kosher === "parve" || ing.kosher === dish.kosher,
          `${dish.id} (${dish.kosher}) מכיל ${ing.id} (${ing.kosher})`,
        );
      }
    }
  }
  return `${DISHES.length} מנות נבדקו`;
});

check("לכל מצרך ערכים תזונתיים תקינים", () => {
  for (const ing of INGREDIENTS) {
    const n = ing.nutrition_per_100;
    assert(n && typeof n === "object", `${ing.id} בלי nutrition_per_100`);
    for (const field of ["kcal", "protein_g", "fat_g", "carbs_g"]) {
      assert(Number.isFinite(n[field]) && n[field] >= 0, `${ing.id}.${field} = ${n[field]}`);
    }
  }
  return `${INGREDIENTS.length} מצרכים`;
});

check("כל מנה מניבה מאקרו בסדר גודל סביר", () => {
  /* רשת לטעות בסדר גודל — 3600 קק"ל במקום 360 באורז, או כמות שנרשמה
     ביחידות במקום בגרמים. הטווח רחב בכוונה: זו אינה חוות דעת תזונתית
     על המנה, רק בדיקה שהמספר לא ברח בעשירייה.

     ── למה הרצפה תלויה בתפקיד ────────────────────────────────────────
     הרצפה של 100 נכתבה כשהקטלוג היה מנות שלמות בלבד. מאז נכנסו
     *רכיבים*, וסלט עלים הוא 98 קק"ל בצדק גמור — 60 גרם חסה, 60 גרם
     מלפפון וכפית שמן זית. רצפה אחידה הייתה מכריחה לנפח את הנתון כדי
     לרצות את הבדיקה, כלומר להפוך את רשת הביטחון למקור הטעות. התקרה
     נשארת אחידה: ריצת סדר גודל כלפי מעלה שגויה בכל תפקיד. */
  const FLOOR = { main: 200, protein: 100, side: 100, veg: 40, dip: 100 };
  for (const dish of DISHES) {
    const m = dishMacros(dish, getIngredient);
    const floor = FLOOR[dishRole(dish)];
    assert(
      m.kcal >= floor && m.kcal <= 1500,
      `${dish.id} (${dishRole(dish)}): ${Math.round(m.kcal)} קק"ל למנה`,
    );
  }
  return `כולן בטווח, לפי תפקיד`;
});

check("רק מנה אחת נופלת למסלול הידני, וזו המכוונת", () => {
  /* "גביע יוגורט אחד" הוא המקרה המכוון: משקל הגביע משתנה בין מותגים,
     ולכן הוא מגיע לרשימה כ"לבדוק ידנית" במקום להמציא המרה. כל מנה
     *אחרת* שנוחתת שם היא טעות ביחידה ולא החלטה — והיא תתגלה רק
     ברשימת הקניות, אחרי שכבר סומכים עליה. */
  const offenders = [];
  for (const dish of DISHES) {
    for (const entry of dish.ingredients) {
      const result = toBase(getIngredient(entry.ingredient_id), entry.qty, entry.unit);
      if (!result.ok) offenders.push(`${dish.id} → ${entry.ingredient_id} (${result.reason})`);
    }
  }
  assert(offenders.length === 1, offenders.join(" · ") || "אף אחת — הבדיקה התיישנה");
  assert(offenders[0].startsWith("dish.veg_omelette"), offenders[0]);
  return offenders[0];
});

check("קיים מצרך נספר, נפחי, ושני pantry_staple", () => {
  assert(
    INGREDIENTS.some((i) => i.unit_weight_g != null),
    "אין מצרך נספר",
  );
  assert(
    INGREDIENTS.some((i) => i.density_g_per_ml != null),
    "אין מצרך נפחי",
  );
  assert(INGREDIENTS.filter((i) => i.pantry_staple).length >= 2, "פחות משני מוצרי מזווה");
  return "מכוסה";
});

check('formatQty עובר לק"ג מעל 1000 גרם', () => {
  assert(formatQty(1500, "g") === '1.5 ק"ג', formatQty(1500, "g"));
  assert(formatQty(450, "g") === "450 גרם", formatQty(450, "g"));
  assert(formatQty(2.5, "unit") === "2.5 יח'", formatQty(2.5, "unit"));
  return "תקין";
});

check('formatQty מעגל לפני הסף — 999.6 גרם הוא ק"ג', () => {
  assert(formatQty(999.6, "g") === '1 ק"ג', formatQty(999.6, "g"));
  assert(formatQty(999.4, "g") === "999 גרם", formatQty(999.4, "g"));
  return "הסף נבדק אחרי העיגול";
});

check("דריסת מאקרו חלקית מסומנת כחלקית ולא כידע מלא", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }],
    macros_override: { kcal: 800 },
  };
  const m = dishMacros(dish, getIngredient);
  assert(m.override === true && m.partial === true, "לא סומנה כחלקית");
  assert(m.kcal === 800 && m.protein_g === 0);
  return "חלקי + דריסה";
});

/* ---------- מצב יום, סימון ורצף ---------- */

group("מצב יום, סימון ורצף");

/** בונה משבצות ערב מתוך מפת תאריך → סטטוס. */
function slotsFrom(entries) {
  const out = {};
  for (const [date, status] of Object.entries(entries)) {
    out[`${date}.dinner`] = {
      dish_id: "dish.rice_veg",
      servings: 2,
      eaters: ["p1", "p2"],
      status,
    };
  }
  return out;
}

const TODAY = "2026-07-28";

check("יום בלי משבצת הוא 'לא תוכנן' ולא 'מתוכנן'", () => {
  assert(dayState({}, TODAY) === "empty");
  return "empty";
});

check("משבצת בלי dish_id נחשבת ריקה", () => {
  const slots = { [`${TODAY}.dinner`]: { dish_id: "", servings: 1, eaters: ["p1"] } };
  assert(dayState(slots, TODAY) === "empty");
  return "empty";
});

check("סטטוס לא מוכר נופל ל'מתוכנן' ולא מדליף למסך", () => {
  const slots = slotsFrom({ [TODAY]: "התפוצץ" });
  assert(dayState(slots, TODAY) === "planned");
  return "planned";
});

check("שלושה ימים רצופים שבושלו עד היום → רצף 3", () => {
  const slots = slotsFrom({
    [addDays(TODAY, -2)]: "cooked",
    [addDays(TODAY, -1)]: "cooked",
    [TODAY]: "cooked",
  });
  assert(cookedStreak(slots, TODAY) === 3, String(cookedStreak(slots, TODAY)));
  return "3";
});

check("ארכה להיום: טרם בושל היום, והרצף של אתמול נשמר", () => {
  const slots = slotsFrom({
    [addDays(TODAY, -2)]: "cooked",
    [addDays(TODAY, -1)]: "cooked",
    [TODAY]: "planned",
  });
  assert(cookedStreak(slots, TODAY) === 2, String(cookedStreak(slots, TODAY)));
  return "2 — היום עוד פתוח";
});

check("יום שלם בלי בישול מאפס את הרצף", () => {
  const slots = slotsFrom({
    [addDays(TODAY, -3)]: "cooked",
    [addDays(TODAY, -2)]: "cooked",
    [addDays(TODAY, -1)]: "skipped",
    [TODAY]: "planned",
  });
  assert(cookedStreak(slots, TODAY) === 0, String(cookedStreak(slots, TODAY)));
  return "0";
});

check("'אכלנו בחוץ' לא נספר כבישול", () => {
  const slots = slotsFrom({ [addDays(TODAY, -1)]: "ate_out", [TODAY]: "cooked" });
  assert(cookedStreak(slots, TODAY) === 1, String(cookedStreak(slots, TODAY)));
  return "1";
});

check('הרצף חוצה את גבול השבוע ולא מתאפס במוצ"ש', () => {
  const entries = {};
  for (let i = 0; i <= 8; i++) entries[addDays(TODAY, -i)] = "cooked";
  const slots = slotsFrom(entries);
  // תשעה ימים אחורה עוברים בהכרח יום ראשון אחד לפחות. ספירה בתוך
  // השבוע המוצג בלבד הייתה נעצרת שם.
  assert(cookedStreak(slots, TODAY) === 9, String(cookedStreak(slots, TODAY)));
  return "9 ימים על פני שני שבועות";
});

check("יום נשאר 'מתוכנן' כל עוד ארוחה אחת לא הוכרעה", () => {
  // בישלת בבוקר אבל הערב עדיין פתוח — היום לא גמור, והריבוע לא מתמלא.
  const slots = {
    [`${TODAY}.breakfast`]: { dish_id: "dish.veg_omelette", status: "cooked", eaters: ["p1"] },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "planned", eaters: ["p1"] },
  };
  assert(dayState(slots, TODAY) === "planned", dayState(slots, TODAY));
  return "planned";
});

check("יום סגור שבושל בו מתמלא", () => {
  const slots = {
    [`${TODAY}.breakfast`]: { dish_id: "dish.veg_omelette", status: "cooked", eaters: ["p1"] },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "ate_out", eaters: ["p1"] },
  };
  assert(dayState(slots, TODAY) === "cooked", dayState(slots, TODAY));
  return "cooked";
});

check("יום סגור בלי בישול נופל ל'בחוץ' לפני 'דילגנו'", () => {
  const slots = {
    [`${TODAY}.lunch`]: { dish_id: "dish.rice_veg", status: "skipped", eaters: ["p1"] },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "ate_out", eaters: ["p1"] },
  };
  assert(dayState(slots, TODAY) === "ate_out", dayState(slots, TODAY));
  return "ate_out";
});

check("יום שכולו דילוגים הוא 'דילגנו'", () => {
  const slots = {
    [`${TODAY}.lunch`]: { dish_id: "dish.rice_veg", status: "skipped", eaters: ["p1"] },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "skipped", eaters: ["p1"] },
  };
  assert(dayState(slots, TODAY) === "skipped", dayState(slots, TODAY));
  return "skipped";
});

check("mealState מבדיל בין ארוחות באותו יום", () => {
  const slots = {
    [`${TODAY}.breakfast`]: { dish_id: "dish.veg_omelette", status: "cooked", eaters: ["p1"] },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "planned", eaters: ["p1"] },
  };
  assert(mealState(slots, TODAY, "breakfast") === "cooked");
  assert(mealState(slots, TODAY, "lunch") === "empty");
  assert(mealState(slots, TODAY, "dinner") === "planned");
  return "cooked/empty/planned";
});

check("dayMeals מחזיר תמיד שלוש ארוחות, לפי סדר היום", () => {
  const meals = dayMeals({}, TODAY);
  assert(meals.length === 3, String(meals.length));
  assert(meals.map((m) => m.meal).join(",") === "breakfast,lunch,dinner");
  return meals.map((m) => m.label).join(" · ");
});

check("הרצף נספר גם כשבושלה ארוחת בוקר בלבד", () => {
  // הרצף שואל "בישלת בבית?", לא "סגרת את היום?" — אחרת ארוחת בוקר
  // מבושלת בזמן שהערב פתוח הייתה שוברת רצף באמצע היום.
  const slots = {
    [`${addDays(TODAY, -1)}.breakfast`]: { dish_id: "dish.veg_omelette", status: "cooked" },
    [`${TODAY}.breakfast`]: { dish_id: "dish.veg_omelette", status: "cooked" },
    [`${TODAY}.dinner`]: { dish_id: "dish.rice_veg", status: "planned" },
  };
  assert(cookedStreak(slots, TODAY) === 2, String(cookedStreak(slots, TODAY)));
  return "2";
});

check("שלוש ארוחות באותו יום נכנסות כולן לרשימת הקניות", () => {
  const date = "2026-08-02";
  const mk = (dish) => ({ dish_id: dish, servings: 1, eaters: ["p1"], status: "planned" });
  const slots = {
    [`${date}.breakfast`]: mk("dish.veg_omelette"),
    [`${date}.lunch`]: mk("dish.rice_veg"),
    [`${date}.dinner`]: mk("dish.rice_veg"),
  };
  const items = planLineItems([date], slots, getDish);
  const rice = items.filter((i) => i.ingredient_id === "ing.rice");
  assert(rice.length === 2, `אורז הופיע ${rice.length} פעמים`);
  const eggs = items.filter((i) => i.ingredient_id === "ing.egg");
  assert(eggs.length === 1, "החביתה לא נכנסה");
  return `${items.length} פריטים משלוש ארוחות`;
});

check("ארוחת ערב ישנה (מפתח .dinner בלבד) ממשיכה לעבוד בלי הגירה", () => {
  const slots = slotsFrom({ [TODAY]: "cooked" });
  assert(mealState(slots, TODAY, "dinner") === "cooked");
  assert(dayState(slots, TODAY) === "cooked");
  assert(cookedStreak(slots, TODAY) === 1);
  return "תוכניות קיימות שרדו";
});

check("הקשה על סימון פעיל מחזירה ל'מתוכנן'", () => {
  assert(toggleStatus("cooked", "cooked") === "planned");
  assert(toggleStatus("planned", "cooked") === "cooked");
  assert(toggleStatus("ate_out", "skipped") === "skipped");
  return "מתהפך";
});

check("מפתח שורת קנייה לא תלוי בכמות", () => {
  const a = lineKey({ ingredient: getIngredient("ing.onion"), qty: 300, unit: "g", manual: false });
  const b = lineKey({ ingredient: getIngredient("ing.onion"), qty: 900, unit: "g", manual: false });
  assert(a === b, `${a} ≠ ${b}`);
  return a;
});

check("שורה ידנית ושורה רגילה של אותו מצרך לא חולקות מפתח", () => {
  const normal = lineKey({ ingredient: getIngredient("ing.yogurt"), unit: "g", manual: false });
  const manualRow = lineKey({
    ingredient: getIngredient("ing.yogurt"),
    ingredient_id: "ing.yogurt",
    unit: "unit",
    manual: true,
  });
  assert(normal !== manualRow, `${normal} = ${manualRow}`);
  return `${normal} · ${manualRow}`;
});

/* ---------- סימוני רשימת הקניות ---------- */

group("סימוני רשימת הקניות");

check("סימון נשמר ונטען חזרה", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  store.update((s) => {
    s.plan.checked["ing.onion"] = true;
  });
  const reloaded = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  assert(reloaded.state.plan.checked["ing.onion"] === true, "הסימון לא שרד");
  return "שרד";
});

check("רק true נשמר — false נזרק ולא תופח את האובייקט", () => {
  const saved = JSON.stringify({
    schema_version: 1,
    plan: {
      week_start: "2026-07-26",
      slots: {},
      checked: { "ing.onion": true, "ing.rice": false, "ing.egg": "כן" },
    },
    profiles: [],
    pantry: {},
  });
  const storage = fakeStorage({ [TEST_KEY]: saved });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  const keys = Object.keys(store.state.plan.checked);
  assert(keys.length === 1 && keys[0] === "ing.onion", keys.join(","));
  return "רק אחד";
});

check("גלגול שבוע מנקה את הסימונים — רשימה חדשה מתחילה ריקה", () => {
  const saved = JSON.stringify({
    schema_version: 1,
    plan: {
      week_start: "2026-07-26",
      slots: {},
      checked: { "ing.onion": true, "ing.rice": true },
    },
    profiles: [],
    pantry: {},
  });
  const storage = fakeStorage({ [TEST_KEY]: saved });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.plan.week_start === "2026-08-02", store.state.plan.week_start);
  assert(Object.keys(store.state.plan.checked).length === 0, "סימונים משבוע שעבר שרדו");
  return "נוקה";
});

check("checked פגום לא מפיל את הטעינה", () => {
  const saved = JSON.stringify({
    schema_version: 1,
    plan: { week_start: "2026-07-26", slots: {}, checked: "לא אובייקט" },
    profiles: [],
    pantry: {},
  });
  const storage = fakeStorage({ [TEST_KEY]: saved });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  assert(
    store.state.plan.checked && typeof store.state.plan.checked === "object",
    "לא הוחלף באובייקט ריק",
  );
  assert(Object.keys(store.state.plan.checked).length === 0);
  return "אובייקט ריק";
});

/* ---------- קטלוג המשתמש ---------- */

group("קטלוג המשתמש");

/** מצב שמור מינימלי, עם שדות קטלוג שאפשר להזריק. */
function savedWith(extra) {
  return JSON.stringify({
    schema_version: 1,
    plan: { week_start: "2026-07-26", slots: {}, checked: {} },
    profiles: [],
    pantry: {},
    ...extra,
  });
}

function loadWith(extra) {
  const storage = fakeStorage({ [TEST_KEY]: savedWith(extra) });
  return createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
}

check("עריכת מנת זרע גוברת עליה ולא מוסיפה אותה פעמיים", () => {
  const overrides = { "dish.rice_veg": { id: "dish.rice_veg", name_he: "אורז משודרג" } };
  const merged = mergeCatalog(DISHES, overrides);
  assert(merged.length === DISHES.length, `ציפינו ל-${DISHES.length}, קיבלנו ${merged.length}`);
  const edited = merged.find((d) => d.id === "dish.rice_veg");
  assert(edited.name_he === "אורז משודרג", edited.name_he);
  return "גוברת, לא מכפילה";
});

check("מנת זרע שנערכה נשארת במקומה ולא קופצת לסוף", () => {
  const overrides = { [DISHES[0].id]: { id: DISHES[0].id, name_he: "ערוכה" } };
  const merged = mergeCatalog(DISHES, overrides);
  assert(merged[0].id === DISHES[0].id, `הראשונה היא ${merged[0].id}`);
  return "סדר נשמר";
});

check("מנת משתמש חדשה מתווספת אחרי הזרע", () => {
  const overrides = { "dish.u1": { id: "dish.u1", name_he: "משלי" } };
  const merged = mergeCatalog(DISHES, overrides);
  assert(merged.length === DISHES.length + 1);
  assert(merged[merged.length - 1].id === "dish.u1");
  return "בסוף";
});

check("פריט בארכיון יורד מהרשימה, ונשאר כשמבקשים אותו במפורש", () => {
  const overrides = { "dish.u1": { id: "dish.u1", name_he: "משלי", archived: true } };
  assert(!mergeCatalog(DISHES, overrides).some((d) => d.id === "dish.u1"), "ארכיון הופיע");
  assert(
    mergeCatalog(DISHES, overrides, { includeArchived: true }).some((d) => d.id === "dish.u1"),
    "ארכיון לא נמצא כשביקשנו",
  );
  return "יורד ונשאר נגיש";
});

check("מנת זרע בארכיון עדיין נפתרת — היסטוריה לא נשברת", () => {
  // המשבצות מצביעות על מזהה, ולכן resolve חייב להמשיך לעבוד גם
  // אחרי שהמנה ירדה מהבורר.
  const overrides = { "dish.rice_veg": { id: "dish.rice_veg", name_he: "אורז", archived: true } };
  assert(!mergeCatalog(DISHES, overrides).some((d) => d.id === "dish.rice_veg"));
  assert(overrides["dish.rice_veg"].name_he === "אורז", "ההעתק נעלם");
  return "נפתרת מחוץ לבורר";
});

check("מזהה הבא נגזר מהקיימים ולא מאקראי", () => {
  assert(nextId("dish", []) === "dish.u1", nextId("dish", []));
  assert(nextId("dish", ["dish.u1", "dish.u2"]) === "dish.u3");
  // פער ברצף לא גורם להתנגשות עם מזהה תפוס
  assert(nextId("dish", ["dish.u1", "dish.u7"]) === "dish.u8");
  // מזהי זרע אינם בסדרה ולא משפיעים
  assert(nextId("dish", ["dish.schnitzel_chips"]) === "dish.u1");
  return "רציף ויציב";
});

check("מנה בלי שם נזרקת בטעינה ולא מגיעה לבורר", () => {
  const store = loadWith({
    dishes: {
      "dish.u1": { name_he: "   ", ingredients: [] },
      "dish.u2": { name_he: "תקינה", ingredients: [] },
    },
  });
  const ids = Object.keys(store.state.dishes);
  assert(ids.length === 1 && ids[0] === "dish.u2", ids.join(","));
  return "רק התקינה";
});

check("שורת מצרך עם כמות לא תקינה נזרקת, והשאר שורד", () => {
  const store = loadWith({
    dishes: {
      "dish.u1": {
        name_he: "בדיקה",
        ingredients: [
          { ingredient_id: "ing.rice", qty: 80, unit: "g" },
          { ingredient_id: "ing.onion", qty: "הרבה", unit: "g" },
          { ingredient_id: "", qty: 10, unit: "g" },
        ],
      },
    },
  });
  const rows = store.state.dishes["dish.u1"].ingredients;
  assert(rows.length === 1 && rows[0].ingredient_id === "ing.rice", JSON.stringify(rows));
  return "שורה אחת תקינה";
});

check("ערכי מאמץ וכשרות לא מוכרים נופלים לברירת מחדל", () => {
  const store = loadWith({
    dishes: { "dish.u1": { name_he: "בדיקה", effort: "בלתי אפשרי", kosher: "??" } },
  });
  const dish = store.state.dishes["dish.u1"];
  assert(dish.effort === "medium" && dish.kosher === "parve", `${dish.effort}/${dish.kosher}`);
  return "medium/parve";
});

check("ערכי תזונה חלקיים נשמרים חלקיים ולא מושלמים באפס", () => {
  const store = loadWith({
    ingredients: {
      "ing.u1": { name_he: "ברוקולי", nutrition_per_100: { kcal: 34, protein_g: 2.8 } },
    },
  });
  const nutrition = store.state.ingredients["ing.u1"].nutrition_per_100;
  assert(nutrition.kcal === 34 && nutrition.protein_g === 2.8);
  assert(!("fat_g" in nutrition), "שומן הושלם באפס");
  return "שני שדות בלבד";
});

check("מצרך בלי שום ערך תזונתי תקין נשמר כ-null ולא כאובייקט ריק", () => {
  const store = loadWith({
    ingredients: { "ing.u1": { name_he: "פטרוזיליה", nutrition_per_100: { kcal: "לא ידוע" } } },
  });
  assert(store.state.ingredients["ing.u1"].nutrition_per_100 === null);
  return "null";
});

check("null מפורש בערך תזונתי אינו הופך לאפס", () => {
  // Number(null) הוא 0, וכך גם Number("") ו-Number(false). בשדה שהחוסר
  // בו הוא מידע זה הופך "לא יודע" ל"אפס". שדה *חסר* עובר בלי הבעיה
  // (Number(undefined) הוא NaN), ולכן זה מתעורר רק על null מפורש —
  // למשל מקובץ גיבוי שנערך ביד.
  const store = loadWith({
    ingredients: {
      "ing.u1": {
        name_he: "ברוקולי",
        nutrition_per_100: { kcal: 34, protein_g: null, fat_g: "", carbs_g: false },
      },
    },
  });
  const nutrition = store.state.ingredients["ing.u1"].nutrition_per_100;
  assert(Object.keys(nutrition).join() === "kcal", JSON.stringify(nutrition));
  return "קלוריות בלבד";
});

check("דריסת מאקרו מהאחסון מנוקה, ולא רק זו שמגיעה מהטופס", () => {
  // dishMacros פורס את הדריסה לתוך הסכום, ולכן ערך מורעל מקובץ גיבוי
  // היה מתגלגל לכל מסך שמסכם מאקרו.
  const store = loadWith({
    dishes: {
      "dish.u1": {
        name_he: "מנה במסעדה",
        macros_override: { kcal: 700, protein_g: "רע", fat_g: NaN, carbs_g: -3 },
      },
    },
  });
  const override = store.state.dishes["dish.u1"].macros_override;
  assert(Object.keys(override).join() === "kcal", JSON.stringify(override));

  const macros = dishMacros(store.state.dishes["dish.u1"], getIngredient);
  assert(Number.isFinite(macros.kcal) && macros.kcal === 700, `kcal=${macros.kcal}`);
  assert(macros.partial === true, "דריסה חלקית לא סומנה");
  return "רק kcal, מסומן חלקי";
});

check("דריסה בלי אף מספר נשמרת null ולא כאובייקט ריק truthy", () => {
  // {} הוא truthy, ולכן dishMacros היה מדווח 0 קק"ל *וגם* מתייג
  // "מאקרו ידני" — גם למנה שיש לה מצרכים לגזור מהם.
  const store = loadWith({
    dishes: { "dish.u1": { name_he: "סלט", macros_override: { kcal: "", protein_g: null } } },
  });
  assert(store.state.dishes["dish.u1"].macros_override === null);
  return "null";
});

check("מצרך שהוזן חלקית מסמן את המנה כחלקית ולא כמחושבת", () => {
  // בלי זה, שומן ופחמימות היו נספרים כאפס ומוצגים כאילו הם ידועים.
  const partialIng = {
    id: "ing.u1",
    name_he: "ברוקולי",
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    nutrition_per_100: { kcal: 34, protein_g: 2.8 },
  };
  const dish = {
    ingredients: [{ ingredient_id: "ing.u1", qty: 100, unit: "g" }],
    macros_override: null,
  };
  const macros = dishMacros(dish, () => partialIng);
  assert(macros.partial === true, "לא סומנה כחלקית");
  near(macros.kcal, 34);
  return "חלקי, והקלוריות עדיין נספרות";
});

check("מצרך עם כל ארבעת הערכים אינו מסמן חלקיות", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.rice", qty: 100, unit: "g" }],
    macros_override: null,
  };
  // getIngredient של הזרע ולא resolveIngredient של הקטלוג: הקטלוג קורא
  // ל-store של הייצור, והדף הזה לא נוגע בנתוני האפליקציה.
  const macros = dishMacros(dish, getIngredient);
  assert(macros.partial === false, "סומנה כחלקית בטעות");
  return "מלא";
});

check("קטלוג המשתמש שורד שמירה וטעינה מחדש", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  store.update((s) => {
    s.ingredients["ing.u1"] = {
      id: "ing.u1",
      name_he: "ברוקולי",
      base_unit: "g",
      shelf: "produce",
    };
    s.dishes["dish.u1"] = {
      id: "dish.u1",
      name_he: "פסטה עם ברוקולי",
      ingredients: [{ ingredient_id: "ing.u1", qty: 150, unit: "g" }],
    };
  });
  const reloaded = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  assert(reloaded.state.dishes["dish.u1"].name_he === "פסטה עם ברוקולי");
  assert(reloaded.state.ingredients["ing.u1"].name_he === "ברוקולי");
  assert(reloaded.state.dishes["dish.u1"].ingredients[0].qty === 150);
  return "שרד";
});

check("קטלוג פגום לא מפיל את הטעינה", () => {
  const store = loadWith({ dishes: "לא אובייקט", ingredients: [1, 2, 3] });
  assert(Object.keys(store.state.dishes).length === 0);
  assert(Object.keys(store.state.ingredients).length === 0);
  return "אובייקטים ריקים";
});

/* ---------- המזווה ---------- */

group("המזווה — יחידות והגירה");

check("מספר חשוף נקרא ככמות ביחידת הבסיס", () => {
  // הצורה שנכתבה בגרסה שרצה באוויר. אסור שתיקרא כ"אין במזווה".
  near(onHandInBase(150, getIngredient("ing.onion")), 150);
  return "150";
});

check("כמות עם יחידה מומרת ליחידת הבסיס", () => {
  // 2 יחידות בצל = 300 גרם. בלי ההמרה הקיזוז היה מחסיר 2 גרם.
  near(onHandInBase({ qty: 2, unit: "unit" }, getIngredient("ing.onion")), 300);
  return "300";
});

check("unit חסר פירושו 'כבר ביחידת הבסיס' ולא 'להמיר'", () => {
  near(onHandInBase({ qty: 400, unit: null }, getIngredient("ing.onion")), 400);
  return "400";
});

check("כמות שאי אפשר להמיר מוחזרת null ולא אפס", () => {
  // אפס נבלע כ"אין במזווה"; null אומר "אי אפשר להשוות", והקיזוז נמנע.
  assert(onHandInBase({ qty: 1, unit: "unit" }, getIngredient("ing.yogurt")) === null);
  return "null";
});

check("הקיזוז משתמש בהמרה, לא בכמות הגולמית", () => {
  const [row] = applyPantry([lineOf("ing.onion", 900)], {
    "ing.onion": { qty: 2, unit: "unit" },
  });
  near(row.needed, 600);
  return "600 מתוך 900";
});

check("מלאי שאי אפשר להמיר נחשב כאילו אין ממנו", () => {
  // ניכוי מנוחש היה מוריד מהרשימה פריט שבאמת חסר בבית.
  const [row] = applyPantry([lineOf("ing.yogurt", 500)], {
    "ing.yogurt": { qty: 1, unit: "unit" },
  });
  assert(row.covered === false, "קוזז בניחוש");
  near(row.needed, 500);
  return "לא קוזז";
});

check("שתי צורות האחסון שורדות טעינה זו לצד זו", () => {
  const store = loadWith({
    pantry: { "ing.rice": 1500, "ing.onion": { qty: 2, unit: "unit" } },
  });
  const pantry = store.state.pantry;
  assert(pantry["ing.rice"].qty === 1500 && pantry["ing.rice"].unit === null, "הישנה אבדה");
  assert(pantry["ing.onion"].qty === 2 && pantry["ing.onion"].unit === "unit", "החדשה אבדה");
  return "שתיהן";
});

check("יחידה לא מוכרת נופלת ל'יחידת בסיס' ולא לגרמים", () => {
  // "גרם" היה ניחוש. null אומר "הכמות כבר ביחידה של המצרך", וזה הדבר
  // היחיד שאפשר להסיק מערך שלא הובן.
  const store = loadWith({ pantry: { "ing.onion": { qty: 3, unit: "קילו-משהו" } } });
  assert(store.state.pantry["ing.onion"].unit === null);
  return "null";
});

check("שורות המזווה ממוינות לפי שם ומסמנות מה לא ניתן להמרה", () => {
  const rows = pantryRows(
    {
      "ing.yogurt": { qty: 1, unit: "unit" },
      "ing.onion": { qty: 2, unit: "unit" },
      "ing.rice": { qty: 0, unit: "g" },
      "ing.does_not_exist": { qty: 5, unit: "g" },
    },
    getIngredient,
  );
  const names = rows.map((r) => r.ingredient.name_he);
  assert(names.length === 2, names.join(","));
  assert(names[0] === "בצל", names.join(","));
  assert(rows[0].convertible === true && rows[1].convertible === false, "דגל ההמרה שגוי");
  return names.join(" · ");
});

check("גלגול שבוע לא נוגע במזווה — מה שבבית לא נעלם ביום ראשון", () => {
  const saved = savedWith({ pantry: { "ing.onion": { qty: 300, unit: "g" } } });
  const storage = fakeStorage({ [TEST_KEY]: saved });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().weekRolled === true, "השבוע לא התגלגל");
  assert(store.state.pantry["ing.onion"].qty === 300, "המזווה נמחק");
  return "המזווה שרד את הגלגול";
});

/* ---------- פרופילים ---------- */

group("פרופילים");

const P_WEEK = "2026-07-26"; // יום ראשון

function eatersSlot(eaters, servings = eaters.length) {
  return { dish_id: "dish.rice_veg", servings, eaters, status: "planned" };
}

check("פרופיל בארכיון יורד מהרשימה הפעילה ונשאר במצב", () => {
  const profiles = [
    { id: "p1", name_he: "ירין" },
    { id: "p2", name_he: "נועה", archived: true },
  ];
  const active = activeProfiles(profiles);
  assert(active.length === 1 && active[0].id === "p1", active.map((p) => p.id).join(","));
  assert(profiles.length === 2, "הפרופיל נמחק במקום לרדת לארכיון");
  return "אחד פעיל, שניים במצב";
});

check("המזהה הבא נגזר מהקיימים", () => {
  assert(nextProfileId([]) === "p1");
  assert(nextProfileId([{ id: "p1" }, { id: "p2" }]) === "p3");
  // פער ברצף לא גורם להתנגשות
  assert(nextProfileId([{ id: "p1" }, { id: "p9" }]) === "p10");
  return "רציף ויציב";
});

check("הסרת אוכל מנקה משבצות מהשבוע הנוכחי והלאה", () => {
  const slots = {
    [`${P_WEEK}.dinner`]: eatersSlot(["p1", "p2"]),
    [`2026-08-05.dinner`]: eatersSlot(["p1", "p2"]),
  };
  const out = removeEaterFromSlots(slots, "p2", P_WEEK);
  assert(out[`${P_WEEK}.dinner`].eaters.join() === "p1", "השבוע הנוכחי לא נוקה");
  assert(out["2026-08-05.dinner"].eaters.join() === "p1", "שבוע עתידי לא נוקה");
  return "נוקה";
});

check("שבועות שעברו נשארים כמו שהם — המאקרו שלהם כבר נאכל", () => {
  const slots = { "2026-07-19.dinner": eatersSlot(["p1", "p2"]) };
  const out = removeEaterFromSlots(slots, "p2", P_WEEK);
  assert(out["2026-07-19.dinner"].eaters.join() === "p1,p2", "היסטוריה שונתה");
  return "לא נגענו";
});

check("משבצת שהוא היה האוכל היחיד בה נמחקת", () => {
  // להשאיר אותה עם eaters ריק היה גרוע יותר: coerceSlots ממלא רשימה
  // ריקה בכל הפרופילים, וכך המנה הייתה מוקצית בשקט למישהו אחר.
  const slots = { [`${P_WEEK}.dinner`]: eatersSlot(["p2"]) };
  const out = removeEaterFromSlots(slots, "p2", P_WEEK);
  assert(Object.keys(out).length === 0, JSON.stringify(out));
  return "נמחקה";
});

check("מספר המנות לא יורד לבד, אבל לא נשאר מתחת למספר האוכלים", () => {
  const slots = {
    [`${P_WEEK}.a`]: eatersSlot(["p1", "p2"], 4), // בישלו לארבעה
    [`${P_WEEK}.b`]: eatersSlot(["p1", "p2"], 2),
  };
  const out = removeEaterFromSlots(slots, "p2", P_WEEK);
  assert(out[`${P_WEEK}.a`].servings === 4, "המנות ירדו לבד");
  assert(out[`${P_WEEK}.b`].servings === 2, "המנות ירדו מתחת לאוכלים");
  return "4 ו-2";
});

check("הקלט של removeEaterFromSlots לא משתנה", () => {
  const slots = { [`${P_WEEK}.dinner`]: eatersSlot(["p1", "p2"]) };
  removeEaterFromSlots(slots, "p2", P_WEEK);
  assert(slots[`${P_WEEK}.dinner`].eaters.join() === "p1,p2", "הקלט שונה");
  return "טהורה";
});

check("יעד לא תקין נקרא 'אין יעד' ולא מספר אקראי", () => {
  const targets = coerceTargets({ kcal: 2200, protein_g: "הרבה", fat_g: -10 });
  assert(targets.kcal === 2200);
  assert(targets.protein_g === 0 && targets.fat_g === 0, JSON.stringify(targets));
  assert(targets.carbs_g === 0, "שדה חסר לא אופס");
  return "2200 והשאר 0";
});

check("פרופיל בלי שם מקבל שם ממלא-מקום ולא נעלם", () => {
  const store = loadWith({ profiles: [{ id: "p1", name_he: "   " }, { id: "p2" }] });
  const names = store.state.profiles.map((p) => p.name_he);
  assert(names.length === 2, names.join(","));
  assert(
    names.every((n) => n && n.trim()),
    names.join(","),
  );
  return names.join(" · ");
});

check("יעדים עוברים נרמול בטעינה", () => {
  const store = loadWith({
    profiles: [{ id: "p1", name_he: "ירין", targets: { kcal: "2200", protein_g: 150 } }],
  });
  const targets = store.state.profiles[0].targets;
  assert(targets.kcal === 2200 && targets.protein_g === 150, JSON.stringify(targets));
  assert(targets.fat_g === 0 && targets.carbs_g === 0);
  return "מנורמל";
});

check("פרופיל בארכיון לא נשתל בחזרה למשבצת עם אוכלים ריקים", () => {
  // coerceSlots ממלא רשימת אוכלים ריקה במשק הבית — והארכיון אינו חלק ממנו.
  const store = loadWith({
    profiles: [
      { id: "p1", name_he: "ירין" },
      { id: "p2", name_he: "נועה", archived: true },
    ],
    plan: {
      week_start: P_WEEK,
      slots: { [`${P_WEEK}.dinner`]: { dish_id: "dish.rice_veg", servings: 2, eaters: [] } },
      checked: {},
    },
  });
  const eaters = store.state.plan.slots[`${P_WEEK}.dinner`].eaters;
  assert(eaters.join() === "p1", eaters.join(","));
  return "רק הפעילים";
});

check("פרופילים שורדים שמירה וטעינה מחדש", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  store.update((s) => {
    s.profiles.push({
      id: nextProfileId(s.profiles),
      name_he: "ילד",
      targets: { kcal: 1600, protein_g: 60, fat_g: 50, carbs_g: 200 },
      dislikes: [],
      archived: false,
    });
  });
  const reloaded = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  const added = reloaded.state.profiles.find((p) => p.name_he === "ילד");
  assert(added, "הפרופיל לא שרד");
  assert(added.targets.kcal === 1600);
  return `${reloaded.state.profiles.length} פרופילים`;
});

/* ---------- היסטוריה והעתקת שבוע ---------- */

group("העדפות אישיות");

const DISLIKE_PROFILES = [
  { id: "p1", name_he: "דנה", dislikes: ["dish.a", "dish.b"] },
  { id: "p2", name_he: "יואב", dislikes: ["dish.b"] },
  { id: "p3", name_he: "עבר", dislikes: ["dish.c"], archived: true },
];

check("מוחזרים רק מי שנמצא במשק הבית", () => {
  assert(
    dislikedBy(DISLIKE_PROFILES, "dish.b")
      .map((p) => p.id)
      .join() === "p1,p2",
    "לא שני הפעילים",
  );
  assert(dislikedBy(DISLIKE_PROFILES, "dish.c").length === 0, "פרופיל בארכיון נספר");
  return "פעילים בלבד";
});

check("מנה בלי מזהה אינה שנואה על אף אחד", () => {
  assert(dislikedBy(DISLIKE_PROFILES, null).length === 0);
  assert(dislikedBy(null, "dish.a").length === 0);
  return "ריק";
});

check("dislikedDishIds אוסף מהפעילים בלבד", () => {
  const ids = dislikedDishIds(DISLIKE_PROFILES);
  assert(ids.has("dish.a") && ids.has("dish.b"), [...ids].join());
  assert(!ids.has("dish.c"), "מנה של פרופיל בארכיון נכנסה");
  return [...ids].join(" · ");
});

check("סימון והסרה של סימון", () => {
  const added = setDislikes(DISLIKE_PROFILES, "dish.z", ["p2"]);
  assert(added[1].dislikes.includes("dish.z"), "לא נוסף");
  assert(!added[0].dislikes.includes("dish.z"), "נוסף למי שלא סומן");

  const removed = setDislikes(added, "dish.z", []);
  assert(!removed[1].dislikes.includes("dish.z"), "לא הוסר");
  return "נוסף והוסר";
});

check("פרופיל בארכיון לא נדרס על ידי טופס שלא הציג אותו", () => {
  /* הטופס מציג רק את מי שבמשק הבית, ולכן רשימת המסומנים לעולם לא
     תכלול אדם בארכיון. לגזור ממנה "הוא לא סומן, אז למחוק" היה מוחק
     בשקט נתון שהמשתמש מעולם לא ראה — וזו בדיוק ההעדפה שצריכה לשרוד
     עד שהוא יחזור למשק הבית. */
  const out = setDislikes(DISLIKE_PROFILES, "dish.c", ["p1"]);
  assert(out[2].dislikes.join() === "dish.c", `נדרס: ${out[2].dislikes.join()}`);
  return "שרד";
});

check("setDislikes טהורה, ולא נוגעת במי שלא השתנה", () => {
  const before = JSON.stringify(DISLIKE_PROFILES);
  const out = setDislikes(DISLIKE_PROFILES, "dish.z", ["p2"]);
  assert(JSON.stringify(DISLIKE_PROFILES) === before, "הקלט שונה");
  // p1 לא השתנה, ולכן מוחזר אותו אובייקט עצמו ולא העתק.
  assert(out[0] === DISLIKE_PROFILES[0], "פרופיל שלא השתנה שוכפל");
  return "טהורה";
});

check("התווית מסכימה עם המנה ולא מנחשת מגדר של אדם", () => {
  /* "דנה לא אוהבת" היה גוזר מגדר משם — נתון שאין לאפליקציה ושאין
     סיבה לבקש. "לא אהובה על דנה" מסכים עם *המנה*, שהיא נקבה, ולכן
     הוא נכון לכל אדם. */
  assert(dislikeLabel([{ name_he: "דנה" }]) === "לא אהובה על דנה");
  assert(dislikeLabel([{ name_he: "דנה" }, { name_he: "יואב" }]) === "לא אהובה על דנה ויואב");
  assert(
    dislikeLabel([{ name_he: "דנה" }, { name_he: "יואב" }, { name_he: "נועה" }]) ===
      "לא אהובה על דנה ועוד 2",
  );
  assert(dislikeLabel([]) === null, "רשימה ריקה החזירה טקסט");
  return "מסכים עם המנה";
});

/* ---------- דריסת מאקרו ידנית ---------- */

group("דריסת מאקרו ידנית");

check("טופס ריק אינו דריסה, ולא ארבעה אפסים", () => {
  assert(coerceMacroOverride({}) === null);
  assert(coerceMacroOverride({ kcal: "", protein_g: "", fat_g: "", carbs_g: "" }) === null);
  assert(coerceMacroOverride(null) === null);
  assert(coerceMacroOverride("700") === null, "מחרוזת התקבלה כדריסה");
  return "null";
});

check("אפס הוא ערך ולא ריק", () => {
  // יש מנות בלי שומן. לפסול אפס היה מכריח להקליד 0.1.
  const out = coerceMacroOverride({ kcal: 320, fat_g: 0 });
  assert(out.fat_g === 0, JSON.stringify(out));
  assert(out.kcal === 320);
  return "אפס נשמר";
});

check("שדה ריק לא מושלם באפס — הדריסה נשארת חלקית", () => {
  const out = coerceMacroOverride({ kcal: "700", protein_g: "" });
  assert(Object.keys(out).join() === "kcal", JSON.stringify(out));

  const macros = dishMacros({ ingredients: [], macros_override: out }, getIngredient);
  assert(macros.override === true && macros.partial === true, "לא סומנה חלקית");
  assert(macros.kcal === 700 && macros.protein_g === 0);
  return 'קלוריות בלבד, מסומן "חלקי"';
});

check("ערך שלילי או לא-מספרי נדחה, ולא מתגלגל לאפס שקט", () => {
  const out = coerceMacroOverride({ kcal: 500, protein_g: -3, fat_g: "הרבה", carbs_g: NaN });
  assert(Object.keys(out).join() === "kcal", JSON.stringify(out));
  return "רק kcal";
});

check("דריסה מלאה אינה חלקית", () => {
  const out = coerceMacroOverride({ kcal: 700, protein_g: 20, fat_g: 30, carbs_g: 60 });
  const macros = dishMacros({ ingredients: [], macros_override: out }, getIngredient);
  assert(macros.partial === false, "סומנה חלקית בטעות");
  return "מלאה";
});

/* ---------- היסטוריה והעתקת שבוע ---------- */

group("היסטוריה והעתקת שבוע");

const H_PREV = "2026-07-19"; // ראשון
const H_THIS = "2026-07-26"; // הראשון שאחריו

function cookedSlot(dish, status = "cooked", eaters = ["p1", "p2"]) {
  return { dish_id: dish, servings: eaters.length, eaters, status };
}

check("המנה שנספרת היא האחרונה שבושלה, לא האחרונה שתוכננה", () => {
  const slots = {
    "2026-07-20.dinner": cookedSlot("dish.rice_veg"),
    "2026-07-27.dinner": cookedSlot("dish.rice_veg", "planned"),
  };
  const map = lastCookedMap(slots);
  assert(map.get("dish.rice_veg") === "2026-07-20", map.get("dish.rice_veg"));
  return "20 ביולי";
});

check("מנה שנאכלה בחוץ או דולגה לא נספרת כבישול", () => {
  const slots = {
    "2026-07-20.dinner": cookedSlot("dish.rice_veg", "ate_out"),
    "2026-07-21.dinner": cookedSlot("dish.rice_veg", "skipped"),
  };
  assert(lastCookedMap(slots).size === 0, "נספרה בטעות");
  return "לא נספרה";
});

check("התאריך האחרון גובר, גם כשהוא מופיע קודם באובייקט", () => {
  const slots = {
    "2026-07-27.dinner": cookedSlot("dish.rice_veg"),
    "2026-07-20.dinner": cookedSlot("dish.rice_veg"),
  };
  assert(lastCookedMap(slots).get("dish.rice_veg") === "2026-07-27");
  return "27 ביולי";
});

check("הפרש ימים נכון גם על פני חודש", () => {
  assert(daysBetween("2026-07-28", "2026-07-28") === 0);
  assert(daysBetween("2026-07-28", "2026-07-29") === 1);
  assert(daysBetween("2026-07-28", "2026-08-04") === 7);
  assert(daysBetween("2026-06-30", "2026-07-01") === 1);
  return "0/1/7/1";
});

check("תיאור הזמן בעברית, לפי סדר גודל", () => {
  const t = "2026-07-28";
  assert(recencyLabel(null, t) === null, "מנה שלא בושלה קיבלה תווית");
  assert(recencyLabel("2026-07-28", t) === "בישלתם היום");
  assert(recencyLabel("2026-07-27", t) === "בישלתם אתמול");
  assert(recencyLabel("2026-07-25", t) === "בישלתם לפני 3 ימים");
  assert(recencyLabel("2026-07-20", t) === "בישלתם לפני שבוע");
  return "ארבע רמות";
});

check("העתקת שבוע ממלאת את המשבצות המקבילות", () => {
  const slots = {
    [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg"),
    [`2026-07-21.breakfast`]: cookedSlot("dish.veg_omelette"),
  };
  const { slots: out, added } = copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  assert(added === 2, String(added));
  assert(out[`${H_THIS}.dinner`].dish_id === "dish.rice_veg");
  // ראשון+2 בשבוע המקור → ראשון+2 בשבוע היעד
  assert(out["2026-07-28.breakfast"].dish_id === "dish.veg_omelette", "היום לא הותאם");
  return "2 הועתקו, היום נשמר";
});

check("Covers — ההעתקה מאפסת את הסטטוס ל'מתוכנן'", () => {
  // בלי זה השבוע החדש נפתח עם "בישלנו" על ארוחות שטרם קרו, והרצף
  // ורשימת הקניות משקרים.
  const slots = { [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg", "cooked") };
  const { slots: out } = copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  assert(out[`${H_THIS}.dinner`].status === "planned", out[`${H_THIS}.dinner`].status);
  return "planned";
});

check("העתקה לא דורסת משבצת שכבר תוכננה", () => {
  const slots = {
    [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg"),
    [`${H_THIS}.dinner`]: cookedSlot("dish.schnitzel_chips", "planned"),
  };
  const { slots: out, added } = copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  assert(added === 0, String(added));
  assert(out[`${H_THIS}.dinner`].dish_id === "dish.schnitzel_chips", "נדרסה");
  return "נשמרה";
});

check("אוכל שכבר לא במשק הבית מסונן מההעתקה", () => {
  const slots = { [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg", "cooked", ["p1", "p2"]) };
  const { slots: out } = copyWeek(slots, H_PREV, H_THIS, ["p1"]);
  assert(out[`${H_THIS}.dinner`].eaters.join() === "p1", out[`${H_THIS}.dinner`].eaters.join(","));
  return "p1 בלבד";
});

check("משבצת שכל אוכליה יצאו לא מועתקת בכלל", () => {
  // ליצור אותה בלי אוכלים היה שובר את חישוב המאקרו.
  const slots = { [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg", "cooked", ["p9"]) };
  const { slots: out, added } = copyWeek(slots, H_PREV, H_THIS, ["p1"]);
  assert(added === 0 && !out[`${H_THIS}.dinner`], "נוצרה משבצת יתומה");
  return "דולגה";
});

check("מספר המנות שורד את ההעתקה ולא יורד מתחת למספר האוכלים", () => {
  const slots = {
    [`${H_PREV}.dinner`]: { dish_id: "dish.rice_veg", servings: 5, eaters: ["p1", "p2"] },
  };
  const { slots: out } = copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  assert(out[`${H_THIS}.dinner`].servings === 5, String(out[`${H_THIS}.dinner`].servings));
  return "5";
});

check("שבוע מקור ריק מחזיר 0 ולא משנה כלום", () => {
  const slots = { [`${H_THIS}.dinner`]: cookedSlot("dish.rice_veg", "planned") };
  const { slots: out, added } = copyWeek(slots, H_PREV, H_THIS, ["p1"]);
  assert(added === 0);
  assert(Object.keys(out).length === 1, "הקלט השתנה");
  return "0";
});

check("copyWeek לא משנה את הקלט", () => {
  const slots = { [`${H_PREV}.dinner`]: cookedSlot("dish.rice_veg") };
  copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  assert(Object.keys(slots).length === 1, "הקלט השתנה");
  return "טהורה";
});

/* ---------- מסך הפתיחה והעדפת הארוחות ---------- */

group("מסך הפתיחה");

/* הבדיקה המרכזית של הפיצ'ר כולו: אותו שדה, שתי ברירות מחדל. משתמש
   קיים שנשלח בטעות למסך הפתיחה היה מתבקש לבנות משק בית שכבר יש לו. */
check("התקנה טרייה — מסך הפתיחה נדרש", () => {
  const store = createStore({ key: TEST_KEY, storage: fakeStorage(), now: at(2026, 8, 5) });
  assert(store.needsOnboarding() === true, "התקנה טרייה לא קיבלה מסך פתיחה");
  return "onboarded=false";
});

check("Covers AE — בלוב קיים בלי השדה נחשב למי שכבר עבר", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {}, checked: {} },
      profiles: [{ id: "p1", name_he: "דנה", targets: {}, dislikes: [] }],
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.needsOnboarding() === false, "משתמש קיים נשלח למסך הפתיחה");
  assert(store.state.profiles[0].name_he === "דנה", "משק הבית הקיים נדרס");
  return "השדה החסר נקרא כ-true";
});

check("onboarded:false מפורש מחזיר למסך הפתיחה", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {}, checked: {} },
      onboarded: false,
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.needsOnboarding() === true, "הפסקה באמצע ההגדרה לא נזכרה");
  return "נכנס באמצע הגדרה";
});

/* מסך שמבקש להגדיר משק בית בזמן שכתיבה תיכשל הוא הבטחה ריקה. */
check("סכמה עתידית מכבה את מסך הפתיחה", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({ schema_version: SCHEMA_VERSION + 1, plan: {} }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().writeLocked === true, "הכתיבה לא ננעלה");
  assert(store.needsOnboarding() === false, "הוצע להגדיר משק בית בלי יכולת לשמור");
  return "נעילת כתיבה";
});

check("JSON פגום שלא גובה מכבה את מסך הפתיחה", () => {
  const storage = fakeStorage({ [TEST_KEY]: "{ לא json" });
  // גיבוי שנכשל = המקור הפגום הוא העותק היחיד, וה-store מסרב לכתוב.
  storage.setItem = () => {
    throw new DOMException("QuotaExceededError");
  };
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.status().backupSaved === false, "הגיבוי כן נשמר");
  assert(store.needsOnboarding() === false, "הוצע להגדיר משק בית מעל נתונים שלא גובו");
  return "גיבוי נכשל";
});

check("העדפת ארוחות פגומה נופלת לשלוש", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {}, checked: {} },
      prefs: { meals: ["brunch", 7, null] },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.prefs.meals.length === 3, "רשימה ריקה לא נחלצה");
  return store.state.prefs.meals.join(",");
});

check("בלוב ישן בלי prefs מקבל את שלוש הארוחות", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {}, checked: {} },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.prefs.meals.length === 3, "משתמש קיים צומצם בשקט");
  return "שלוש";
});

check("שדה העדפה לא מוכר נשמר", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-08-02", slots: {}, checked: {} },
      prefs: { meals: ["dinner"], future_flag: "x" },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(store.state.prefs.future_flag === "x", "שדה של גרסה חדשה יותר נחתך");
  return "נשמר";
});

group("סינון ארוחות לתצוגה");

const OB_DAY = "2026-08-05";

check("מוצגות רק הארוחות שנבחרו", () => {
  const shown = visibleMeals({}, OB_DAY, ["dinner"]);
  assert(shown.length === 1, `ציפינו לאחת, קיבלנו ${shown.length}`);
  return shown[0].meal;
});

/* הכלל שמונע נתונים בלתי נראים — אותו כלל של מצרך לא מזוהה שמוצג
   ברשימה במקום להישמט בשקט. */
check("Covers AE — ארוחה מתוכננת מוצגת גם כשהיא מחוץ להעדפה", () => {
  const slots = {
    [`${OB_DAY}.breakfast`]: {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "planned",
    },
  };
  const shown = visibleMeals(slots, OB_DAY, ["dinner"]);
  const meals = shown.map((entry) => entry.meal);
  assert(meals.includes("breakfast"), "ארוחה מתוכננת נעלמה מכל מסך");
  assert(meals.includes("dinner"), "הארוחה שנבחרה ירדה");
  return meals.join(",");
});

check("ארוחה שהוכרעה מוצגת גם היא", () => {
  const slots = {
    [`${OB_DAY}.lunch`]: {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "cooked",
    },
  };
  const meals = visibleMeals(slots, OB_DAY, ["dinner"]).map((entry) => entry.meal);
  assert(meals.includes("lunch"), "ארוחה שבושלה נעלמה");
  return meals.join(",");
});

check("העדפה ריקה מציגה את הכול", () => {
  assert(visibleMeals({}, OB_DAY, []).length === 3, "רשימה ריקה הסתירה הכול");
  assert(visibleMeals({}, OB_DAY, undefined).length === 3, "חסר הסתיר הכול");
  return "שלוש";
});

check("הסדר נשמר לפי סדר היום", () => {
  const meals = visibleMeals({}, OB_DAY, ["dinner", "breakfast"]).map((entry) => entry.meal);
  assert(meals.join(",") === "breakfast,dinner", `סדר שגוי: ${meals.join(",")}`);
  return meals.join(",");
});

/* ההעדפה היא סינון תצוגה בלבד: dayState והרצף מסננים ארוחות ריקות
   ממילא, ולכן הם לא אמורים להשתנות בגללה. */
check("מצב היום אינו תלוי בהעדפה", () => {
  const slots = {
    [`${OB_DAY}.breakfast`]: {
      dish_id: "dish.rice_veg",
      servings: 1,
      eaters: ["p1"],
      status: "cooked",
    },
  };
  assert(dayState(slots, OB_DAY) === "cooked", "מצב היום השתנה");
  assert(cookedStreak(slots, OB_DAY) === 1, "הרצף השתנה");
  return "cooked";
});

/* ---------- גיבוי וייבוא ---------- */

group("גיבוי");

const SAMPLE_STATE = {
  schema_version: SCHEMA_VERSION,
  plan: {
    week_start: "2026-08-02",
    slots: {
      "2026-08-03.dinner": {
        dish_id: "dish.rice_veg",
        servings: 2,
        eaters: ["p1"],
        status: "planned",
      },
      "2026-08-04.dinner": { dish_id: "", servings: 1, eaters: ["p1"], status: "planned" },
    },
    checked: {},
  },
  profiles: [
    { id: "p1", name_he: "ירין", targets: {}, dislikes: [] },
    { id: "p2", name_he: "עבר", targets: {}, dislikes: [], archived: true },
  ],
  pantry: { "ing.onion": { qty: 300, unit: "g" } },
  dishes: { "dish.u1": { id: "dish.u1", name_he: "שלי" } },
  ingredients: {},
};

check("העטיפה נושאת מזהה אפליקציה ותאריך", () => {
  const file = buildBackup(SAMPLE_STATE, "2026-08-05");
  assert(file.app === BACKUP_APP, "אין מזהה אפליקציה");
  assert(file.exported_at === "2026-08-05", "אין תאריך");
  assert(file.state === SAMPLE_STATE, "המצב לא נשמר");
  return file.app;
});

check("שם הקובץ נושא את התאריך ובאנגלית", () => {
  const name = backupFileName("2026-08-05");
  assert(name.includes("2026-08-05"), "אין תאריך בשם");
  // עברית בשם קובץ חוזרת כג'יבריש ממערכות שונות. התוכן הוא מה שנקרא.
  assert(!/[֐-׿]/.test(name), "שם הקובץ בעברית");
  return name;
});

check("הספירה מונה רק משבצות עם מנה ורק אנשים פעילים", () => {
  const counts = backupSummary(SAMPLE_STATE);
  assert(counts.slots === 1, `ציפינו ל-1 משבצות, קיבלנו ${counts.slots}`);
  assert(counts.profiles === 1, `ציפינו ל-1 אנשים, קיבלנו ${counts.profiles}`);
  assert(counts.pantry === 1 && counts.dishes === 1, "ספירת מזווה/מנות שגויה");
  return JSON.stringify(counts);
});

check("ספירה על מצב ריק לא קורסת", () => {
  const counts = backupSummary({});
  assert(counts.slots === 0 && counts.profiles === 0, "ספירה על מצב ריק");
  return "0";
});

check("סיבוב מלא — ייצוא וקריאה חזרה", () => {
  const text = JSON.stringify(buildBackup(SAMPLE_STATE, "2026-08-05"));
  const result = readBackup(text, SCHEMA_VERSION);
  assert(result.ok, result.error);
  assert(result.state.profiles[0].name_he === "ירין", "המצב לא חזר שלם");
  return "חזר שלם";
});

/* מי שהעתיק את הערך היישר מ-localStorage כדי להציל נתונים מדפדפן
   שנתקע מחזיק ביד בדיוק את הצורה הזו. */
check("Covers AE — בלוב מצב חשוף מתקבל גם בלי עטיפה", () => {
  const result = readBackup(JSON.stringify(SAMPLE_STATE), SCHEMA_VERSION);
  assert(result.ok, result.error);
  assert(result.state.pantry["ing.onion"].qty === 300, "המזווה לא נקרא");
  return "התקבל";
});

check("קובץ שאינו JSON נדחה בהודעה", () => {
  const result = readBackup("{ לא json", SCHEMA_VERSION);
  assert(!result.ok, "קובץ שבור התקבל");
  assert(result.error.length > 10, "אין הודעה מסבירה");
  return "נדחה";
});

check("JSON תקין שאינו גיבוי נדחה", () => {
  assert(!readBackup('{"hello":1}', SCHEMA_VERSION).ok, "אובייקט זר התקבל");
  assert(!readBackup("[1,2,3]", SCHEMA_VERSION).ok, "מערך התקבל");
  assert(!readBackup('"just a string"', SCHEMA_VERSION).ok, "מחרוזת התקבלה");
  return "שלושתם נדחו";
});

/* אותו כלל כמו נעילת הכתיבה: עדיף לסרב מאשר לקצץ שדות בשקט. */
check("Covers AE — גיבוי מסכמה עתידית נדחה ולא מקוצץ", () => {
  const future = JSON.stringify({ ...SAMPLE_STATE, schema_version: SCHEMA_VERSION + 1 });
  const result = readBackup(future, SCHEMA_VERSION);
  assert(!result.ok, "גיבוי מגרסה חדשה יותר נטען");
  assert(result.error.includes("חדשה יותר"), "ההודעה לא מסבירה מה קרה");
  return "נדחה";
});

check("גיבוי מסכמה ישנה יותר מתקבל", () => {
  const old = JSON.stringify({ ...SAMPLE_STATE, schema_version: SCHEMA_VERSION - 1 });
  assert(readBackup(old, SCHEMA_VERSION).ok, "גיבוי ישן נדחה");
  return "התקבל";
});

group("ייבוא ל-store");

check("ייבוא מחליף את המצב ומגבה את הקודם", () => {
  const before = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    plan: { week_start: "2026-08-02", slots: {}, checked: {} },
    profiles: [{ id: "p1", name_he: "לפני", targets: {}, dislikes: [] }],
  });
  const storage = fakeStorage({ [TEST_KEY]: before });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });

  const result = store.importState(SAMPLE_STATE);
  assert(result.ok, `הייבוא נכשל: ${result.reason}`);
  assert(store.state.profiles[0].name_he === "ירין", "המצב לא הוחלף");
  assert(storage.getItem(`${TEST_KEY}__before_import`) === before, "הקודם לא גובה");
  return "הוחלף וגובה";
});

/* הכלל שמונע מטעות שנייה למחוק את התיקון של הראשונה. */
check("Covers AE — ייבוא שני לא דורס את הגיבוי הראשון", () => {
  const original = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    plan: { week_start: "2026-08-02", slots: {}, checked: {} },
    profiles: [{ id: "p1", name_he: "המקורי", targets: {}, dislikes: [] }],
  });
  const storage = fakeStorage({ [TEST_KEY]: original });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });

  store.importState(SAMPLE_STATE);
  store.importState({ ...SAMPLE_STATE, profiles: [{ id: "p1", name_he: "שני", targets: {} }] });

  const saved = JSON.parse(storage.getItem(`${TEST_KEY}__before_import`));
  assert(saved.profiles[0].name_he === "המקורי", "הגיבוי המקורי נדרס");
  return "המקורי שרד";
});

check("גיבוי שנכשל מבטל את הייבוא", () => {
  const before = JSON.stringify({
    schema_version: SCHEMA_VERSION,
    plan: { week_start: "2026-08-02", slots: {}, checked: {} },
    profiles: [{ id: "p1", name_he: "לפני", targets: {}, dislikes: [] }],
  });
  const storage = fakeStorage({ [TEST_KEY]: before });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  storage.setItem = () => {
    throw new DOMException("QuotaExceededError");
  };

  const result = store.importState(SAMPLE_STATE);
  assert(
    !result.ok && result.reason === "backup_failed",
    `ציפינו ל-backup_failed, קיבלנו ${result.reason}`,
  );
  assert(store.state.profiles[0].name_he === "לפני", "המצב הוחלף למרות שהגיבוי נכשל");
  return "בוטל";
});

check("סכמה עתידית נועלת גם את הייבוא", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({ schema_version: SCHEMA_VERSION + 1, plan: {} }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const result = store.importState(SAMPLE_STATE);
  assert(!result.ok && result.reason === "locked", `ציפינו ל-locked, קיבלנו ${result.reason}`);
  return "ננעל";
});

check("ייבוא מנרמל קלט פגום כמו כל טעינה", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  store.importState({
    schema_version: SCHEMA_VERSION,
    plan: { week_start: "לא תאריך", slots: { bad: null }, checked: { x: "לא true" } },
    profiles: [{ id: "p1", name_he: "  ירין  ", targets: { kcal: "רע" }, dislikes: [] }],
    pantry: { "ing.onion": { qty: -5, unit: "g" } },
  });
  assert(store.state.profiles[0].name_he === "ירין", "השם לא נוקה");
  assert(store.state.profiles[0].targets.kcal === 0, "יעד פגום לא נוקה");
  assert(Object.keys(store.state.plan.slots).length === 0, "משבצת פגומה נכנסה");
  assert(Object.keys(store.state.pantry).length === 0, "כמות שלילית נכנסה");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(store.state.plan.week_start), "תאריך פגום נכנס");
  return "נורמל";
});

check("ייבוא מודיע למאזינים", () => {
  const store = createStore({ key: TEST_KEY, storage: fakeStorage(), now: at(2026, 8, 5) });
  let calls = 0;
  store.subscribe(() => calls++);
  store.importState(SAMPLE_STATE);
  assert(calls === 1, `ציפינו להודעה אחת, קיבלנו ${calls}`);
  return "הודיע";
});

/* ---------- הקבוצה "מה כבר בתוכנית" ירדה, ולמה זה לא חור בכיסוי ----

   כאן ישבה קבוצה שלמה שבדקה שתי פונקציות שאיבדו את הקורא שלהן במיזוג
   שאיחד את בורר המנה על `suggestDishes`:

   - `forgottenDishes` — תשע בדיקות, ירדו יחד עם הפונקציה.
   - `plannedDishIds` — בדיקה אחת, ירדה יחד עם הפונקציה.

   שתי ההתנהגויות עצמן חיות וממשיכות להיבדק בקבוצת "מנוע ההצעות":
   "בישלנו מזמן" הוא המשקל `cookedLongAgo` (אותם 14 יום, דרך
   `lastCookedMap`), ו"המנה כבר על הלוח השבוע" הוא `plannedThisWeek` —
   שנבדק גם על איסוף מכל הארוחות בשבוע וגם על כך שמנה משבוע קודם אינה
   נספרת ("בישול בשבוע שעבר לא נספר כחזרה בשבוע הזה").

   בדיקה שמכסה פונקציה שאין לה קורא קונה ביטחון מדומה — היא ירוקה בלי
   שאף מסך תלוי בה, והירוק הזה הוא בדיוק מה שמזמין לחווט את הקוד המת
   בחזרה במקום להרחיב את המנוע שכן פועל. */

/* ---------- שיתוף הרשימה ---------- */

group("שיתוף הרשימה");

const shareRow = (name, qty, unit = "g", extra = {}) => ({
  ingredient: { id: `ing.${name}`, name_he: name },
  ingredient_id: `ing.${name}`,
  qty,
  unit,
  ...extra,
});

check("שורה רגילה נושאת את הכמות לקנייה", () => {
  const line = shareLine(shareRow("בצל", 300));
  assert(line.includes("בצל"), "אין שם");
  assert(line.includes("300 גרם"), `כמות שגויה: ${line}`);
  return line;
});

/* needed הוא מה שנשאר לקנות אחרי המזווה; qty הוא מה שהשבוע צורך.
   שיתוף שנוקב ב-qty היה שולח את הקונה לקנות מה שכבר בבית. */
check("Covers AE — needed גובר על qty כשהמזווה כיסה חלק", () => {
  const line = shareLine(shareRow("אורז", 1000, "g", { needed: 400 }));
  assert(line.includes("400"), `ציפינו ל-400: ${line}`);
  assert(!line.includes("1000"), `qty דלף לשיתוף: ${line}`);
  return line;
});

check("שורה ידנית נושאת את ההערה", () => {
  const line = shareLine(shareRow("יוגורט", 2, "unit", { manual: true }), "להעריך בסופר");
  assert(line.includes("להעריך בסופר"), `ההערה נעלמה: ${line}`);
  return line;
});

check("מצרך לא מזוהה מוצג במזהה הגולמי", () => {
  const line = shareLine({ ingredient: null, ingredient_id: "ing.xyz", qty: 2, unit: "unit" });
  assert(line.includes("ing.xyz"), `המזהה נעלם: ${line}`);
  return line;
});

check("הטקסט מקובץ למדפים לפי סדר", () => {
  const text = buildShareText([
    { title: "ירקות ופירות", rows: [shareRow("בצל", 300)] },
    { title: "בשר ועוף", rows: [shareRow("עוף", 600)] },
  ]);
  assert(text.indexOf("ירקות ופירות") < text.indexOf("בשר ועוף"), "הסדר התהפך");
  assert(text.includes("בצל") && text.includes("עוף"), "שורה חסרה");
  return text.split("\n").length + " שורות";
});

check("מדף ריק לא מייצר כותרת תלויה באוויר", () => {
  const text = buildShareText([
    { title: "ריק", rows: [] },
    { title: "מלא", rows: [shareRow("בצל", 300)] },
  ]);
  assert(!text.includes("ריק"), "כותרת של מדף ריק נכנסה");
  return "הושמט";
});

/* כפתור שמייצר הודעה ריקה גרוע מכפתור שלא קיים — הממשק נשען על
   המחרוזת הריקה כדי להסתיר את עצמו. */
check("Covers AE — אין מה לקנות מחזיר מחרוזת ריקה", () => {
  assert(buildShareText([]) === "", "מערך ריק לא החזיר ריק");
  assert(buildShareText([{ title: "מדף", rows: [] }], { heading: "כותרת" }) === "", "כותרת לבדה");
  return "ריק";
});

check("כותרת ומספר מה שבעגלה נכנסים", () => {
  const text = buildShareText([{ title: "מדף", rows: [shareRow("בצל", 300)] }], {
    heading: "רשימת קניות · 26 ביולי",
    inCart: 3,
  });
  assert(text.startsWith("רשימת קניות"), "הכותרת לא בראש");
  assert(text.includes("3 פריטים כבר בעגלה"), `ספירת העגלה חסרה: ${text}`);
  return "נכנסו";
});

check("פריט אחד בעגלה נאמר ביחיד", () => {
  const text = buildShareText([{ title: "מדף", rows: [shareRow("בצל", 300)] }], { inCart: 1 });
  assert(text.includes("פריט אחד כבר בעגלה"), `ניסוח שגוי: ${text}`);
  return "יחיד";
});

check("אפס בעגלה לא מוסיף שורה", () => {
  const text = buildShareText([{ title: "מדף", rows: [shareRow("בצל", 300)] }], { inCart: 0 });
  assert(!text.includes("בעגלה"), "נוספה שורה מיותרת");
  return "נקי";
});

/* ---------- תמונות מנה ---------- */

group("כיווץ תמונה");

check("צלע ארוכה מכווצת לגבול", () => {
  const out = fitDimensions(4032, 3024, 900);
  assert(out.width === 900, `רוחב ${out.width}`);
  assert(out.height === 675, `גובה ${out.height}`);
  return `${out.width}x${out.height}`;
});

check("תמונה לאורך מכווצת לפי הגובה", () => {
  const out = fitDimensions(3024, 4032, 900);
  assert(out.height === 900 && out.width === 675, `${out.width}x${out.height}`);
  return `${out.width}x${out.height}`;
});

/* הגדלה רק מנפחת את הקובץ בלי להוסיף מידע. */
check("Covers AE — תמונה קטנה מהגבול לא מוגדלת", () => {
  const out = fitDimensions(320, 240, 900);
  assert(out.width === 320 && out.height === 240, `${out.width}x${out.height}`);
  return "נשארה";
});

check("יחס הצדדים נשמר בריבוע", () => {
  const out = fitDimensions(2000, 2000, 900);
  assert(out.width === out.height && out.width === 900, `${out.width}x${out.height}`);
  return "900x900";
});

check("מידות פגומות לא מחזירות אפס או NaN", () => {
  for (const bad of [
    [0, 0],
    [NaN, 100],
    [undefined, undefined],
    [-50, -50],
  ]) {
    const out = fitDimensions(bad[0], bad[1], 900);
    assert(out.width >= 1 && out.height >= 1, `${bad} → ${out.width}x${out.height}`);
    assert(Number.isFinite(out.width) && Number.isFinite(out.height), `NaN על ${bad}`);
  }
  return "חסין";
});

/* ---------- אריח האות ---------- */

group("אריח מנה בלי תמונה");

check("האות הראשונה של שם עברי", () => {
  assert(dishInitial("שקשוקה") === "ש", dishInitial("שקשוקה"));
  assert(dishInitial("אורז מוקפץ עם ירקות") === "א", dishInitial("אורז מוקפץ עם ירקות"));
  return "ש · א";
});

/* מנה בשם ‎"'שקשוקה' של אמא" הייתה מקבלת גרש כסימן הזיהוי שלה. */
check("סימני פיסוק וספרות בראש השם מדולגים", () => {
  assert(dishInitial("'שקשוקה' של אמא") === "ש", dishInitial("'שקשוקה' של אמא"));
  assert(dishInitial('"פסטה" ברוטב') === "פ", dishInitial('"פסטה" ברוטב'));
  assert(dishInitial("  טוסט") === "ט", dishInitial("  טוסט"));
  assert(dishInitial("2 ביצים") === "ב", dishInitial("2 ביצים"));
  assert(dishInitial("־מרק") === "מ", dishInitial("־מרק"));
  return "מדלג";
});

check("שם לטיני עובד גם הוא", () => {
  assert(dishInitial("Shakshuka") === "S", dishInitial("Shakshuka"));
  return "S";
});

/* מחרוזת ריקה הייתה מקריסה את גובה האריח ושוברת את יישור הרשימה —
   בדיוק מה שהאריח נוסף כדי לתקן. */
check("Covers AE — שם בלי אף אות מחזיר סימן ניטרלי", () => {
  for (const bad of ["", "   ", "123", "!!!", null, undefined]) {
    const out = dishInitial(bad);
    assert(out.length === 1, `${JSON.stringify(bad)} → ${JSON.stringify(out)}`);
  }
  return "· לכולם";
});

/* ---------- איור מובנה ---------- */

group("איור מנה מובנה");

check("מנה שיש לה איור מחזירה נתיב", () => {
  const url = dishArtUrl("dish.shakshuka");
  assert(url === "images/dishes/shakshuka.webp", String(url));
  return url;
});

/* השאלה נענית מול המניפסט ולא מול הרשת. בקשה שנכשלת ב-404 על כל מנה
   בלי איור הייתה ממלאת את הקונסולה ברעש שמסתיר תקלות אמיתיות. */
check("מנה בלי איור מחזירה null ולא נתיב שבור", () => {
  assert(dishArtUrl("dish.pasta_bolognese") === null, String(dishArtUrl("dish.pasta_bolognese")));
  return "null";
});

check("מנה שהמשתמש הוסיף בעצמו נופלת לאריח האות", () => {
  assert(dishArtUrl("dish.custom_1754160000000") === null, "מנה מותאמת קיבלה איור");
  return "null";
});

check("Covers AE — קלט פגום לא זורק", () => {
  for (const bad of [null, undefined, "", 0, "לא-מזהה"]) {
    assert(dishArtUrl(bad) === null, `${JSON.stringify(bad)} → ${dishArtUrl(bad)}`);
  }
  return "חסין";
});

/* ---------- מנוע ההצעות ---------- */

group("מנוע ההצעות");

const S_WEEK = "2026-07-26"; // ראשון
const S_DATES = weekDates(S_WEEK);
const S_TODAY = "2026-07-29"; // רביעי באותו שבוע

/* קטלוג מדומה קטן ומפורש. נתוני הזרע משתנים לפי צורכי המוצר, ובדיקת
   דירוג שנשענת עליהם הייתה נשברת בכל הוספת מנה — בלי שהמנוע השתנה. */
const S_ING = {
  "ing.a": { id: "ing.a", name_he: "אלף", base_unit: "g", unit_weight_g: null },
  "ing.b": { id: "ing.b", name_he: "בית", base_unit: "g", unit_weight_g: null },
  // בלי unit_weight_g — כמות ב"יחידה" לא ניתנת להמרה לגרמים
  "ing.cup": { id: "ing.cup", name_he: "גביע", base_unit: "g", unit_weight_g: null },
};
const sIng = (id) => S_ING[id] || null;

function sDish(id, name, ingredients = [], time = 20) {
  return { id, name_he: name, time_min: time, effort: "low", ingredients };
}

const S_ONE = sDish("dish.s1", "מנה ראשונה", [{ ingredient_id: "ing.a", qty: 100, unit: "g" }]);
const S_TWO = sDish("dish.s2", "מנה שנייה", [{ ingredient_id: "ing.b", qty: 100, unit: "g" }]);

function sContext(extra = {}) {
  return {
    dishes: [S_ONE, S_TWO],
    slots: {},
    dates: S_DATES,
    pantry: {},
    resolveIngredient: sIng,
    todayIso: S_TODAY,
    servings: 1,
    ...extra,
  };
}

/* ---------- סנכרון: פירוק, מיזוג והתנגשויות ---------- */

group("סנכרון — פירוק והרכבה");

/** מצב מינימלי אך שלם, לבניית תרחישים. */
function syncState(extra = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    plan: {
      week_start: "2026-07-26",
      slots: {
        "2026-07-27.dinner": { dish_id: "d1", servings: 2, eaters: ["p1"], status: "planned" },
      },
      checked: { "line-a": true },
    },
    profiles: [
      { id: "p1", name_he: "ירין", targets: {}, dislikes: [], archived: false },
      { id: "p2", name_he: "עידו", targets: {}, dislikes: [], archived: false },
    ],
    pantry: { onion: { qty: 300, unit: null } },
    dishes: { d1: { id: "d1", name_he: "שקשוקה", ingredients: [] } },
    ingredients: {},
    prefs: { meals: ["breakfast", "lunch", "dinner"] },
    onboarded: true,
    ...extra,
  };
}

check("מנה שלא בושלה מעולם מקבלת נימוק ולא שתיקה", () => {
  const [top] = suggestDishes(sContext({ dishes: [S_ONE] }));
  assert(top.score === WEIGHTS.neverCooked, String(top.score));
  assert(top.reasons[0].text === "עוד לא בישלתם", top.reasons[0].text);
  assert(top.reasons[0].tone === "good", top.reasons[0].tone);
  return "עוד לא בישלתם";
});

check("מה שבושל אתמול יורד מתחת למה שלא בושל חודש", () => {
  const slots = {
    "2026-07-28.dinner": { dish_id: "dish.s1", servings: 1, eaters: ["p1"], status: "cooked" },
    "2026-06-20.dinner": { dish_id: "dish.s2", servings: 1, eaters: ["p1"], status: "cooked" },
  };
  const ranked = suggestDishes(sContext({ slots }));
  assert(ranked[0].dish.id === "dish.s2", ranked[0].dish.id);
  assert(ranked[0].score === WEIGHTS.cookedLongAgo, String(ranked[0].score));
  assert(ranked[1].score === WEIGHTS.cookedToday, String(ranked[1].score));
  return "s2 לפני s1";
});

check("סולם ההיסטוריה עובר את כל חמש המדרגות", () => {
  const scoreAfter = (cookedIso) => {
    const slots = cookedIso
      ? { [`${cookedIso}.dinner`]: { dish_id: "dish.s1", servings: 1, status: "cooked" } }
      : {};
    return scoreDish(S_ONE, sContext({ slots })).score;
  };
  assert(scoreAfter(null) === WEIGHTS.neverCooked, "מעולם");
  assert(scoreAfter("2026-07-29") === WEIGHTS.cookedToday, "היום");
  assert(scoreAfter("2026-07-27") === WEIGHTS.cookedRecently, "לפני יומיים");
  assert(scoreAfter("2026-07-24") === WEIGHTS.cookedThisWeek, "לפני 5 ימים");
  assert(scoreAfter("2026-07-20") === WEIGHTS.cookedLastWeek, "לפני 9 ימים");
  assert(scoreAfter("2026-07-01") === WEIGHTS.cookedLongAgo, "לפני חודש");
  return "6 מדרגות";
});

check("מנה שכבר בתפריט השבוע נדחקת למטה ואומרת למה", () => {
  const slots = {
    "2026-07-27.dinner": { dish_id: "dish.s1", servings: 1, eaters: ["p1"], status: "planned" },
  };
  const result = scoreDish(S_ONE, sContext({ slots }));
  assert(result.score === WEIGHTS.neverCooked + WEIGHTS.plannedEach, String(result.score));
  const said = result.reasons.some((r) => r.text === "כבר בתפריט השבוע" && r.tone === "warn");
  assert(said, "הנימוק חסר");
  return String(result.score);
});

check("קנס החזרה גדל עם כל הופעה ולא נעצר על שתיים", () => {
  // Covers — קנס רווי היה מנחית את כל המנות על אותה רצפה, שובר
  // השוויון לפי שם הכריע תמיד לאותו צד, ואותה מנה הוצעה 16 פעם ברצף.
  const at = (n) => {
    const slots = {};
    for (let i = 0; i < n; i++) {
      const date = S_DATES[Math.floor(i / 3)];
      const meal = ["breakfast", "lunch", "dinner"][i % 3];
      slots[`${date}.${meal}`] = { dish_id: "dish.s1", servings: 1, status: "planned" };
    }
    return scoreDish(S_ONE, sContext({ slots })).score;
  };
  assert(at(2) === WEIGHTS.neverCooked + WEIGHTS.plannedEach * 2, String(at(2)));
  assert(at(3) < at(2), `${at(3)} אינו נמוך מ-${at(2)}`);
  assert(at(4) < at(3), `${at(4)} אינו נמוך מ-${at(3)}`);
  return `${at(2)} ← ${at(3)} ← ${at(4)}`;
});

check("שתי הופעות בשבוע נספרות בנפרד מהופעה אחת", () => {
  const slots = {
    "2026-07-27.dinner": { dish_id: "dish.s1", servings: 1, status: "planned" },
    "2026-07-30.lunch": { dish_id: "dish.s1", servings: 1, status: "planned" },
  };
  const result = scoreDish(S_ONE, sContext({ slots }));
  assert(result.score === WEIGHTS.neverCooked + WEIGHTS.plannedEach * 2, String(result.score));
  // "פעמיים" ולא "2 פעמים" — בעברית הזוגי הוא מילה
  assert(
    result.reasons.some((r) => r.text === "פעמיים בתפריט השבוע"),
    result.reasons.map((r) => r.text).join(" · "),
  );
  return "פעמיים";
});

check("ארוחה שיצאה מהתוכנית אינה חזרה על מנה", () => {
  // דילגנו עליה או אכלנו בחוץ — היא לא הגיעה לשולחן, ולכן היא לא
  // אמורה להרחיק את המנה מהשבוע.
  const slots = {
    "2026-07-27.dinner": { dish_id: "dish.s1", servings: 1, status: "skipped" },
    "2026-07-28.lunch": { dish_id: "dish.s1", servings: 1, status: "ate_out" },
  };
  assert(plannedThisWeek(slots, S_DATES, "dish.s1") === 0, "נספרה בטעות");
  return "0";
});

check("מנה שבושלה השבוע לא נענשת פעמיים על אותה עובדה", () => {
  // Covers — עונש כפול היה מציג שני נימוקים לעובדה אחת: "בישלתם
  // אתמול · כבר בתפריט השבוע". ההיסטוריה מחזיקה את העבר, אות החזרה
  // מחזיקה את מה שעוד לפנינו.
  const slots = {
    "2026-07-28.dinner": { dish_id: "dish.s1", servings: 1, status: "cooked" },
  };
  assert(plannedThisWeek(slots, S_DATES, "dish.s1") === 0, "נספרה כחזרה");
  const result = scoreDish(S_ONE, sContext({ slots }));
  assert(result.score === WEIGHTS.cookedToday, String(result.score));
  assert(result.reasons.length === 1, result.reasons.map((r) => r.text).join(" · "));
  return "נימוק אחד";
});

check("משבצת היעד עצמה לא נספרת כחזרה", () => {
  const key = "2026-07-30.dinner";
  const slots = { [key]: { dish_id: "dish.s1", servings: 1, status: "planned" } };
  assert(plannedThisWeek(slots, S_DATES, "dish.s1") === 1, "בלי החרגה");
  assert(plannedThisWeek(slots, S_DATES, "dish.s1", key) === 0, "עם החרגה");
  return "1 → 0";
});

check("בישול בשבוע שעבר לא נספר כחזרה בשבוע הזה", () => {
  const slots = { "2026-07-19.dinner": { dish_id: "dish.s1", servings: 1, status: "cooked" } };
  assert(plannedThisWeek(slots, S_DATES, "dish.s1") === 0, "חלף לתוך השבוע");
  return "0";
});

check("כיסוי מלא של המזווה מזכה בנימוק ובנקודות", () => {
  const pantry = { "ing.a": { qty: 500, unit: "g" } };
  const cover = pantryCoverage(S_ONE, pantry, sIng, 1);
  assert(cover.covered === 1 && cover.total === 1, `${cover.covered}/${cover.total}`);
  const result = scoreDish(S_ONE, sContext({ pantry }));
  assert(result.score === WEIGHTS.neverCooked + WEIGHTS.pantryFull, String(result.score));
  assert(
    result.reasons.some((r) => r.text === "כל המצרכים במזווה"),
    "הנימוק חסר",
  );
  return "1/1";
});

check("הכיסוי מתחשב במספר המנות ולא רק במתכון", () => {
  // 100 גרם למנה: ל-2 מנות צריך 200, ובמזווה יש 150.
  const pantry = { "ing.a": { qty: 150, unit: "g" } };
  assert(pantryCoverage(S_ONE, pantry, sIng, 1).covered === 1, "מנה אחת");
  assert(pantryCoverage(S_ONE, pantry, sIng, 2).covered === 0, "שתי מנות");
  return "1 → 0";
});

check("כמות שאי אפשר להמיר נספרת כחסרה, לא כקיימת", () => {
  // "גביע" בלי unit_weight_g: אי אפשר לדעת כמה גרם יש. הכלל זהה
  // לזה של applyPantry — ניחוש לטובה היה מציף מנה שחסר לה מצרך.
  const dish = sDish("dish.s3", "מנה שלישית", [{ ingredient_id: "ing.cup", qty: 1, unit: "unit" }]);
  const pantry = { "ing.cup": { qty: 5, unit: "unit" } };
  const cover = pantryCoverage(dish, pantry, sIng, 1);
  assert(cover.covered === 0, `${cover.covered}`);
  return "0 מתוך 1";
});

check("מזווה שמכסה חצי מקבל 'רוב' ולא 'כל'", () => {
  const dish = sDish("dish.s4", "מנה רביעית", [
    { ingredient_id: "ing.a", qty: 100, unit: "g" },
    { ingredient_id: "ing.b", qty: 100, unit: "g" },
  ]);
  const pantry = { "ing.a": { qty: 500, unit: "g" } };
  const result = scoreDish(dish, sContext({ pantry }));
  assert(result.score === WEIGHTS.neverCooked + WEIGHTS.pantryMost, String(result.score));
  assert(
    result.reasons.some((r) => r.text === "רוב המצרכים במזווה"),
    "הנימוק חסר",
  );
  return "1/2";
});

check("מנה בלי מצרכים לא מקבלת נימוק מזווה", () => {
  // 0 מתוך 0 אינו "הכול בבית" — אין מה לכסות, ולכן אין מה לטעון.
  const empty = sDish("dish.s5", "מנה חמישית", []);
  const cover = pantryCoverage(empty, { "ing.a": { qty: 500, unit: "g" } }, sIng, 1);
  assert(cover.ratio === 0, String(cover.ratio));
  const result = scoreDish(empty, sContext());
  assert(result.score === WEIGHTS.neverCooked, String(result.score));
  return "בלי נימוק";
});

check("מנה ארוכה נדחקת בארוחת בוקר בלבד", () => {
  const slow = sDish("dish.s6", "מנה שישית", [], 60);
  const breakfast = scoreDish(slow, sContext({ meal: "breakfast" }));
  const dinner = scoreDish(slow, sContext({ meal: "dinner" }));
  assert(breakfast.score === dinner.score + WEIGHTS.slowBreakfast, String(breakfast.score));
  assert(
    breakfast.reasons.some((r) => r.text === "ארוך לארוחת בוקר"),
    "הנימוק חסר",
  );
  assert(!dinner.reasons.some((r) => r.text === "ארוך לארוחת בוקר"), "הנימוק הופיע בערב");
  return "בוקר בלבד";
});

check("שוויון ציונים נשבר לפי שם, ולא באקראי", () => {
  // הצעה שמתחלפת בכל רינדור אינה המלצה אלא רעש.
  const first = suggestDishes(sContext()).map((r) => r.dish.id);
  const flipped = suggestDishes(sContext({ dishes: [S_TWO, S_ONE] })).map((r) => r.dish.id);
  assert(first.join() === flipped.join(), `${first} מול ${flipped}`);
  assert(first[0] === "dish.s1", first[0]);
  return first.join(" ← ");
});

check("limit חותך את הזנב ולא את הראש", () => {
  const ranked = suggestDishes(sContext({ limit: 1 }));
  assert(ranked.length === 1, String(ranked.length));
  assert(ranked[0].dish.id === "dish.s1", ranked[0].dish.id);
  return "1";
});

check("המשבצות הריקות מוחזרות בסדר שבו אוכלים אותן", () => {
  const slots = { "2026-07-26.breakfast": { dish_id: "dish.s1", servings: 1, status: "planned" } };
  const empty = emptySlotKeys(slots, [S_DATES[0]]);
  assert(empty.length === 2, String(empty.length));
  assert(empty[0].meal === "lunch" && empty[1].meal === "dinner", empty.map((e) => e.meal).join());
  return "צהריים ← ערב";
});

check("משבצת בלי מנה נחשבת ריקה גם כשהיא קיימת באובייקט", () => {
  const slots = { "2026-07-26.lunch": { dish_id: null, servings: 1, status: "planned" } };
  const empty = emptySlotKeys(slots, [S_DATES[0]]);
  assert(empty.length === 3, String(empty.length));
  return "3";
});

check("הצעה לשבוע לא חוזרת על אותה מנה ברצף", () => {
  // הלב של הפיצ'ר: הרצת ההצעה 21 פעם על אותו מצב הייתה מחזירה את
  // אותה מנה 21 פעם. כל הצעה נצברת לעותק עבודה ונספרת כחזרה בבאה.
  const picks = suggestForWeek(sContext({ dates: [S_DATES[0]] }));
  assert(picks.length === 3, String(picks.length));
  const ids = picks.map((p) => p.dish.id);
  assert(ids[0] !== ids[1], `${ids[0]} חזרה מיד`);
  return ids.join(" ← ");
});

check("אותה מנה לא מוצעת פעמיים באותו יום", () => {
  // התגלה בציור השבוע: שבת קיבלה את אותה מנה לבוקר, לצהריים ולערב.
  const three = [S_ONE, S_TWO, sDish("dish.s7", "מנה שביעית")];
  const picks = suggestForWeek(sContext({ dishes: three, dates: [S_DATES[0]] }));
  const ids = picks.map((p) => p.dish.id);
  assert(new Set(ids).size === 3, ids.join());
  return ids.join(" ← ");
});

check("ספרייה קטנה משלוש ארוחות מקבלת חזרה ולא משבצת ריקה", () => {
  // הפסילה נסוגה כשאין ממה לבחור: הצעה חוזרת עדיפה על שום הצעה.
  const picks = suggestForWeek(sContext({ dishes: [S_ONE], dates: [S_DATES[0]] }));
  assert(picks.length === 3, String(picks.length));
  assert(
    picks.every((p) => p.dish.id === "dish.s1"),
    "מנה לא צפויה",
  );
  return "3 הצעות ממנה אחת";
});

check("ההצעה לשבוע מדלגת על משבצות שכבר תוכננו", () => {
  const slots = {
    "2026-07-26.breakfast": { dish_id: "dish.s1", servings: 1, status: "planned" },
    "2026-07-26.lunch": { dish_id: "dish.s2", servings: 1, status: "cooked" },
  };
  const picks = suggestForWeek(sContext({ slots, dates: [S_DATES[0]] }));
  assert(picks.length === 1, String(picks.length));
  assert(picks[0].key === "2026-07-26.dinner", picks[0].key);
  return "רק הערב";
});

check("ההצעה לשבוע לא נוגעת במצב שהועבר לה", () => {
  const slots = { "2026-07-26.breakfast": { dish_id: "dish.s1", servings: 1, status: "planned" } };
  suggestForWeek(sContext({ slots, dates: [S_DATES[0]] }));
  assert(Object.keys(slots).length === 1, "המצב השתנה");
  return "טהורה";
});

check("קטלוג ריק מחזיר אפס הצעות ולא נופל", () => {
  assert(suggestDishes(sContext({ dishes: [] })).length === 0, "מנות");
  assert(suggestForWeek(sContext({ dishes: [] })).length === 0, "שבוע");
  return "0";
});

check("כל הצעה נושאת לפחות נימוק אחד", () => {
  // ציון בלי נימוק הוא בדיוק המספר הסתום שהמנוע נועד לא לייצר.
  const picks = suggestForWeek(sContext({ dates: [S_DATES[0]] }));
  for (const pick of picks) {
    assert(pick.reasons.length > 0, `${pick.dish.id} בלי נימוק`);
    for (const r of pick.reasons) {
      assert(typeof r.text === "string" && r.text.length > 0, "נימוק ריק");
      assert(r.tone === "good" || r.tone === "warn", `גוון לא מוכר: ${r.tone}`);
    }
  }
  return `${picks.length} הצעות`;
});

/* ---------- נשנושים ומשקאות ---------- */

group("נשנושים ומשקאות");

const X_WEEK = "2026-07-26";
const X_DATES = weekDates(X_WEEK);
const X_DAY = "2026-07-27";

/* מצרכים מפורשים ולא מהזרע — נתוני הזרע משתנים, ובדיקת מאקרו
   שנשענת עליהם נשברת בכל תיקון ערך תזונתי. */
const X_ING = {
  // 100 קק"ל ל-100 גרם, ויחידה שוקלת 200 גרם → יחידה אחת = 200 קק"ל
  "ing.round": {
    id: "ing.round",
    name_he: "עגול",
    base_unit: "g",
    unit_weight_g: 200,
    density_g_per_ml: null,
    nutrition_per_100: { kcal: 100, protein_g: 10, fat_g: 5, carbs_g: 20 },
  },
  // משקה: nutrition לכל 100 מ"ל, יחידה שוקלת 206 גרם בצפיפות 1.03 → 200 מ"ל
  "ing.sip": {
    id: "ing.sip",
    name_he: "לגימה",
    base_unit: "ml",
    unit_weight_g: 206,
    density_g_per_ml: 1.03,
    nutrition_per_100: { kcal: 60, protein_g: 3, fat_g: 3, carbs_g: 5 },
  },
  // בלי ערכי תזונה בכלל
  "ing.blank": {
    id: "ing.blank",
    name_he: "ריק",
    base_unit: "g",
    unit_weight_g: 100,
    density_g_per_ml: null,
    nutrition_per_100: null,
  },
  // ערכים חלקיים — קלוריות וחלבון בלבד
  "ing.half": {
    id: "ing.half",
    name_he: "חלקי",
    base_unit: "g",
    unit_weight_g: 100,
    density_g_per_ml: null,
    nutrition_per_100: { kcal: 200, protein_g: 8 },
  },
  // אין משקל ליחידה — "יחידה אחת" אינה ניתנת להמרה
  "ing.vague": {
    id: "ing.vague",
    name_he: "עמום",
    base_unit: "g",
    unit_weight_g: null,
    density_g_per_ml: null,
    nutrition_per_100: { kcal: 100, protein_g: 1, fat_g: 1, carbs_g: 1 },
  },
};
const xIng = (id) => X_ING[id] || null;

function xExtra(over = {}) {
  return {
    id: "x1",
    ingredient_id: "ing.round",
    qty: 1,
    unit: "unit",
    kind: "snack",
    eaters: ["p1"],
    planned: false,
    eaten: true,
    ...over,
  };
}

check("מאקרו למצרך לפי יחידת הבסיס שלו", () => {
  const m = ingredientMacros(xIng("ing.round"), 250, "g");
  near(m.kcal, 250);
  near(m.protein_g, 25);
  assert(m.partial === false && m.unresolved === false, "סומן חלקי או לא פתיר");
  return '250 קק"ל';
});

check("יחידה מומרת דרך משקל היחידה", () => {
  const m = ingredientMacros(xIng("ing.round"), 1, "unit");
  near(m.kcal, 200);
  return '200 קק"ל ליחידה';
});

check("משקה נספר לכל 100 מ״ל ולא לכל 100 גרם", () => {
  // 206 גרם בצפיפות 1.03 = 200 מ"ל, ו-60 קק"ל ל-100 מ"ל → 120
  const m = ingredientMacros(xIng("ing.sip"), 1, "unit");
  near(m.kcal, 120);
  return '120 קק"ל לכוס';
});

check("מצרך בלי ערכי תזונה מוחזר כלא פתיר ולא כאפס", () => {
  // אפס קלוריות אינו "לא ידוע". הצגתו כידע משקרת במסך שכל תפקידו לתאר.
  const m = ingredientMacros(xIng("ing.blank"), 100, "g");
  assert(m.unresolved === true, "נספר כאפס");
  return "לא פתיר";
});

check("ערכים חלקיים נספרים ומסומנים חלקיים", () => {
  const m = ingredientMacros(xIng("ing.half"), 100, "g");
  near(m.kcal, 200);
  near(m.fat_g, 0);
  assert(m.partial === true, "לא סומן חלקי");
  assert(m.unresolved === false, "נפסל בטעות");
  return "חלקי";
});

check("כמות שאי אפשר להמיר אינה מנוחשת", () => {
  const m = ingredientMacros(xIng("ing.vague"), 1, "unit");
  assert(m.unresolved === true, "הומר בניחוש");
  return "לא פתיר";
});

check("שני מצבי הכשל מובחנים זה מזה", () => {
  // Covers — הממשק אמר "אין ערכי תזונה" גם על מצרך שיש לו ערכים ורק
  // היחידה שלו לא ניתנת להמרה, ובכך שלח לתקן את מה שתקין.
  const noUnit = ingredientMacros(xIng("ing.vague"), 1, "unit");
  assert(noUnit.reason === "no_unit_weight", String(noUnit.reason));
  const noFood = ingredientMacros(xIng("ing.blank"), 100, "g");
  assert(noFood.reason === "no_nutrition", String(noFood.reason));
  return "no_unit_weight / no_nutrition";
});

check("תוספת בלי אוכלים מדווחת על הסיבה שלה", () => {
  const m = extraMacrosPerEater(xExtra({ eaters: [] }), xIng("ing.round"));
  assert(m.reason === "no_eaters", String(m.reason));
  return "no_eaters";
});

check("תוספת מתחלקת בין האוכלים שלה", () => {
  const solo = extraMacrosPerEater(xExtra(), xIng("ing.round"));
  const shared = extraMacrosPerEater(xExtra({ eaters: ["p1", "p2"] }), xIng("ing.round"));
  near(solo.kcal, 200);
  near(shared.kcal, 100);
  return "200 ← 100";
});

check("תוספת בלי אוכלים אינה מתחלקת באפס", () => {
  const m = extraMacrosPerEater(xExtra({ eaters: [] }), xIng("ing.round"));
  assert(m.unresolved === true, "חולק באפס");
  return "לא פתיר";
});

check("רק מה שנאכל נספר במאקרו", () => {
  // מתוכנן לערב עוד לא נאכל. ספירתו הופכת את המסך מתיאור לתחזית.
  const extras = {
    [X_DAY]: [xExtra({ id: "x1" }), xExtra({ id: "x2", planned: true, eaten: false })],
  };
  const out = extrasMacrosFor(extras, X_DAY, "p1", xIng);
  assert(out.items.length === 1, String(out.items.length));
  near(out.macros.kcal, 200);
  return "אחת מתוך שתיים";
});

check("תוספת של אדם אחר לא נספרת אצלי", () => {
  const extras = { [X_DAY]: [xExtra({ eaters: ["p2"] })] };
  const out = extrasMacrosFor(extras, X_DAY, "p1", xIng);
  assert(out.items.length === 0, "נספרה אצל הלא נכון");
  return "0";
});

check("תוספת שאי אפשר לחשב נספרת בנפרד ולא נבלעת", () => {
  const extras = {
    [X_DAY]: [xExtra({ id: "x1" }), xExtra({ id: "x2", ingredient_id: "ing.blank" })],
  };
  const out = extrasMacrosFor(extras, X_DAY, "p1", xIng);
  assert(out.unresolved === 1, String(out.unresolved));
  near(out.macros.kcal, 200);
  return "1 לא נספרה";
});

check("ערכים חלקיים מסמנים את היום כחלקי", () => {
  const extras = { [X_DAY]: [xExtra({ ingredient_id: "ing.half", qty: 100, unit: "g" })] };
  const out = extrasMacrosFor(extras, X_DAY, "p1", xIng);
  assert(out.partial === true, "לא סומן חלקי");
  return "חלקי";
});

check("רק תוספות מתוכננות מגיעות לרשימת הקניות", () => {
  // נשנוש שנאכל אצל חברים אינו פריט לקנייה. רשימה שמוסיפה אותו
  // שולחת לקנות מה שכבר נאכל.
  const extras = {
    [X_DAY]: [
      xExtra({ id: "x1", planned: false, eaten: true }),
      xExtra({ id: "x2", planned: true, eaten: false }),
      xExtra({ id: "x3", planned: true, eaten: true }),
    ],
  };
  const items = extraLineItems(extras, X_DATES);
  assert(items.length === 2, String(items.length));
  assert(
    items.every((i) => i.source.extra_id !== "x1"),
    "מה שלא תוכנן נכנס",
  );
  return "2 מתוך 3";
});

check("מתוכנן שכבר נאכל עדיין נקנה", () => {
  // אותו היגיון כמו משבצת מסומנת "בישלנו": קונים לפני, לא אחרי.
  const extras = { [X_DAY]: [xExtra({ planned: true, eaten: true })] };
  assert(extraLineItems(extras, X_DATES).length === 1, "ירד מהרשימה");
  return "נשאר";
});

check("תוספות מחוץ לשבוע לא נכנסות לרשימה", () => {
  const extras = { "2026-08-20": [xExtra({ planned: true, eaten: false })] };
  assert(extraLineItems(extras, X_DATES).length === 0, "חלף לתוך השבוע");
  return "0";
});

check("המקור נושא את הסוג כדי שהשורה תיקרא", () => {
  // בלי kind התווית ברשימת הקניות הייתה "undefined · ראשון".
  const extras = { [X_DAY]: [xExtra({ planned: true, kind: "drink" })] };
  const [item] = extraLineItems(extras, X_DATES);
  assert(item.source.kind === "drink", String(item.source.kind));
  return "drink";
});

check("מזהה תוספת חדש נגזר מהקיימים ולא מאקראי", () => {
  assert(nextExtraId([]) === "x1", nextExtraId([]));
  assert(nextExtraId([{ id: "x1" }, { id: "x3" }]) === "x4", "לא המשיך מהגבוה");
  assert(nextExtraId([{ id: "זבל" }]) === "x1", "נפל על מזהה לא תקין");
  return "x1 / x4";
});

check("תוספת שלא תוכננה נולדת כנאכלה", () => {
  const now = makeExtra({ id: "x1", ingredient_id: "ing.round", qty: 1, unit: "unit" });
  assert(now.planned === false && now.eaten === true, JSON.stringify(now));
  const later = makeExtra({
    id: "x2",
    ingredient_id: "ing.round",
    qty: 1,
    unit: "unit",
    planned: true,
  });
  assert(later.planned === true && later.eaten === false, JSON.stringify(later));
  return "שני המסלולים";
});

check("ההוספה המהירה מדרגת לפי שכיחות בפועל", () => {
  const extras = {
    "2026-07-26": [
      xExtra({ id: "x1", ingredient_id: "ing.sip" }),
      xExtra({ id: "x2", ingredient_id: "ing.round" }),
    ],
    "2026-07-27": [
      xExtra({ id: "x1", ingredient_id: "ing.sip" }),
      xExtra({ id: "x2", ingredient_id: "ing.sip" }),
    ],
  };
  const rows = frequentExtras(extras, xIng);
  assert(rows[0].ingredient_id === "ing.sip", rows[0].ingredient_id);
  assert(rows[0].count === 3, String(rows[0].count));
  assert(rows[1].ingredient_id === "ing.round", rows[1].ingredient_id);
  return "לגימה ×3";
});

check("אותו מצרך בשתי יחידות נספר בנפרד", () => {
  // "כוס קפה" ו-"300 מ״ל קפה" הן שתי הוספות מהירות שונות.
  const extras = {
    [X_DAY]: [
      xExtra({ id: "x1", ingredient_id: "ing.round", qty: 1, unit: "unit" }),
      xExtra({ id: "x2", ingredient_id: "ing.round", qty: 50, unit: "g" }),
    ],
  };
  assert(frequentExtras(extras, xIng).length === 2, "מוזגו");
  return "2 שורות";
});

check("מצרך שנמחק מהקטלוג לא מפיל את ההוספה המהירה", () => {
  const extras = { [X_DAY]: [xExtra({ ingredient_id: "ing.gone" })] };
  assert(frequentExtras(extras, xIng).length === 0, "החזיר שורה בלי מצרך");
  return "0";
});

check("רשימת הפתיחה נשענת על משקל יחידה אמיתי", () => {
  // "אחד" חייב להיות מנה שאפשר להמיר, אחרת ההוספה המהירה מייצרת
  // פריטים שאי אפשר לחשב להם מאקרו.
  const rows = starterExtras(xIng, ["ing.round", "ing.vague", "ing.sip"]);
  assert(rows.length === 2, String(rows.length));
  assert(!rows.some((r) => r.ingredient_id === "ing.vague"), "נכנס פריט בלי משקל יחידה");
  for (const row of rows) {
    assert(
      ingredientMacros(row.ingredient, row.qty, row.unit).unresolved === false,
      row.ingredient_id,
    );
  }
  return "2 פתירים";
});

check("יום ריק מחזיר רשימה ולא null", () => {
  assert(Array.isArray(extrasOn({}, X_DAY)), "לא מערך");
  assert(extrasOn(null, X_DAY).length === 0, "נפל על null");
  assert(extrasOn({ [X_DAY]: "זבל" }, X_DAY).length === 0, "נפל על זבל");
  return "[]";
});

/* הנרמול רץ בטעינה, לא בכתיבה: store.update כותב את המצב כמו שהוא.
   לכן בדיקות הנרמול זורעות את האחסון ונותנות ל-createStore לפרוס. */
function storeWithExtras(list) {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: { week_start: "2026-07-26", slots: {}, extras: { "2026-07-27": list } },
    }),
  });
  return createStore({ key: TEST_KEY, storage, now: at(2026, 7, 27) });
}

check("נרמול פוסל תוספת בלי מצרך או בלי כמות", () => {
  const store = storeWithExtras([
    { id: "x1", ingredient_id: "ing.apple", qty: 1, unit: "unit", eaten: true },
    { id: "x2", qty: 1, unit: "unit" }, // בלי מצרך
    { id: "x3", ingredient_id: "ing.apple", qty: 0, unit: "unit" }, // כמות אפס
    { id: "x4", ingredient_id: "ing.apple", qty: "הרבה", unit: "unit" }, // כמות טקסטואלית
    "זבל",
  ]);
  const kept = store.state.plan.extras["2026-07-27"];
  assert(kept.length === 1, String(kept.length));
  assert(kept[0].id === "x1", kept[0].id);
  return "1 מתוך 5";
});

check("תוספת בלי אוכלים מקבלת אדם אחד ולא את כל הבית", () => {
  // לייחס עוגייה לכל משק הבית היה מנפח לכולם את מה שהם באמת אכלו.
  const store = storeWithExtras([{ id: "x1", ingredient_id: "ing.apple", qty: 1, unit: "unit" }]);
  const kept = store.state.plan.extras["2026-07-27"][0];
  assert(kept.eaters.length === 1, JSON.stringify(kept.eaters));
  return "אדם אחד";
});

check("תוספת שאינה מתוכננת נטענת כנאכלה", () => {
  // planned=false, eaten=false אינו מתאר כלום. ברירת המחדל היא עובדה.
  const store = storeWithExtras([
    { id: "x1", ingredient_id: "ing.apple", qty: 1, unit: "unit" },
    { id: "x2", ingredient_id: "ing.apple", qty: 1, unit: "unit", planned: true },
  ]);
  const [now, later] = store.state.plan.extras["2026-07-27"];
  assert(now.planned === false && now.eaten === true, JSON.stringify(now));
  assert(later.planned === true && later.eaten === false, JSON.stringify(later));
  return "שני המסלולים";
});

check("יחידה לא מוכרת בתוספת נופלת לגרם ולא נשמרת כזבל", () => {
  const store = storeWithExtras([{ id: "x1", ingredient_id: "ing.apple", qty: 5, unit: "חופן" }]);
  assert(store.state.plan.extras["2026-07-27"][0].unit === "g", "יחידה לא מוכרת שרדה");
  return "g";
});

check("canonical אינו תלוי בסדר המפתחות", () => {
  // המלכודת האמיתית: Postgres מחזיר jsonb בסדר מפתחות משלו. השוואה
  // תלוית־סדר הייתה מסמנת כל שורה שנמשכה כ"השתנתה" ודוחפת אותה חזרה.
  assert(canonical({ qty: 1, unit: "g" }) === canonical({ unit: "g", qty: 1 }), "סדר שינה");
  assert(canonical({ a: { x: 1, y: 2 } }) === canonical({ a: { y: 2, x: 1 } }), "עומק שני");
  assert(canonical([1, 2]) !== canonical([2, 1]), "סדר מערך כן משמעותי");
  return "יציב";
});

check("טביעה זהה לערכים שקולים, שונה לערכים שונים", () => {
  assert(fingerprint({ qty: 1, unit: "g" }) === fingerprint({ unit: "g", qty: 1 }), "סדר שינה");
  assert(fingerprint({ qty: 1 }) !== fingerprint({ qty: 2 }), "לא הבחין");
  assert(fingerprint(null) !== fingerprint(false), "null מול false");
  return fingerprint({ qty: 1 });
});

check("פירוק מכסה את כל האוספים", () => {
  const flat = flattenState(syncState());
  assert(flat.has(rowKey(ENTITY.SLOT, "2026-07-27.dinner")), "משבצת");
  assert(flat.has(rowKey(ENTITY.CHECKED, "line-a")), "סימון");
  assert(flat.has(rowKey(ENTITY.PANTRY, "onion")), "מזווה");
  assert(flat.has(rowKey(ENTITY.DISH, "d1")), "מנה");
  assert(flat.has(rowKey(ENTITY.PROFILE, "p1")), "פרופיל");
  assert(flat.get(rowKey(ENTITY.META, META.WEEK_START)) === "2026-07-26", "שבוע");
  assert(flat.get(rowKey(ENTITY.META, META.SCHEMA)) === SCHEMA_VERSION, "סכמה");
  return `${flat.size} שורות`;
});

check("סימון כבוי אינו נשלח כ-false אלא נעדר", () => {
  const state = syncState();
  state.plan.checked = { "line-a": true, "line-b": false };
  const flat = flattenState(state);
  assert(flat.has(rowKey(ENTITY.CHECKED, "line-a")), "הדלוק נעדר");
  assert(!flat.has(rowKey(ENTITY.CHECKED, "line-b")), "הכבוי נשלח");
  return "רק true";
});

check("סדר הפרופילים נוסע כשדה ולא כמיקום", () => {
  const flat = flattenState(syncState());
  assert(flat.get(rowKey(ENTITY.PROFILE, "p1"))._order === 0, "ראשון");
  assert(flat.get(rowKey(ENTITY.PROFILE, "p2"))._order === 1, "שני");
  return "ממוספר";
});

check("מצב ללא שינוי אינו מייצר דחיפה", () => {
  const state = syncState();
  const marks = fingerprintAll(flattenState(state));
  assert(diffAgainst(marks, flattenState(state)).length === 0, "דחף בלי סיבה");
  return "שקט";
});

check("מפתח שנעלם הופך למצבה ולא נשמט", () => {
  // בלי זה מחיקה לא מסתנכרנת: המכשיר השני לא שומע עליה ומחזיר את
  // השורה בסבב הבא — כלומר כל מחיקה מתבטלת מעצמה.
  const before = syncState();
  const marks = fingerprintAll(flattenState(before));
  const after = syncState();
  delete after.pantry.onion;
  const changes = diffAgainst(marks, flattenState(after));
  const tomb = changes.find((c) => c.entity === ENTITY.PANTRY && c.entity_key === "onion");
  assert(tomb, "המחיקה לא דווחה");
  assert(tomb.value === null, "לא מצבה");
  return "מצבה";
});

check("מצבה שנמשכת מוחקת מקומית", () => {
  const merged = applyRows(syncState(), [
    { entity: ENTITY.PANTRY, entity_key: "onion", value: null },
  ]);
  assert(!("onion" in merged.pantry), "לא נמחק");
  return "נמחק";
});

check("החלה אינה נוגעת במה שלא הוזכר", () => {
  const merged = applyRows(syncState(), [
    { entity: ENTITY.PANTRY, entity_key: "tomato", value: { qty: 5, unit: "unit" } },
  ]);
  assert(merged.pantry.onion.qty === 300, "הבצל נפגע");
  assert(merged.pantry.tomato.qty === 5, "העגבנייה לא נכנסה");
  assert(merged.profiles.length === 2, "הפרופילים נפגעו");
  return "מבודד";
});

check("משיכה שלא כללה פרופילים אינה מוחקת אותם", () => {
  // הפרופילים נבנים מחדש מהשורות. בנייה מחדש חסרת־תנאי הייתה מוחקת
  // את כולם בכל סבב שלא הזכיר אותם.
  const merged = applyRows(syncState(), [
    { entity: ENTITY.SLOT, entity_key: "2026-07-28.dinner", value: { dish_id: "d1" } },
  ]);
  assert(merged.profiles.length === 2, `נשארו ${merged.profiles.length}`);
  return "שרדו";
});

check("פרופילים נבנים לפי _order, וה-_order אינו נשמר במצב", () => {
  const merged = applyRows(syncState(), [
    { entity: ENTITY.PROFILE, entity_key: "p1", value: { name_he: "ירין", _order: 2 } },
    { entity: ENTITY.PROFILE, entity_key: "p2", value: { name_he: "עידו", _order: 0 } },
    { entity: ENTITY.PROFILE, entity_key: "p3", value: { name_he: "דנה", _order: 1 } },
  ]);
  const order = merged.profiles.map((p) => p.id).join(",");
  assert(order === "p2,p3,p1", `הסדר הוא ${order}`);
  assert(!merged.profiles.some((p) => "_order" in p), "_order דלף למצב");
  return order;
});

check("פרופיל מקומי שומר על מקומו כשנמשך פרופיל חדש", () => {
  // הפרופילים באחסון המקומי חסרי _order — הוא מוסר בכתיבה. בלי
  // השתלה מחדש מהמיקום כולם היו שווים, וכל פרופיל שנמשך היה נדחס
  // לראש הרשימה ומזיז את משק הבית הקיים.
  const merged = applyRows(syncState(), [
    { entity: ENTITY.PROFILE, entity_key: "p3", value: { name_he: "דנה", _order: 9 } },
  ]);
  const order = merged.profiles.map((p) => p.id).join(",");
  assert(order === "p1,p2,p3", `הסדר הוא ${order}`);
  return order;
});

check("onboarded נדלק בלבד ולא נכבה מרחוק", () => {
  // מכשיר שסיים הגדרה מעביר את המסקנה הלאה. מכשיר שטרם סיים אותה
  // לא מחזיר את האדם השני למסך הפתיחה מעל תוכנית קיימת.
  const off = applyRows(syncState(), [
    { entity: ENTITY.META, entity_key: META.ONBOARDED, value: false },
  ]);
  assert(off.onboarded === true, "כובה מרחוק");
  const on = applyRows(syncState({ onboarded: false }), [
    { entity: ENTITY.META, entity_key: META.ONBOARDED, value: true },
  ]);
  assert(on.onboarded === true, "לא נדלק");
  return "חד-כיווני";
});

check("ישות לא מוכרת אינה מפילה את המיזוג", () => {
  const merged = applyRows(syncState(), [
    { entity: "מה_זה", entity_key: "x", value: { a: 1 } },
    { entity: ENTITY.PANTRY, entity_key: "tomato", value: { qty: 2, unit: null } },
  ]);
  assert(merged.pantry.tomato.qty === 2, "השורה התקינה לא הוחלה");
  return "התעלם";
});

check("skip מגן על עריכה מקומית שטרם נדחפה", () => {
  // הליבה של המיזוג. בלי skip, משיכה שקדמה לדחיפה הייתה מבטלת את מה
  // שהמשתמש הרגע עשה ואז דוחפת את הביטול בחזרה.
  const local = syncState();
  local.pantry.onion = { qty: 999, unit: null };
  const skip = new Set([rowKey(ENTITY.PANTRY, "onion")]);
  const merged = applyRows(
    local,
    [{ entity: ENTITY.PANTRY, entity_key: "onion", value: { qty: 50, unit: null } }],
    skip,
  );
  assert(merged.pantry.onion.qty === 999, `נדרס ל-${merged.pantry.onion.qty}`);
  return "שרד";
});

check("שני אנשים שערכו דברים שונים — שניהם שורדים", () => {
  // התרחיש שבגללו המצב פורק לשורות. בבלוב אחד השני היה מוחק את
  // הראשון לגמרי, כולל שדות שלא נגע בהם.
  const marks = fingerprintAll(flattenState(syncState()));

  // אני: מוסיף למזווה
  const mine = syncState();
  mine.pantry.tomato = { qty: 4, unit: "unit" };
  const myChanges = diffAgainst(marks, flattenState(mine));
  const dirty = new Set(myChanges.map((c) => rowKey(c.entity, c.entity_key)));

  // הוא: תכנן ארוחה, וזה כבר בשרת
  const fromServer = [
    {
      entity: ENTITY.SLOT,
      entity_key: "2026-07-29.dinner",
      value: { dish_id: "d1", servings: 2, eaters: ["p2"], status: "planned" },
    },
  ];

  const merged = applyRows(mine, fromServer, dirty);
  assert(merged.pantry.tomato.qty === 4, "המזווה שלי נמחק");
  assert(merged.plan.slots["2026-07-29.dinner"], "הארוחה שלו נמחקה");
  assert(merged.plan.slots["2026-07-27.dinner"], "המשבצת המקורית נמחקה");
  return "שניהם";
});

check("התנגשות אמיתית על אותו מפתח — המקומי נדחף ומנצח", () => {
  // כששניהם נגעו באותה משבצת אין תשובה נכונה. הבחירה היא "אחרון
  // כותב מנצח", והמקומי נדחף אחרי המשיכה — ולכן הוא האחרון.
  const marks = fingerprintAll(flattenState(syncState()));
  const mine = syncState();
  mine.plan.slots["2026-07-27.dinner"] = { dish_id: "SHELI", servings: 1, eaters: ["p1"] };
  const changes = diffAgainst(marks, flattenState(mine));
  const dirty = new Set(changes.map((c) => rowKey(c.entity, c.entity_key)));

  const merged = applyRows(
    mine,
    [{ entity: ENTITY.SLOT, entity_key: "2026-07-27.dinner", value: { dish_id: "SHELO" } }],
    dirty,
  );
  assert(merged.plan.slots["2026-07-27.dinner"].dish_id === "SHELI", "המקומי נדרס לפני הדחיפה");
  const pushed = changes.find((c) => c.entity_key === "2026-07-27.dinner");
  assert(pushed && pushed.value.dish_id === "SHELI", "המקומי לא נדחף");
  return "אחרון מנצח";
});

check("גרסת הסכמה נקראת מהשורות ואינה מוחלת על המצב", () => {
  const rows = [{ entity: ENTITY.META, entity_key: META.SCHEMA, value: 99 }];
  assert(remoteSchemaVersion(rows) === 99, "לא נקראה");
  assert(remoteSchemaVersion([]) === null, "המציא ערך");
  const merged = applyRows(syncState(), rows);
  assert(merged.schema_version === SCHEMA_VERSION, "הסכמה המקומית נדרסה");
  return "שומר סף";
});

check("מצב חלקי אינו מפיל את הפירוק וההחלה", () => {
  assert(flattenState(null).size === 0, "null הפיל");
  assert(flattenState({}).size > 0, "מצב ריק לא החזיר meta");
  const merged = applyRows({}, [
    { entity: ENTITY.DISH, entity_key: "d9", value: { name_he: "חדש" } },
  ]);
  assert(merged.dishes.d9.name_he === "חדש", "לא נכנס");
  return "חסין";
});

check("סבב מלא מתכנס — סנכרון שני אינו מוצא מה לדחוף", () => {
  // הרגרסיה שהכי קל ליפול בה: טביעות שנלקחות מהמצב שנדחף במקום
  // מהמצב שאחרי המיזוג. אז מה שנמשך מהאדם השני נראה כשינוי מקומי
  // בסבב הבא, ונדחף בחזרה אליו — הלוך ושוב בלי סוף.
  const state = syncState();
  let marks = fingerprintAll(flattenState(state));

  const merged = applyRows(state, [
    { entity: ENTITY.PANTRY, entity_key: "tomato", value: { qty: 7, unit: "unit" } },
  ]);
  marks = fingerprintAll(flattenState(merged));

  assert(diffAgainst(marks, flattenState(merged)).length === 0, "הסבב השני מצא שינויים");
  return "התכנס";
});

/* ---------- הרכבת ארוחה ---------- */

group("הרכבת ארוחה");

/* קטלוג מדומה קטן — הבדיקות כאן על כללי ההרכבה, לא על נתוני הזרע. */
const C_DISHES = {
  "d.schnitzel": { id: "d.schnitzel", name_he: "שניצל", role: "protein", time_min: 25 },
  "d.rice": { id: "d.rice", name_he: "אורז", role: "side", time_min: 20 },
  "d.chips": { id: "d.chips", name_he: "צ'יפס", role: "side", time_min: 40 },
  "d.salad": { id: "d.salad", name_he: "סלט", role: "veg", time_min: 10 },
  "d.tahini": { id: "d.tahini", name_he: "טחינה", role: "dip", time_min: 5 },
  "d.legacy": { id: "d.legacy", name_he: "מנה ישנה", time_min: 30 },
};
const cResolve = (id) => C_DISHES[id] || null;

check("משבצת ישנה עם dish_id בלבד נקראת כרכיב אחד", () => {
  const out = slotComponents({ dish_id: "d.legacy", servings: 2, eaters: ["p1"] });
  assert(out.length === 1 && out[0] === "d.legacy", JSON.stringify(out));
  return "בלי הגירה";
});

check("extras נקרא אחרי הראשי, בלי כפילויות ובלי ערכים פגומים", () => {
  const out = slotComponents({
    dish_id: "d.schnitzel",
    extras: ["d.rice", "d.schnitzel", null, "", "d.rice", "d.salad"],
  });
  assert(out.join(",") === "d.schnitzel,d.rice,d.salad", out.join(","));
  return "3 רכיבים";
});

check("הרכיבים מסודרים לפי תפקיד ולא לפי סדר ההקשות", () => {
  const out = sortComponents(["d.tahini", "d.salad", "d.rice", "d.schnitzel"], cResolve);
  assert(out.join(",") === "d.schnitzel,d.rice,d.salad,d.tahini", out.join(","));
  return "חלבון → תוספת → ירק → מטבל";
});

check("שתי תוספות שומרות על סדר הבחירה ביניהן", () => {
  const a = sortComponents(["d.chips", "d.rice"], cResolve).join(",");
  const b = sortComponents(["d.rice", "d.chips"], cResolve).join(",");
  assert(a === "d.chips,d.rice" && b === "d.rice,d.chips", `${a} | ${b}`);
  return "יציב בתוך התפקיד";
});

check("מנה בלי תפקיד היא מנה שלמה, וקודמת לרכיבים", () => {
  assert(dishRole(C_DISHES["d.legacy"]) === "main", dishRole(C_DISHES["d.legacy"]));
  assert(dishRole({ role: "לא קיים" }) === "main");
  assert(dishRole(null) === "main");
  const out = sortComponents(["d.salad", "d.legacy"], cResolve);
  assert(out[0] === "d.legacy", out.join(","));
  return "main כברירת מחדל";
});

check("componentFields: הראשי הוא בעל התפקיד המוקדם ביותר", () => {
  const fields = componentFields(["d.salad", "d.schnitzel", "d.rice"], cResolve);
  assert(fields.dish_id === "d.schnitzel", fields.dish_id);
  assert(fields.extras.join(",") === "d.rice,d.salad", fields.extras.join(","));
  return "שניצל + 2";
});

check("הרכבה ריקה מחזירה null — כלומר 'אין כאן ארוחה'", () => {
  assert(componentFields([], cResolve) === null, "ריק לא החזיר null");
  assert(slotWithComponents({ dish_id: "d.rice" }, [], cResolve, ["p1"]) === null);
  return "null ולא משבצת ריקה";
});

check("החלפת תוספת לא מאפסת מנות, אוכלים או סטטוס", () => {
  const slot = {
    dish_id: "d.schnitzel",
    extras: ["d.chips"],
    servings: 4,
    eaters: ["p1", "p2"],
    status: "cooked",
  };
  const next = slotWithComponents(slot, ["d.schnitzel", "d.rice"], cResolve, ["p1"]);
  assert(next.servings === 4 && next.status === "cooked", JSON.stringify(next));
  assert(next.eaters.join(",") === "p1,p2", next.eaters.join(","));
  assert(next.extras.join(",") === "d.rice", next.extras.join(","));
  return "נשמר מה שלא נגעו בו";
});

check("הסרת כל התוספות מוחקת את השדה ולא משאירה מערך ריק", () => {
  const slot = { dish_id: "d.schnitzel", extras: ["d.rice"], servings: 1, eaters: ["p1"] };
  const next = slotWithComponents(slot, ["d.schnitzel"], cResolve, ["p1"]);
  assert(!("extras" in next), JSON.stringify(next));
  return "השדה ירד";
});

check("משבצת חדשה נפתחת עם כל משק הבית ומנה לכל אחד", () => {
  const next = slotWithComponents(null, ["d.rice", "d.schnitzel"], cResolve, ["p1", "p2"]);
  assert(next.dish_id === "d.schnitzel" && next.servings === 2, JSON.stringify(next));
  assert(next.status === "planned" && next.eaters.length === 2);
  return "2 מנות, 2 אוכלים";
});

check("toggleComponent מוסיף ומסיר", () => {
  const once = toggleComponent(["d.schnitzel"], "d.rice");
  assert(once.join(",") === "d.schnitzel,d.rice", once.join(","));
  const twice = toggleComponent(once, "d.rice");
  assert(twice.join(",") === "d.schnitzel", twice.join(","));
  return "הלוך ושוב";
});

check("זמן ההרכבה הוא הרכיב הארוך ביותר, לא הסכום", () => {
  // הרכיבים מתבשלים במקביל. סכימה הייתה מציגה 75 דקות לארוחה שלוקחת 40.
  const time = composedTime(["d.schnitzel", "d.chips", "d.salad"], cResolve);
  assert(time === 40, String(time));
  assert(composedTime([], cResolve) === 0, "ריק לא החזיר 0");
  return "40 ולא 75";
});

check("הכנה מראש נאספת מכל הרכיבים בלי כפילויות", () => {
  const resolve = (id) =>
    ({
      a: { id: "a", role: "protein", prep_ahead: ["לצפות מראש", "להשרות"] },
      b: { id: "b", role: "side", prep_ahead: ["לחתוך מראש", "להשרות"] },
      c: { id: "c", role: "veg" },
    })[id] || null;
  const steps = composedPrepAhead(["a", "b", "c"], resolve);
  assert(steps.join(" | ") === "לצפות מראש | להשרות | לחתוך מראש", steps.join(" | "));
  return "3 צעדים";
});

check("groupByRole שומר על סדר התפקידים ומשמיט קבוצות ריקות", () => {
  const groupsOut = groupByRole([C_DISHES["d.salad"], C_DISHES["d.schnitzel"], C_DISHES["d.rice"]]);
  assert(groupsOut.map((g) => g.id).join(",") === "protein,side,veg", JSON.stringify(groupsOut));
  assert(groupsOut[0].dishes[0].id === "d.schnitzel");
  return "3 קבוצות מתוך 5";
});

check("componentNames קורא מנה חסרה בשמה ולא בולע אותה", () => {
  const names = componentNames(["d.schnitzel", "d.missing"], cResolve);
  assert(names.join(",") === "שניצל,מנה לא מוכרת", names.join(","));
  return "בלי בליעה שקטה";
});

check("מזהה שבור יורד לסוף ולא הופך לרכיב הראשי", () => {
  // בלי החריג הזה מזהה שבור נספר כ"מנה שלמה", קופץ לראש, ונשמר
  // כ-dish_id — כלומר כרטיס היום היה מציג "מנה לא מוכרת" בגודל מלא
  // במקום את המנה שבאמת נבחרה.
  const fields = componentFields(["d.missing", "d.schnitzel", "d.salad"], cResolve);
  assert(fields.dish_id === "d.schnitzel", fields.dish_id);
  assert(fields.extras.join(",") === "d.salad,d.missing", fields.extras.join(","));
  return "השבור בסוף";
});

/* ---------- ההרכבה במנוע ---------- */

check("רשימת הקניות סוכמת את כל רכיבי המשבצת", () => {
  const slots = {
    "2026-08-02.dinner": {
      dish_id: "dish.schnitzel",
      extras: ["dish.oven_chips"],
      servings: 2,
      eaters: ["p1", "p2"],
      status: "planned",
    },
  };
  const items = planLineItems(["2026-08-02"], slots, getDish);
  const { lines } = sumLineItems(items, getIngredient);
  const potato = lines.find((l) => l.ingredient_id === "ing.potato");
  const chicken = lines.find((l) => l.ingredient_id === "ing.chicken_breast");
  assert(potato && potato.qty === 500, `תפו"א: ${potato && potato.qty}`);
  assert(chicken && chicken.qty === 300, `עוף: ${chicken && chicken.qty}`);
  return "שני רכיבים בשורה אחת";
});

check("מצרך משותף לשני רכיבים מתמזג לשורה אחת עם שני מקורות", () => {
  // שמן זית נמצא גם בשניצל וגם בצ'יפס. שתי שורות נפרדות היו שולחות
  // לקנות שמן פעמיים.
  const slots = {
    "2026-08-02.dinner": {
      dish_id: "dish.schnitzel",
      extras: ["dish.oven_chips"],
      servings: 1,
      eaters: ["p1"],
      status: "planned",
    },
  };
  const { lines } = sumLineItems(planLineItems(["2026-08-02"], slots, getDish), getIngredient);
  const oilLine = lines.find((l) => l.ingredient_id === "ing.olive_oil");
  assert(oilLine.sources.length === 2, `מקורות: ${oilLine.sources.length}`);
  const ids = oilLine.sources.map((s) => s.dish_id).sort();
  assert(ids.join(",") === "dish.oven_chips,dish.schnitzel", ids.join(","));
  return "שורה אחת, שני מקורות";
});

check("composedMacros סוכם רכיבים, וחלקיות של אחד מסמנת את הכל", () => {
  const full = { ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }] };
  const partial = { ingredients: [{ ingredient_id: "ing.unknown", qty: 50, unit: "g" }] };
  const both = composedMacros([full, full], getIngredient);
  near(both.kcal, 330);
  assert(both.partial === false, "סומן חלקי בלי סיבה");
  assert(composedMacros([full, partial], getIngredient).partial === true, "לא סומן חלקי");
  assert(composedMacros([], getIngredient).partial === true, "הרכבה ריקה אינה ידיעה");
  return "330 קק״ל";
});

check("מנת המאקרו של אוכל אחד סופרת את כל הרכיבים", () => {
  const dish = { ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }] };
  const slot = { dish_id: "x", extras: ["y"], servings: 2, eaters: ["p1", "p2"] };
  const m = slotMacrosPerEater(slot, [dish, dish], getIngredient);
  return near(m.kcal, 330);
});

check("היסטוריית הבישול נספרת גם לתוספת ולא רק לרכיב הראשי", () => {
  const slots = {
    "2026-07-27.dinner": {
      dish_id: "dish.schnitzel",
      extras: ["dish.white_rice"],
      servings: 1,
      eaters: ["p1"],
      status: "cooked",
    },
  };
  const map = lastCookedMap(slots);
  assert(map.get("dish.white_rice") === "2026-07-27", String(map.get("dish.white_rice")));
  assert(map.get("dish.schnitzel") === "2026-07-27");
  return "שני רכיבים נספרו";
});

check("העתקת שבוע מעתיקה את ההרכבה השלמה", () => {
  const slots = {
    [`${H_PREV}.dinner`]: {
      dish_id: "dish.schnitzel",
      extras: ["dish.oven_chips", "dish.israeli_salad"],
      servings: 2,
      eaters: ["p1", "p2"],
      status: "cooked",
    },
  };
  const { slots: out } = copyWeek(slots, H_PREV, H_THIS, ["p1", "p2"]);
  const copied = out[`${H_THIS}.dinner`];
  assert(copied.extras.join(",") === "dish.oven_chips,dish.israeli_salad", copied.extras.join(","));
  assert(copied.status === "planned", copied.status);
  return "ההרכבה שרדה";
});

/* ---------- ההרכבה באחסון ---------- */

check("extras שורד שמירה וטעינה מחדש", () => {
  const storage = fakeStorage();
  const a = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  a.update((s) => {
    s.plan.slots["2026-08-03.dinner"] = {
      dish_id: "dish.schnitzel",
      extras: ["dish.white_rice"],
      servings: 2,
      eaters: ["p1", "p2"],
      status: "planned",
    };
  });
  const b = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const slot = b.state.plan.slots["2026-08-03.dinner"];
  assert(slot.extras && slot.extras.join(",") === "dish.white_rice", JSON.stringify(slot));
  return "שרד רענון";
});

check("הראשי מסונן מ-extras כדי שלא ייספר פעמיים", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: {
        week_start: "2026-08-02",
        slots: {
          "2026-08-03.dinner": {
            dish_id: "dish.schnitzel",
            extras: ["dish.schnitzel", "dish.white_rice", 7, "dish.white_rice"],
            servings: 1,
            eaters: ["p1"],
            status: "planned",
          },
        },
        checked: {},
      },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  const slot = store.state.plan.slots["2026-08-03.dinner"];
  assert(slot.extras.join(",") === "dish.white_rice", JSON.stringify(slot.extras));
  return "רק אחד נשאר";
});

check("משבצת בלי תוספות לא נושאת שדה extras ריק", () => {
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: {
        week_start: "2026-08-02",
        slots: {
          "2026-08-03.dinner": {
            dish_id: "dish.rice_veg",
            extras: [],
            servings: 1,
            eaters: ["p1"],
            status: "planned",
          },
        },
        checked: {},
      },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(!("extras" in store.state.plan.slots["2026-08-03.dinner"]), "השדה הריק נשמר");
  return "השדה ירד";
});

check("מנת משתמש עם תפקיד לא מוכר נשמרת כמנה שלמה", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  store.update((s) => {
    s.dishes["dish.u1"] = { id: "dish.u1", name_he: "בדיקה", role: "רוטב סודי", ingredients: [] };
    s.dishes["dish.u2"] = { id: "dish.u2", name_he: "תוספת", role: "side", ingredients: [] };
  });
  const again = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(again.state.dishes["dish.u1"].role === "main", again.state.dishes["dish.u1"].role);
  assert(again.state.dishes["dish.u2"].role === "side", again.state.dishes["dish.u2"].role);
  return "main / side";
});

check("Covers — משבצת בלי dish_id עדיין נזרקת", () => {
  // תנאי הקבלה הזה הוא מה שמאפשר לרכיבים לחיות באותה סכמה: גרסה ישנה
  // במטמון קוראת את הראשי, ומשבצת בלי ראשי הייתה נמחקת שם בשקט.
  const storage = fakeStorage({
    [TEST_KEY]: JSON.stringify({
      schema_version: SCHEMA_VERSION,
      plan: {
        week_start: "2026-08-02",
        slots: { "2026-08-03.dinner": { extras: ["dish.white_rice"], eaters: ["p1"] } },
        checked: {},
      },
    }),
  });
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 8, 5) });
  assert(Object.keys(store.state.plan.slots).length === 0, "משבצת בלי ראשי שרדה");
  return "נזרקה";
});

/* ---------- חיבור המכשיר ---------- */

group("חיבור המכשיר");

check("כתובת תקינה מנורמלת לאותיות קטנות ובלי רווחים", () => {
  const result = normalizeEmail("  Yarin@Ganpereh.co.il  ");
  assert(result.ok, "נדחתה כתובת תקינה");
  assert(result.value === "yarin@ganpereh.co.il", `קיבלנו ${result.value}`);
  return result.value;
});

check("כתובת ריקה נדחית עם הסבר", () => {
  const result = normalizeEmail("   ");
  assert(!result.ok, "כתובת ריקה התקבלה");
  assert(result.problem, "אין הסבר לדחייה");
  return "נדחתה";
});

/* הכשל שבגללו הבדיקה כאן מחמירה יותר מ-auth.js: Supabase מקבל כתובת
   בלי נקודה בדומיין, המשתמש ממתין לדואר שלא יגיע, ואין שום דבר על
   המסך שיסביר למה. */
check("דומיין בלי נקודה נדחה לפני שהבקשה יוצאת", () => {
  assert(!normalizeEmail("yarin@gmail").ok, "yarin@gmail התקבלה");
  assert(!normalizeEmail("yarin").ok, "כתובת בלי @ התקבלה");
  assert(!normalizeEmail("yarin@ gmail.com").ok, "כתובת עם רווח התקבלה");
  return "שלוש נדחו";
});

/* המחרוזת המדויקת שהופיעה על המסך בייצור, באנגלית, בתוך אפליקציה
   שכל מחרוזת בה עברית. */
check("חסימת קצב נאמרת בעברית ומפנה לקוד שכבר הגיע", () => {
  const text = authErrorMessage(new Error("email rate limit exceeded"));
  assert(!/[a-z]/i.test(text), `נשארה אנגלית: ${text}`);
  assert(text.includes("עדיין תקף"), "לא נאמר שהקוד הקודם עדיין עובד");
  return "עברית";
});

/* ---------- הקוד החד-פעמי ---------- */

/* רווחים ומקפים הם מה שקורה כשמעתיקים מספר מהמייל, ולא טעות. אותו
   הסכם בדיוק כמו בקוד השיתוף. */
check("רווחים ומקפים יורדים מהקוד ולא נחשבים טעות", () => {
  for (const raw of ["123456", " 123456 ", "123 456", "123-456", "12 34-56"]) {
    const result = normalizeOtpCode(raw);
    assert(result.ok, `נדחה: "${raw}"`);
    assert(result.value === "123456", `"${raw}" → ${result.value}`);
    assert(result.problem === null, `"${raw}" קיבל הערה: ${result.problem}`);
  }
  return "חמש צורות → 123456";
});

check("קוד ריק נדחה עם הסבר", () => {
  const result = normalizeOtpCode("   ");
  assert(!result.ok, "קוד ריק התקבל");
  assert(result.problem, "אין הסבר לדחייה");
  return "נדחה";
});

/* מי שהעתיק בטעות מילה מהמייל מקבל תשובה מיידית, במקום "הקוד אינו
   תקף" מהשרת — נוסח שנקרא כאילו הקוד פג ושולח לבקש חדש בחינם. */
check("תו שאינו ספרה עוצר בלקוח ולא מגיע לשרת", () => {
  for (const raw of ["12345a", "Please", "123.456", "١٢٣٤٥٦"]) {
    const result = normalizeOtpCode(raw);
    assert(!result.ok, `התקבל: "${raw}"`);
    assert(result.problem.includes("ספרות"), `הסבר לא מדויק עבור "${raw}"`);
  }
  return "ארבעה נדחו";
});

/* ⚠️ אורך הקוד ניתן לשינוי בקונסולה של Supabase (6–10). לקוח שדוחה
   קוד באורך שהשרת דווקא הנפיק היה יוצר תקלה שאין ממנה מוצא בממשק —
   ולכן אורך חריג מקבל הערה, אבל `ok` נשאר true והבקשה יוצאת. */
check("אורך חריג מדווח אבל אינו חוסם את השליחה", () => {
  const short = normalizeOtpCode("1234");
  assert(short.ok, "קוד קצר נחסם — השרת לא יקבל הזדמנות להכריע");
  assert(short.problem && short.problem.includes("6"), `אין הערה על האורך: ${short.problem}`);

  const long = normalizeOtpCode("12345678");
  assert(long.ok, "קוד באורך 8 נחסם, למרות ש-Supabase מאפשר להגדיר כזה");
  assert(long.value === "12345678", `הערך שונה: ${long.value}`);
  return "שניהם עברו עם הערה";
});

/* השרת מחזיר `invalid or expired` על שלושה מצבים שונים שהמשתמש לא
   יכול להבחין ביניהם. עדיף למנות אותם מאשר להשאיר אותו מנחש אם
   להקליד שוב או לבקש קוד חדש. */
check("קוד שנדחה מונה את שלוש הסיבות ואומר מה עושים", () => {
  for (const raw of ["Token has expired or is invalid", "otp_expired", "Invalid token"]) {
    const text = otpErrorMessage(new Error(raw));
    assert(!/[a-z]/i.test(text), `נשארה אנגלית: ${text}`);
    assert(text.includes("קוד חדש"), `לא נאמר מה עושים: ${text}`);
  }
  return "עברית עם מוצא";
});

/* אותו כלל של `authErrorMessage`: נוסח לא מוכר לא מודלף לאנגלית וגם
   לא מקבל הסבר מומצא. */
check("שגיאת אימות לא מוכרת נופלת לעברית כללית", () => {
  for (const raw of ["unexpected_failure", "500 Internal Server Error", "", null, undefined]) {
    const text = otpErrorMessage(raw ? new Error(raw) : raw);
    assert(!/[a-z]/i.test(text), `נשארה אנגלית עבור ${raw}: ${text}`);
    assert(text.length > 0, `ריק עבור ${raw}`);
  }
  return "חמישה מקרים";
});

check("ניתוק רשת באימות נאמר כניתוק ולא ככישלון של הקוד", () => {
  const text = otpErrorMessage(new TypeError("Failed to fetch"));
  assert(text.includes("חיבור"), text);
  assert(!text.includes("אינו תקף"), `הואשם הקוד: ${text}`);
  return "עברית";
});

check("המתנה קצרה אומרת כמה שניות", () => {
  const one = authErrorMessage(
    new Error("For security purposes, you can only request this after 1 second."),
  );
  const many = authErrorMessage(
    new Error("For security purposes, you can only request this after 47 seconds."),
  );
  assert(one.includes("שנייה") && !one.includes("1"), `יחיד: ${one}`);
  assert(many.includes("47"), `רבים: ${many}`);
  return many;
});

check("שגיאת רשת נאמרת כניתוק ולא ככשל", () => {
  const text = authErrorMessage(new TypeError("Failed to fetch"));
  assert(text.includes("חיבור"), text);
  assert(!/[a-z]/i.test(text), `נשארה אנגלית: ${text}`);
  return "עברית";
});

/* הכלל שמכסה את מה שלא חזינו: נוסח לא מוכר לא מודלף לאנגלית, וגם לא
   מקבל הסבר מומצא. */
check("נוסח לא מוכר נופל לעברית כללית בלי להמציא סיבה", () => {
  for (const raw of ["unexpected_failure", "500 Internal Server Error", "", null, undefined]) {
    const text = authErrorMessage(raw ? new Error(raw) : raw);
    assert(!/[a-z]/i.test(text), `נשארה אנגלית עבור ${raw}: ${text}`);
    assert(text.length > 0, `ריק עבור ${raw}`);
  }
  return "חמישה מקרים";
});

check("ניסוח הזמן היחסי", () => {
  const now = Date.parse("2026-08-05T12:00:00Z");
  assert(agoPhrase(now - 10_000, now) === "עכשיו", "פחות מדקה");
  assert(agoPhrase(now - 60_000, now) === "לפני דקה", "דקה אחת");
  assert(agoPhrase(now - 5 * 60_000, now) === "לפני 5 דקות", "כמה דקות");
  assert(agoPhrase(now - 60 * 60_000, now) === "לפני שעה", "שעה אחת");
  assert(agoPhrase(now - 5 * 60 * 60_000, now) === "לפני 5 שעות", "כמה שעות");
  assert(agoPhrase(now - 30 * 60 * 60_000, now) === "לפני יותר מיממה", "מעל יממה");
  return "שישה מצבים";
});

/* שעון מוטה לאחור היה מייצר "לפני מינוס שתי דקות". הקיזוז נחתך באפס
   ולכן זמן עתידי נקרא כ"עכשיו" — לא מדויק, אבל גם לא שבור. */
check("חותמת עתידית לא מייצרת מספר שלילי", () => {
  const now = Date.parse("2026-08-05T12:00:00Z");
  assert(agoPhrase(now + 90_000, now) === "עכשיו", "זמן עתידי");
  return "עכשיו";
});

/* הבאג שהבדיקה הזו נועדה למנוע מלחזור: היעד נשלח בגוף הבקשה בשדה
   options.email_redirect_to — הצורה של ה-SDK ולא של ה-REST. השרת לא
   מתלונן, שולח את המייל, ומייצר קישור ל-Site URL של הפרויקט. כלומר
   הכל נראה תקין עד שלוחצים על הקישור ונוחתים בדף הבית. */
check("היעד לחזרה נשלח כפרמטר שאילתה ולא בגוף", () => {
  const path = otpPath("https://ganpereh.co.il/app/");
  assert(path.startsWith("otp?redirect_to="), `קיבלנו ${path}`);
  assert(path.includes("https%3A%2F%2Fganpereh.co.il%2Fapp%2F"), `לא מקודד: ${path}`);
  return path;
});

check("בלי יעד — נתיב נקי בלי סימן שאלה תלוי", () => {
  assert(otpPath(null) === "otp", "null");
  assert(otpPath("") === "otp", "מחרוזת ריקה");
  assert(otpPath(undefined) === "otp", "undefined");
  return "otp";
});

check("מצב הסנכרון כמשפט", () => {
  const now = Date.parse("2026-08-05T12:00:00Z");
  assert(syncPhrase({ state: "syncing", at: now }, now) === "מסנכרן…", "syncing");
  assert(syncPhrase({ state: "ok", at: now }, now) === "מסונכרן עכשיו", "ok");
  assert(syncPhrase(null, now) === "", "בלי מצב");
  assert(syncPhrase({ state: "idle", at: now }, now).length > 0, "idle בלי ניסוח");
  return "ארבעה מצבים";
});

/* offline ו-locked כבר נושאים נוסח מלא מ-sync.js. שכפול הניסוח כאן
   היה מייצר שתי אמיתות שנפרדות בשקט בעדכון הבא. */
check("הודעות המנוע נמסרות כמו שהן ולא משוכפלות", () => {
  const message = "אין כרגע חיבור לסנכרון.";
  assert(syncPhrase({ state: "offline", message, at: 0 }, 0) === message, "offline");
  assert(syncPhrase({ state: "locked", message, at: 0 }, 0) === message, "locked");
  assert(syncPhrase({ state: "signed_out", message, at: 0 }, 0) === message, "signed_out");
  return "שלוש נמסרו";
});

/* ---------- צירוף אדם שני ---------- */

group("צירוף אדם שני");

/* האלפבית אינו העדפה אלא הנימוק שכל המסך נשען עליו: הקוד נאמר בקול.
   תו מתחלף שייכנס אליו בסיבוב הבא יישבר בשיחת טלפון ולא בקוד, ולכן
   הבדיקה שומרת עליו כאן. */
check("אלפבית הקוד נקי מהתווים שמתחלפים בהקראה", () => {
  for (const char of ["0", "O", "1", "I", "L"]) {
    assert(!CODE_ALPHABET.includes(char), `${char} נמצא באלפבית`);
  }
  assert(CODE_ALPHABET.length === 31, `גודל האלפבית ${CODE_ALPHABET.length}`);
  return "חמישה מוחרגים";
});

check("הקוד מוצג בשתי קבוצות של ארבעה", () => {
  assert(formatInviteCode("K7QTM4XN") === "K7QT M4XN", formatInviteCode("K7QTM4XN"));
  return "K7QT M4XN";
});

/* חלוקה מומצאת על משהו שאיננו קוד תקין גרועה מהיעדר חלוקה — היא
   מציגה אותו כתקין. */
check("אורך חריג מוצג כמו שהוא", () => {
  assert(formatInviteCode("K7QT") === "K7QT", "אורך קצר חולק");
  assert(formatInviteCode("") === "", "מחרוזת ריקה");
  return "ללא חלוקה";
});

/* מה שקורה כשמקלידים מה ששומעים: אותיות קטנות, רווח בין הקבוצות,
   ולפעמים מקף שנוסף מההודעה שהקוד הודבק ממנה. אף אחד מאלה אינו טעות. */
check("רווחים, מקפים ואותיות קטנות אינם טעות", () => {
  for (const raw of ["k7qt m4xn", "K7QT-M4XN", " k7qtm4xn ", "K7QT—M4XN"]) {
    const result = normalizeInviteCode(raw);
    assert(result.ok, `נדחה: ${raw}`);
    assert(result.value === "K7QTM4XN", `${raw} → ${result.value}`);
  }
  return "ארבע צורות";
});

/* התו שאינו באלפבית נעצר בלקוח ולא בשרת, כי תשובת השרת על קוד כזה
   היא "אינו תקף" — נוסח שנקרא כאילו הקוד פג, ושולח לבקש קוד חדש
   במקום לתקן אות אחת. */
check("תו שאינו באלפבית נעצר לפני שהבקשה יוצאת", () => {
  for (const raw of ["K7QTM4X0", "K7QTM4XO", "K7QTM4XI"]) {
    const result = normalizeInviteCode(raw);
    assert(!result.ok, `${raw} התקבל`);
    assert(result.problem, `אין הסבר עבור ${raw}`);
  }
  return "שלושה נדחו";
});

check("אורך שגוי וקלט ריק נדחים עם הסבר", () => {
  assert(!normalizeInviteCode("K7QTM4X").ok, "שבעה תווים התקבלו");
  assert(!normalizeInviteCode("K7QTM4XNP").ok, "תשעה תווים התקבלו");
  const empty = normalizeInviteCode("   ");
  assert(!empty.ok, "קלט ריק התקבל");
  assert(empty.problem, "אין הסבר לקלט ריק");
  return "שלושה נדחו";
});

check("תוקף הקוד נאמר לפי שעת השרת", () => {
  const now = new Date(2026, 6, 31, 9, 0).getTime();
  const today = inviteExpiryPhrase(new Date(2026, 6, 31, 23, 30).toISOString(), now);
  const tomorrow = inviteExpiryPhrase(new Date(2026, 7, 1, 8, 45).toISOString(), now);
  assert(today.includes("היום"), today);
  assert(tomorrow.includes("מחר"), tomorrow);
  assert(tomorrow.includes("08:45"), tomorrow);
  return tomorrow;
});

/* בלי חותמת מהשרת אומרים רק את מה שהסכמה מבטיחה. שעה שמחושבת משעון
   המכשיר הייתה נראית מדויקת בדיוק במידה שבה היא אינה. */
check("בלי חותמת מהשרת לא ממציאים שעה", () => {
  for (const raw of [null, undefined, "", "לא-תאריך"]) {
    const text = inviteExpiryPhrase(raw, Date.now());
    assert(text.includes("יממה"), `${raw} → ${text}`);
    assert(!/\d{2}:\d{2}/.test(text), `הומצאה שעה עבור ${raw}: ${text}`);
  }
  return "ארבעה מקרים";
});

/* הכלל שנולד בשורת המייל: משפט עברי שנגמר בטקסט לטיני או בספרות מזיז
   את הנקודה לקצה השמאלי, והיא נראית שם כמו תקלה. */
check("משפט התוקף נגמר במילה עברית", () => {
  const texts = [
    inviteExpiryPhrase(
      new Date(2026, 6, 31, 23, 30).toISOString(),
      new Date(2026, 6, 31).getTime(),
    ),
    inviteExpiryPhrase(null),
  ];
  for (const text of texts) {
    assert(/[֐-׿]\.$/.test(text), `נגמר לא נכון: ${text}`);
  }
  return "שני נוסחים";
});

check("קוד שנשרף או שפג מוסבר בעברית, עם מה לעשות", () => {
  const text = inviteErrorMessage(new Error("invalid or expired invite"));
  assert(text.includes("קוד חדש"), text);
  assert(!/[a-z]/i.test(text), `נשארה אנגלית: ${text}`);
  return "עברית";
});

check("כל נוסח שהשרת מחזיר יוצא בעברית", () => {
  for (const raw of ["not authenticated", "Failed to fetch", "unexpected_failure", "", null]) {
    const text = inviteErrorMessage(raw ? new Error(raw) : raw);
    assert(!/[a-z]/i.test(text), `נשארה אנגלית עבור ${raw}: ${text}`);
    assert(text.length > 0, `ריק עבור ${raw}`);
  }
  return "חמישה מקרים";
});

/* ---------- תצוגה ---------- */

const summary = document.getElementById("summary");
const results = document.getElementById("results");

for (const g of groups) {
  const section = document.createElement("div");
  section.className = "group";
  const h2 = document.createElement("h2");
  h2.textContent = g.name;
  const ul = document.createElement("ul");
  for (const row of g.rows) {
    const li = document.createElement("li");
    li.className = row.ok ? "ok" : "bad";
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = row.ok ? "✔" : "✖";
    li.append(mark, document.createTextNode(row.name));
    if (row.detail) {
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = row.detail;
      li.append(detail);
    }
    ul.append(li);
  }
  section.append(h2, ul);
  results.append(section);
}

summary.className = failed === 0 ? "pass" : "fail";
summary.textContent =
  failed === 0 ? `הכול ירוק — ${passed} בדיקות עברו.` : `${failed} נכשלו מתוך ${passed + failed}.`;
