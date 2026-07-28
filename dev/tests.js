/* בדיקות המנוע וה-store.

   מפתח האחסון מוזרק, כך שהדף הזה רץ מול מפתח בדיקה ייעודי ומנקה אותו
   בסיום — גם כשהוא נפתח באוויר על אותו origin כמו האפליקציה. */

import {
  toBase,
  planLineItems,
  sumLineItems,
  dishMacros,
  slotMacrosPerEater,
  formatQty,
} from "../js/normalize.js";
import {
  createStore,
  isoLocal,
  sundayOf,
  addDays,
  weekDates,
  PROD_KEY,
  SCHEMA_VERSION,
} from "../js/store.js";
import { INGREDIENTS, DISHES, getIngredient, getDish } from "../js/data.js";
import { dayState, mealState, dayMeals, cookedStreak, toggleStatus, lineKey } from "../js/plan.js";
import { mergeCatalog, nextId } from "../js/catalog.js";
import { applyPantry, onHandInBase, pantryRows } from "../js/pantry.js";
import {
  activeProfiles,
  nextProfileId,
  removeEaterFromSlots,
  coerceTargets,
} from "../js/profiles.js";

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
  const m = slotMacrosPerEater(slot, dish, getIngredient);
  return near(m.kcal, 165 * 1.5);
});

check("משבצת בלי אוכלים מסומנים לא מחלקת באפס", () => {
  const dish = {
    ingredients: [{ ingredient_id: "ing.chicken_breast", qty: 100, unit: "g" }],
    macros_override: null,
  };
  const m = slotMacrosPerEater({ servings: 2, eaters: [] }, dish, getIngredient);
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

check("10 מצרכים, 3 מנות", () => {
  assert(INGREDIENTS.length === 10, `מצרכים: ${INGREDIENTS.length}`);
  assert(DISHES.length === 3, `מנות: ${DISHES.length}`);
  return "10 / 3";
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

group("המזווה");

/** תוצאת סכימה מדומה, בפורמט שה-sumLineItems מחזיר. */
function summedOf(lines = [], manual = []) {
  return { lines, manual };
}

function normalLine(ingredientId, qty) {
  const ingredient = getIngredient(ingredientId);
  return { ingredient, qty, unit: ingredient.base_unit };
}

check("מזווה שמכסה את כל הדרישה מוציא את הפריט מהרשימה", () => {
  const summed = summedOf([normalLine("ing.onion", 300)]);
  const out = applyPantry(summed, { "ing.onion": { qty: 500, unit: "g" } });
  assert(out.lines.length === 0, "הפריט נשאר ברשימה");
  assert(out.covered.length === 1, "הפריט לא סומן ככוסה");
  return "כוסה";
});

check("כיסוי חלקי מקזז ומשאיר את ההפרש בלבד", () => {
  const summed = summedOf([normalLine("ing.onion", 900)]);
  const out = applyPantry(summed, { "ing.onion": { qty: 300, unit: "g" } });
  assert(out.lines.length === 1);
  near(out.lines[0].qty, 600);
  near(out.lines[0].onHand, 300);
  near(out.lines[0].required, 900);
  return "600 מתוך 900";
});

check("כמות זהה בדיוק נחשבת מכוסה ולא משאירה שארית אפס", () => {
  const summed = summedOf([normalLine("ing.onion", 300)]);
  const out = applyPantry(summed, { "ing.onion": { qty: 300, unit: "g" } });
  assert(out.lines.length === 0 && out.covered.length === 1, "נשארה שורה");
  return "אין שארית";
});

check("מצרך שאינו במזווה נשאר בלי שינוי", () => {
  const summed = summedOf([normalLine("ing.onion", 900)]);
  const out = applyPantry(summed, {});
  assert(out.lines.length === 1);
  near(out.lines[0].qty, 900);
  assert(out.lines[0].onHand === 0);
  return "900";
});

check("המזווה מומר ליחידת הבסיס לפני הקיזוז", () => {
  // 2 יחידות בצל = 300 גרם, מול דרישה של 900 גרם.
  const summed = summedOf([normalLine("ing.onion", 900)]);
  const out = applyPantry(summed, { "ing.onion": { qty: 2, unit: "unit" } });
  near(out.lines[0].qty, 600);
  return "יחידות קוזזו כגרמים";
});

check("מזווה שאי אפשר להמיר לא מקזז ולא מנחש", () => {
  // ליוגורט אין unit_weight_g, ולכן "גביע אחד" אינו ניתן להמרה לגרמים.
  const summed = summedOf([normalLine("ing.yogurt", 500)]);
  const out = applyPantry(summed, { "ing.yogurt": { qty: 1, unit: "unit" } });
  assert(out.lines.length === 1, "הפריט קוזז בטעות");
  near(out.lines[0].qty, 500);
  return "לא קוזז";
});

check("שורה ידנית מקוזזת רק מול יחידה זהה", () => {
  const manual = [
    { ingredient: getIngredient("ing.yogurt"), ingredient_id: "ing.yogurt", qty: 3, unit: "unit" },
  ];
  const out = applyPantry(summedOf([], manual), { "ing.yogurt": { qty: 1, unit: "unit" } });
  assert(out.manual.length === 1);
  near(out.manual[0].qty, 2);
  return "3 פחות 1";
});

check("שורה ידנית מול יחידה אחרת אינה מקוזזת", () => {
  const manual = [
    { ingredient: getIngredient("ing.yogurt"), ingredient_id: "ing.yogurt", qty: 3, unit: "unit" },
  ];
  const out = applyPantry(summedOf([], manual), { "ing.yogurt": { qty: 500, unit: "g" } });
  near(out.manual[0].qty, 3);
  return "נשאר 3";
});

check("שורה ידנית שמכוסה במלואה יורדת מהרשימה", () => {
  const manual = [
    { ingredient: getIngredient("ing.yogurt"), ingredient_id: "ing.yogurt", qty: 2, unit: "unit" },
  ];
  const out = applyPantry(summedOf([], manual), { "ing.yogurt": { qty: 4, unit: "unit" } });
  assert(out.manual.length === 0 && out.covered.length === 1);
  return "כוסה";
});

check("כמות מזווה לא תקינה מתעלמים ממנה במקום לקזז זבל", () => {
  const summed = summedOf([normalLine("ing.onion", 900)]);
  for (const bad of [{ qty: "הרבה", unit: "g" }, { qty: -50, unit: "g" }, null]) {
    const out = applyPantry(summed, { "ing.onion": bad });
    assert(out.lines.length === 1, `קוזז מול ${JSON.stringify(bad)}`);
    near(out.lines[0].qty, 900);
  }
  return "שלושה קלטים פגומים";
});

check("onHandInBase מחזיר null כשאין המרה, ולא אפס", () => {
  // אפס היה נבלע כ"אין במזווה"; null אומר "אי אפשר להשוות".
  assert(onHandInBase({ qty: 1, unit: "unit" }, getIngredient("ing.yogurt")) === null);
  near(onHandInBase({ qty: 2, unit: "unit" }, getIngredient("ing.onion")), 300);
  return "null מול 300";
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

check("כמות אפס נמחקת מהמזווה בטעינה", () => {
  const store = loadWith({
    pantry: { "ing.onion": { qty: 0, unit: "g" }, "ing.rice": { qty: 500, unit: "g" } },
  });
  const ids = Object.keys(store.state.pantry);
  assert(ids.length === 1 && ids[0] === "ing.rice", ids.join(","));
  return "רק אורז";
});

check("יחידת מזווה לא מוכרת נופלת לגרמים", () => {
  const store = loadWith({ pantry: { "ing.onion": { qty: 3, unit: "קילו-משהו" } } });
  assert(store.state.pantry["ing.onion"].unit === "g");
  return "g";
});

check("מזווה שורד שמירה וטעינה מחדש", () => {
  const storage = fakeStorage();
  const store = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  store.update((s) => {
    s.pantry["ing.onion"] = { qty: 300, unit: "g" };
  });
  const reloaded = createStore({ key: TEST_KEY, storage, now: at(2026, 7, 28) });
  assert(reloaded.state.pantry["ing.onion"].qty === 300);
  return "שרד";
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
