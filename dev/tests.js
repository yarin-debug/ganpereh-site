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
import { weekCounts } from "../js/ui-week.js";
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
