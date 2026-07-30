/* מנוע הנרמול והמאקרו — פונקציות טהורות, בלי DOM ובלי גישה ל-store.
   זה הממשק הקשה של המוצר, ולכן הוא נבדק בנפרד ב-app/dev/tests.html.

   שני כללי יסוד מהחוזה:
   - כמויות במנה הן תמיד למנה בודדת. ההכפלה ב-servings קורית בשכבת התוכנית.
     משבצת מחזיקה כמה רכיבים (חלבון, תוספת, סלט), וכולם חולקים את אותו
     servings — צלחת אחת עם שני מרכיבים ולא שתי ארוחות נפרדות.
   - כל כמות מנורמלת ליחידת הבסיס לפני סכימה, ורק דרך unit_weight_g
     ו-density_g_per_ml. אין המרה מומצאת: כמות שאי אפשר להמיר מוחזרת
     מסומנת, לא כשגיאה ולא כאפס שקט. */

import { slotComponents } from "./compose.js";

const MASS = "g";
const VOLUME = "ml";
const COUNT = "unit";

/** יחידות קלט נתמכות והמרתן ליחידה קנונית. */
const INPUT_UNITS = {
  g: { canonical: MASS, factor: 1 },
  kg: { canonical: MASS, factor: 1000 },
  ml: { canonical: VOLUME, factor: 1 },
  l: { canonical: VOLUME, factor: 1000 },
  unit: { canonical: COUNT, factor: 1 },
};

export const UNIT_LABELS = { g: "גרם", ml: 'מ"ל', unit: "יח'" };

function ok(qty, unit) {
  return { ok: true, qty, unit };
}

function manual(reason, qty, unit) {
  return { ok: false, reason, qty, unit };
}

/**
 * ממיר כמות ליחידת הבסיס של המצרך.
 * @returns {{ok:true,qty:number,unit:string}|{ok:false,reason:string,qty:number,unit:string}}
 */
export function toBase(ingredient, qty, unit) {
  if (!ingredient) return manual("unknown_ingredient", qty, unit);
  if (typeof qty !== "number" || !Number.isFinite(qty)) return manual("bad_qty", qty, unit);

  const spec = INPUT_UNITS[unit];
  if (!spec) return manual("unknown_unit", qty, unit);

  const base = ingredient.base_unit;
  if (!INPUT_UNITS[base]) return manual("unknown_base_unit", qty, unit);

  const from = spec.canonical;
  const amount = qty * spec.factor;
  const to = INPUT_UNITS[base].canonical;

  if (from === to) return ok(amount, base);

  const unitWeight = ingredient.unit_weight_g;
  const density = ingredient.density_g_per_ml;

  // ספירה → משקל/נפח
  if (from === COUNT) {
    if (unitWeight == null) return manual("no_unit_weight", qty, unit);
    const grams = amount * unitWeight;
    if (to === MASS) return ok(grams, base);
    if (density == null) return manual("no_density", qty, unit);
    return ok(grams / density, base);
  }

  // משקל/נפח → ספירה
  if (to === COUNT) {
    if (unitWeight == null) return manual("no_unit_weight", qty, unit);
    const grams = from === MASS ? amount : density == null ? null : amount * density;
    if (grams == null) return manual("no_density", qty, unit);
    return ok(grams / unitWeight, base);
  }

  // משקל ↔ נפח
  if (density == null) return manual("no_density", qty, unit);
  return from === VOLUME ? ok(amount * density, base) : ok(amount / density, base);
}

/* ---------- רשימת קניות ---------- */

/**
 * שטוח את תוכנית השבוע לפריטי מצרך, כשהכמות כבר מוכפלת ב-servings.
 *
 * כל רכיב במשבצת תורם את המצרכים שלו בנפרד, ולכן המקור שנגרר לשורת
 * הקנייה מצביע על *הרכיב* ולא על המשבצת: מי שפותח שורת תפוחי אדמה
 * רואה "צ'יפס בתנור · שלישי" ולא ארוחה שצריך לנחש מה בתוכה.
 *
 * @param {string[]} dates      שבעת תאריכי השבוע
 * @param {object} slots        plan.slots
 * @param {(id:string)=>object} resolveDish
 */
export function planLineItems(dates, slots, resolveDish) {
  const items = [];
  for (const date of dates) {
    for (const [key, slot] of Object.entries(slots || {})) {
      if (!key.startsWith(`${date}.`)) continue;
      if (!slot || !slot.dish_id) continue;
      if (slot.status === "skipped" || slot.status === "ate_out") continue;
      const servings = Number(slot.servings) > 0 ? Number(slot.servings) : 1;

      for (const dishId of slotComponents(slot)) {
        const dish = resolveDish(dishId);
        if (!dish) continue;
        for (const entry of dish.ingredients) {
          items.push({
            ingredient_id: entry.ingredient_id,
            qty: entry.qty * servings,
            unit: entry.unit,
            // מאיפה הכמות הגיעה. נגרר עד לשורת הקנייה כדי שאפשר יהיה
            // לפתוח אותה ולראות מה מרכיב אותה — בלי לחשב מחדש.
            source: { date, dish_id: dish.id, servings },
          });
        }
      }
    }
  }
  return items;
}

/**
 * מנרמל וסוכם פריטים לפי מצרך. פריט שאי אפשר להמיר נשמר בנפרד עם
 * הכמות המקורית — לעולם לא מומר בניחוש ולא נבלע.
 * @returns {{lines: Array, manual: Array}}
 */
export function sumLineItems(items, resolveIngredient) {
  const totals = new Map();
  const manualBuckets = new Map();

  // המקור נצבר עם הכמות המנורמלת שלו, ולא מחושב מחדש בתצוגה — כך שסכום
  // המקורות תמיד מסתדר עם הסכום בשורה.
  const addSource = (row, item, qty, unit) => {
    if (item.source) row.sources.push({ ...item.source, qty, unit });
  };

  for (const item of items) {
    const ingredient = resolveIngredient(item.ingredient_id);
    const result = toBase(ingredient, item.qty, item.unit);

    if (result.ok) {
      const current = totals.get(item.ingredient_id);
      if (current) {
        current.qty += result.qty;
        addSource(current, item, result.qty, result.unit);
      } else {
        const row = {
          ingredient,
          ingredient_id: item.ingredient_id,
          qty: result.qty,
          unit: result.unit,
          sources: [],
        };
        addSource(row, item, result.qty, result.unit);
        totals.set(item.ingredient_id, row);
      }
      continue;
    }

    // מיזוג רק בין פריטים שחולקים מצרך *ויחידה מקורית* — בלי המרה ביניהם.
    const bucketKey = `${item.ingredient_id}|${item.unit}`;
    const bucket = manualBuckets.get(bucketKey);
    if (bucket) {
      bucket.qty += item.qty;
      addSource(bucket, item, item.qty, item.unit);
    } else {
      const row = {
        ingredient,
        ingredient_id: item.ingredient_id,
        qty: item.qty,
        unit: item.unit,
        reason: result.reason,
        sources: [],
      };
      addSource(row, item, item.qty, item.unit);
      manualBuckets.set(bucketKey, row);
    }
  }

  return { lines: [...totals.values()], manual: [...manualBuckets.values()] };
}

/* ---------- מאקרו ---------- */

const EMPTY_MACROS = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
const MACRO_FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"];

export function addMacros(a, b) {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    fat_g: a.fat_g + b.fat_g,
    carbs_g: a.carbs_g + b.carbs_g,
  };
}

export function scaleMacros(macros, factor) {
  return {
    kcal: macros.kcal * factor,
    protein_g: macros.protein_g * factor,
    fat_g: macros.fat_g * factor,
    carbs_g: macros.carbs_g * factor,
  };
}

/**
 * מאקרו למנה בודדת, נגזר מהמצרכים ולא נשמר.
 * macros_override לא-null גובר ומסומן כדריסה ידנית.
 * @returns {{kcal,protein_g,fat_g,carbs_g, partial:boolean, override:boolean}}
 */
export function dishMacros(dish, resolveIngredient) {
  if (!dish) return { ...EMPTY_MACROS, partial: true, override: false };

  if (dish.macros_override) {
    // דריסה שממלאת רק חלק מהשדות (המקרה האמיתי: יודעים קלוריות של מנה
    // במסעדה ולא את הפירוק) לא נחשבת מלאה — אחרת אפסים מוצגים כידע.
    const partial = MACRO_FIELDS.some((field) => typeof dish.macros_override[field] !== "number");
    return { ...EMPTY_MACROS, ...dish.macros_override, partial, override: true };
  }

  let total = { ...EMPTY_MACROS };
  let partial = false;

  for (const entry of dish.ingredients) {
    const ingredient = resolveIngredient(entry.ingredient_id);
    const nutrition = ingredient?.nutrition_per_100;
    const result = toBase(ingredient, entry.qty, entry.unit);

    if (!result.ok || !nutrition) {
      partial = true;
      continue;
    }

    // מצרך שהוזן ידנית יכול לשאת חלק מהערכים בלבד (קלוריות וחלבון הם
    // מה שיודעים על רוב המוצרים). שדה חסר נספר כאפס בסכימה, ולכן
    // המנה מסומנת כחלקית — בדיוק כמו דריסת מאקרו חלקית מעל.
    if (MACRO_FIELDS.some((field) => typeof nutrition[field] !== "number")) partial = true;

    const per100 = result.qty / 100;
    total = addMacros(total, {
      kcal: (nutrition.kcal || 0) * per100,
      protein_g: (nutrition.protein_g || 0) * per100,
      fat_g: (nutrition.fat_g || 0) * per100,
      carbs_g: (nutrition.carbs_g || 0) * per100,
    });
  }

  return { ...total, partial, override: false };
}

/**
 * דריסת מאקרו מתוך קלט טופס.
 *
 * מחזירה null כשאין ולו שדה ממשי אחד — כלומר "אין דריסה", ולא אובייקט
 * של ארבעה אפסים. ההבחנה היא בין *ריק* לבין *מספר*, ולא בין אפס לבין
 * לא-אפס: אפס הוא ערך לגיטימי (יש מנות בלי שומן), ולפסול אותו היה
 * מכריח להמציא 0.1.
 *
 * שדה שנשאר ריק פשוט אינו נכנס, ו-dishMacros מסמן את התוצאה "חלקי"
 * בדיוק בגללו. כך המסך אומר "יודעים קלוריות ולא את הפירוק" במקום
 * להשלים אפסים ולהציג אותם כידע — אותו כלל של מצרך עם ערכים חלקיים.
 *
 * ── למה הפסילה מפורטת ולא Number() לבד ──────────────────────────────
 * `Number(false)` הוא 0, וכך גם `Number("   ")`. הקיצור היה מקבל אותם
 * כטענה שבמנה הזו אפס קלוריות — הפיכת "לא יודע" ל"אפס", שהיא בדיוק
 * מה שההבחנה כאן נועדה למנוע. `store.js` קורא לפונקציה הזו גם על מה
 * שנטען מהאחסון, ולכן היא פוגשת ערכים שאף טופס לא ייצר.
 */
export function coerceMacroOverride(raw) {
  if (!raw || typeof raw !== "object") return null;

  const out = {};
  for (const field of MACRO_FIELDS) {
    const value = raw[field];
    if (value === null || value === undefined || typeof value === "boolean") continue;
    if (typeof value === "string" && !value.trim()) continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) out[field] = number;
  }

  return Object.keys(out).length ? out : null;
}

/**
 * מאקרו לכמות של מצרך בודד — הבסיס לנשנושים ולמשקאות.
 *
 * dishMacros סוכם מצרכים בתוך מנה; כאן אין מנה, רק "150 גרם שקדים".
 * שלושת מצבי הכשל מובחנים ולא נבלעים זה בזה:
 *
 * - כמות שאי אפשר להביא ליחידת הבסיס → unresolved. אין המרה מנוחשת,
 *   בדיוק כמו ב-toBase וב-applyPantry.
 * - מצרך בלי nutrition_per_100 → unresolved. אפס קלוריות אינו "לא
 *   ידוע", והצגתו כידע הייתה משקרת דווקא במסך שכל תפקידו לתאר.
 * - ערכי תזונה חלקיים (קלוריות וחלבון בלבד) → partial, כמו במנה.
 *
 * ── למה reason ולא רק דגל ───────────────────────────────────────────
 * שני מצבי הכשל נראים זהים למשתמש ודורשים תיקון הפוך: "אין ערכי
 * תזונה" פירושו ללכת לערוך את המצרך, ואילו כמות שלא הומרה פירושה
 * להזין אותה ביחידה אחרת. ממשק שאמר "אין ערכי תזונה" על יוגורט שיש
 * לו ערכים — ורק היחידה שלו לא ניתנת להמרה — שולח לתקן את מה שתקין.
 *
 * @returns {{kcal,protein_g,fat_g,carbs_g, partial:boolean,
 *            unresolved:boolean, reason?:string}}
 */
export function ingredientMacros(ingredient, qty, unit) {
  const nutrition = ingredient?.nutrition_per_100;
  const result = toBase(ingredient, Number(qty), unit);

  // סדר הבדיקות מכוון: כשל המרה מדווח לפני היעדר ערכים, כי הוא
  // הפעולה שאפשר לתקן מיד ובלי לערוך את הקטלוג.
  if (!result.ok) {
    return { ...EMPTY_MACROS, partial: true, unresolved: true, reason: result.reason };
  }
  if (!nutrition) {
    return { ...EMPTY_MACROS, partial: true, unresolved: true, reason: "no_nutrition" };
  }

  const partial = MACRO_FIELDS.some((field) => typeof nutrition[field] !== "number");
  const per100 = result.qty / 100;

  return {
    kcal: (nutrition.kcal || 0) * per100,
    protein_g: (nutrition.protein_g || 0) * per100,
    fat_g: (nutrition.fat_g || 0) * per100,
    carbs_g: (nutrition.carbs_g || 0) * per100,
    partial,
    unresolved: false,
  };
}

/**
 * מאקרו של הרכבה שלמה — סכימת כל הרכיבים, למנה בודדת.
 *
 * רכיב אחד חלקי מסמן את כל ההרכבה כחלקית. זה מכוון: המספר המוצג הוא
 * של הצלחת, ואם חסר בה מידע על הטחינה אז המספר של הצלחת אינו מלא.
 */
export function composedMacros(dishes, resolveIngredient) {
  const list = (dishes || []).filter(Boolean);
  if (!list.length) return { ...EMPTY_MACROS, partial: true, override: false };

  let total = { ...EMPTY_MACROS };
  let partial = false;
  let override = false;

  for (const dish of list) {
    const macros = dishMacros(dish, resolveIngredient);
    total = addMacros(total, macros);
    if (macros.partial) partial = true;
    if (macros.override) override = true;
  }

  return { ...total, partial, override };
}

/**
 * מנת המאקרו של אוכל יחיד במשבצת: servings חלקי מספר האוכלים.
 * משבצת בלי אוכלים מסומנים מוחזרת כלא-ניתנת-לחישוב במקום לחלק באפס.
 *
 * @param {object} slot
 * @param {object[]} dishes  רכיבי המשבצת, פתורים
 */
export function slotMacrosPerEater(slot, dishes, resolveIngredient) {
  const eaters = Array.isArray(slot?.eaters) ? slot.eaters : [];
  const list = (dishes || []).filter(Boolean);
  if (!list.length || eaters.length === 0) {
    return { ...EMPTY_MACROS, partial: true, override: false, unresolved: true };
  }
  const servings = Number(slot.servings) > 0 ? Number(slot.servings) : 1;
  const base = composedMacros(list, resolveIngredient);
  return {
    ...scaleMacros(base, servings / eaters.length),
    partial: base.partial,
    override: base.override,
    unresolved: false,
  };
}

/* ---------- תצוגה ---------- */

/** כמות לתצוגה: עיגול לפי סדר הגודל, ומעבר לק"ג מעל 1000 גרם. */
export function formatQty(qty, unit) {
  // מעגלים לפני ההשוואה לסף: 999.6 גרם היה מוצג "1000 גרם", בניגוד
  // לכלל שהפונקציה עצמה קובעת.
  const rounded = qty >= 10 ? Math.round(qty) : Number(qty.toFixed(1));
  if (unit === MASS && rounded >= 1000) {
    return `${Number((rounded / 1000).toFixed(2))} ק"ג`;
  }
  return `${rounded} ${UNIT_LABELS[unit] || unit}`;
}

export function formatMacros(macros) {
  return {
    kcal: Math.round(macros.kcal),
    protein_g: Math.round(macros.protein_g),
    fat_g: Math.round(macros.fat_g),
    carbs_g: Math.round(macros.carbs_g),
  };
}
