/* נשנושים ומשקאות — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   ── מה הפער שזה סוגר ────────────────────────────────────────────────
   מסך המאקרו נשא הסתייגות מתועדת: "היעד שמולן הוא של ימים שלמים,
   כולל ארוחות שלא תוכננו כאן". כלומר האפליקציה ידעה שהיא סופרת חלק
   מהיום והשוותה אותו ליעד של יום שלם. מי ששותה שני קפה עם חלב, אוכל
   תפוח ובייגלה, ראה מסך שמדווח על גירעון קבוע — לא כי הוא אכל מעט,
   אלא כי חצי ממה שאכל לא היה ניתן להזנה בכלל.

   ── שתי עובדות, לא ציר אחד ──────────────────────────────────────────
   planned ו-eaten הם שני שדות ולא סטטוס אחד, כי הם מזינים שני מסכים
   שונים: מה שמתוכנן צריך להיקנות, ומה שנאכל נספר במאקרו. נשנוש שקרה
   בלי תכנון (planned=false) לעולם לא יופיע ברשימת הקניות — אכלת אותו
   אצל מישהו אחר, ורשימה שמוסיפה אותו שולחת אותך לקנות מה שכבר אכלת.

   ── ולמה מצרך ולא מנה ───────────────────────────────────────────────
   נשנוש הוא כמעט תמיד פריט אחד — תפוח, קפה, חופן שקדים — ולא מתכון.
   תמיכה במנות כאן הייתה מכפילה כל מסלול (מאקרו, קנייה, בורר) בשביל
   מקרה שכבר יש לו בית: מי שרוצה לתכנן חביתה משבץ אותה כארוחה. */

import { ingredientMacros, addMacros, scaleMacros } from "./normalize.js";

const EMPTY_MACROS = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

export const KINDS = [
  { id: "snack", label: "נשנוש" },
  { id: "drink", label: "משקה" },
];

/** תוספות של יום אחד, או רשימה ריקה. לעולם לא null — הקוראים סורקים. */
export function extrasOn(extras, isoDate) {
  const list = extras?.[isoDate];
  return Array.isArray(list) ? list : [];
}

/** כל התוספות של השבוע, כל אחת עם התאריך שלה. */
export function extrasInWeek(extras, dates) {
  const out = [];
  for (const date of dates || []) {
    for (const item of extrasOn(extras, date)) out.push({ ...item, date });
  }
  return out;
}

/**
 * המזהה הפנוי הבא בתוך יום.
 *
 * נגזר מהמזהים הקיימים ולא משעון או מאקראי, בדיוק כמו nextId בקטלוג:
 * אותו רצף פעולות חייב לתת תמיד את אותה תוצאה, גם בבדיקות.
 */
export function nextExtraId(list) {
  let max = 0;
  for (const item of list || []) {
    const match = /^x(\d+)$/.exec(item?.id || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `x${max + 1}`;
}

/**
 * בונה תוספת חדשה. טהורה — הכתיבה היא באחריות הקורא.
 *
 * ברירת המחדל היא "נאכל עכשיו, בלי תכנון": זה המסלול שבו נוצרים רוב
 * הנשנושים, והוא צריך להיות הזול ביותר להקלדה.
 */
export function makeExtra({
  id,
  ingredient_id,
  qty,
  unit,
  kind = "snack",
  eaters = [],
  planned = false,
}) {
  return {
    id,
    ingredient_id,
    qty: Number(qty),
    unit,
    kind: kind === "drink" ? "drink" : "snack",
    eaters: [...eaters],
    planned: planned === true,
    // מתוכנן נולד כשטרם נאכל; מה שלא תוכנן נולד כעובדה.
    eaten: planned !== true,
  };
}

/**
 * מנת המאקרו של אוכל יחיד מתוספת: הכמות מחולקת במספר האוכלים.
 *
 * בקבוק יין ששניים חלקו הוא חצי לכל אחד. תוספת בלי אוכלים מוחזרת
 * כלא-ניתנת-לחישוב במקום לחלק באפס — אותו כלל כמו slotMacrosPerEater.
 */
export function extraMacrosPerEater(extra, ingredient) {
  const eaters = Array.isArray(extra?.eaters) ? extra.eaters : [];
  if (!eaters.length) {
    return { ...EMPTY_MACROS, partial: true, unresolved: true, reason: "no_eaters" };
  }

  const base = ingredientMacros(ingredient, extra.qty, extra.unit);
  if (base.unresolved) return base;

  return {
    ...scaleMacros(base, 1 / eaters.length),
    partial: base.partial,
    unresolved: false,
  };
}

/**
 * סיכום התוספות שאדם אחד *אכל* ביום מסוים.
 *
 * נספרות רק תוספות עם eaten — מה שמתוכנן לערב עוד לא נאכל, וספירתו
 * הייתה הופכת את מסך המאקרו מתיאור לתחזית.
 *
 * @returns {{macros, items: Array, partial: boolean, unresolved: number}}
 */
export function extrasMacrosFor(extras, isoDate, profileId, resolveIngredient) {
  let macros = { ...EMPTY_MACROS };
  const items = [];
  let partial = false;
  let unresolved = 0;

  for (const extra of extrasOn(extras, isoDate)) {
    if (!extra.eaten) continue;
    if (!Array.isArray(extra.eaters) || !extra.eaters.includes(profileId)) continue;

    const ingredient = resolveIngredient?.(extra.ingredient_id);
    const share = extraMacrosPerEater(extra, ingredient);

    // מצרך שאי אפשר לחשב לא נבלע בשקט: הוא נספר, והמסך אומר עליו.
    if (share.unresolved) {
      unresolved++;
      continue;
    }

    macros = addMacros(macros, share);
    if (share.partial) partial = true;
    items.push({ extra, ingredient, macros: share });
  }

  return { macros, items, partial, unresolved };
}

/**
 * פריטי מצרך לרשימת הקניות מתוך התוספות *המתוכננות* של השבוע.
 *
 * מוחזרים בדיוק בצורה ש-sumLineItems מצפה לה, כדי שהתוספות יתמזגו
 * לאותן שורות של המנות: מי שתכנן חלב לקפה ומנה עם חלב יקנה חלב פעם
 * אחת, בכמות המחוברת.
 *
 * מה שלא תוכנן אינו כאן — ראה ההערה בראש הקובץ.
 */
export function extraLineItems(extras, dates) {
  const items = [];
  for (const extra of extrasInWeek(extras, dates)) {
    if (!extra.planned) continue;
    items.push({
      ingredient_id: extra.ingredient_id,
      qty: extra.qty,
      unit: extra.unit,
      // kind נגרר עד לשורת הקנייה כדי שהמקור ייקרא "נשנוש · ראשון"
      // ולא ינסה להיפתר כמנה. בלעדיו התווית הייתה "undefined".
      source: { date: extra.date, extra_id: extra.id, kind: extra.kind, servings: 1 },
    });
  }
  return items;
}

/**
 * הפריטים שנוספו הכי הרבה, להוספה בהקשה אחת.
 *
 * ── למה זה הפיצ'ר ולא קישוט ─────────────────────────────────────────
 * נשנוש מוזן עשרות פעמים בשבוע, וכל הזנה מתחרה בעלות של "לא בא לי
 * עכשיו". בורר שדורש חיפוש, כמות ובחירת אדם ייטש אחרי יומיים, והמסך
 * יחזור לתאר חצי יום. לכן מה שחוזר על עצמו עולה לראש ונוסף בהקשה
 * אחת, עם הכמות שנהוג להזין לו.
 *
 * הדירוג הוא לפי שכיחות בפועל ולא לפי רשימה קבועה: מי ששותה קפה
 * שחור לא אמור לראות "מיץ תפוזים" רק כי הוא ראשון בנתוני הזרע.
 * שובר שוויון לפי שם, כדי שהסדר לא יקפוץ בין רינדורים.
 *
 * @param {object} extras
 * @param {(id:string)=>object} resolveIngredient
 * @param {number} limit
 */
export function frequentExtras(extras, resolveIngredient, limit = 6) {
  const counts = new Map();

  for (const list of Object.values(extras || {})) {
    if (!Array.isArray(list)) continue;
    for (const extra of list) {
      const key = `${extra.ingredient_id}|${extra.unit}`;
      const current = counts.get(key);
      if (current) {
        current.count++;
        // הכמות האחרונה שהוזנה גוברת: היא מה שהמשתמש עושה עכשיו.
        current.qty = extra.qty;
        continue;
      }
      counts.set(key, {
        ingredient_id: extra.ingredient_id,
        unit: extra.unit,
        qty: extra.qty,
        kind: extra.kind,
        count: 1,
      });
    }
  }

  const rows = [];
  for (const row of counts.values()) {
    const ingredient = resolveIngredient?.(row.ingredient_id);
    if (!ingredient) continue; // מצרך שנמחק מהקטלוג — לא מוצע ולא מתפוצץ
    rows.push({ ...row, ingredient });
  }

  rows.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.ingredient.name_he.localeCompare(b.ingredient.name_he, "he");
  });

  return limit > 0 ? rows.slice(0, limit) : rows;
}

/* הפריטים שההוספה המהירה מציעה לפני שיש היסטוריה. מזהי זרע בלבד —
   הרשימה מתחלפת בשימוש האמיתי אחרי הזנה בודדת. */
export const STARTER_IDS = [
  "ing.coffee_black",
  "ing.apple",
  "ing.water",
  "ing.banana",
  "ing.almonds",
  "ing.dark_chocolate",
];

/**
 * ההצעה הראשונה למי שעוד לא הזין כלום.
 *
 * בלי זה ההוספה המהירה ריקה ביום הראשון — כלומר בדיוק כשהמשתמש
 * מחליט אם הפיצ'ר הזה שווה את הטרחה. הרשימה נשענת על unit_weight_g
 * של הזרע, ולכן "אחד" הוא תמיד מנה אמיתית ולא מספר שהומצא כאן.
 */
export function starterExtras(resolveIngredient, ids = STARTER_IDS, limit = 6) {
  const rows = [];
  for (const id of ids) {
    const ingredient = resolveIngredient?.(id);
    if (!ingredient || !ingredient.unit_weight_g) continue;
    rows.push({
      ingredient_id: id,
      ingredient,
      qty: 1,
      unit: "unit",
      kind: ingredient.shelf === "drinks" ? "drink" : "snack",
      count: 0,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
