/* סקורבורד המאקרו — מתאר, לא שופט.

   טווחים ולא ציונים, בלי אדום ובלי "כישלון". יום בלי נתונים הוא
   "לא הוזן" ולא אפס, והסיכום השבועי משווה רק לימים שבהם באמת נאכל
   משהו — כדי שהמספר לא ישקר כלפי מטה. */

import { getStore, weekDates, slotKey, DAY_NAMES } from "./store.js";
import { resolveDish, resolveIngredient } from "./catalog.js";
import { MEALS } from "./plan.js";
import { slotMacrosPerEater, addMacros, formatMacros } from "./normalize.js";

const MACRO_FIELDS = [
  { key: "kcal", label: "קלוריות", unit: "" },
  { key: "protein_g", label: "חלבון", unit: "גרם" },
  { key: "fat_g", label: "שומן", unit: "גרם" },
  { key: "carbs_g", label: "פחמימות", unit: "גרם" },
];

const EMPTY = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

/** תיאור היחס ליעד — טווח, לא ציון. ±10% נחשב "סביב היעד". */
function describe(actual, target) {
  if (!target) return "אין יעד מוגדר";
  const ratio = actual / target;
  if (ratio < 0.9) return "מתחת לטווח היעד";
  if (ratio > 1.1) return "מעל טווח היעד";
  return "בטווח היעד";
}

/**
 * פירוט יומי לאדם אחד: מה נאכל בפועל בכל אחד משבעת הימים, על פני כל
 * הארוחות. היום נחשב "נאכל" אם לפחות ארוחה אחת נספרה — ולכן ארוחת
 * בוקר לבד היא יום עם נתונים, גם אם הערב עוד לא הוכרע.
 */
function dailyForProfile(state, profileId) {
  return weekDates(state.plan.week_start).map((date, index) => {
    const row = {
      day: DAY_NAMES[index],
      date,
      status: "none",
      macros: null,
      meals: [],
      planned: 0,
    };

    for (const meal of MEALS) {
      const slot = state.plan.slots[slotKey(date, meal.id)];
      if (!slot || !slot.dish_id) continue;
      row.planned++;

      // מה שנאכל בפועל — לא מה שתוכנן. אותו סינון שרשימת הקניות מחילה.
      if (slot.status === "skipped" || slot.status === "ate_out") continue;
      if (!Array.isArray(slot.eaters) || !slot.eaters.includes(profileId)) continue;

      const dish = resolveDish(slot.dish_id);
      const macros = slotMacrosPerEater(slot, dish, resolveIngredient);
      if (macros.unresolved) continue;
      row.meals.push({ label: meal.label, dish, macros });
    }

    if (!row.meals.length) {
      row.status = row.planned ? "not_eaten" : "none";
      return row;
    }

    row.status = "eaten";
    row.macros = row.meals.reduce((acc, entry) => addMacros(acc, entry.macros), { ...EMPTY });
    row.macros.partial = row.meals.some((entry) => entry.macros.partial);
    row.macros.override = row.meals.some((entry) => entry.macros.override);
    return row;
  });
}

function dayRow(row) {
  const el = document.createElement("div");
  el.className = row.status === "eaten" ? "day-macro" : "day-macro is-blank";

  const left = document.createElement("span");
  const right = document.createElement("span");
  right.className = "macro-values";

  if (row.status === "eaten") {
    const values = formatMacros(row.macros);
    const names = row.meals.map((entry) => (entry.dish ? entry.dish.name_he : "")).filter(Boolean);
    left.textContent = `${row.day} · ${names.join(" + ")}`;
    if (row.macros.override) left.append(makeTag("מאקרו ידני"));
    else if (row.macros.partial) left.append(makeTag("חלקי"));
    right.textContent = `${values.kcal} קק"ל · ${values.protein_g} גרם חלבון`;
  } else {
    left.textContent = row.day;
    // "לא נאכל" מכסה גם מה שדולג, גם מה שנאכל בחוץ וגם ארוחה שהאדם
    // הזה לא השתתף בה. שלוש סיבות, אותה משמעות לטור הזה.
    right.textContent = row.status === "not_eaten" ? "לא נאכל" : "לא הוזן";
  }

  el.append(left, right);
  return el;
}

function makeTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function macroRow(field, total, target, daysCounted) {
  const el = document.createElement("div");
  el.className = "macro-row";

  const name = document.createElement("span");
  name.textContent = field.label;

  const right = document.createElement("span");
  const values = document.createElement("span");
  values.className = "macro-values";
  const scaledTarget = target * daysCounted;
  values.textContent = `${Math.round(total)} מתוך ${Math.round(scaledTarget)} ${field.unit}`.trim();

  const verdict = document.createElement("span");
  verdict.className = "macro-verdict";
  verdict.textContent = ` · ${describe(total, scaledTarget)}`;

  right.append(values, verdict);
  el.append(name, right);
  return el;
}

function personCard(profile, rows) {
  const card = document.createElement("section");
  card.className = "person";

  const name = document.createElement("h2");
  name.className = "person-name";
  name.textContent = profile.name_he;
  card.append(name);

  const eaten = rows.filter((row) => row.status === "eaten");
  const daysCounted = eaten.length;

  if (daysCounted === 0) {
    const note = document.createElement("p");
    note.className = "empty";
    note.textContent = "עוד לא הוזנו ארוחות השבוע.";
    card.append(note);
    return card;
  }

  const total = eaten.reduce((acc, row) => addMacros(acc, row.macros), { ...EMPTY });
  const anyPartial = eaten.some((row) => row.macros.partial);

  const summaryTitle = document.createElement("h3");
  summaryTitle.className = "section-title";
  summaryTitle.textContent =
    daysCounted === 1 ? "השבוע · יום אחד עם נתונים" : `השבוע · ${daysCounted} ימים עם נתונים`;
  if (anyPartial) summaryTitle.append(makeTag("חלק מהמנות חלקיות"));
  card.append(summaryTitle);

  for (const field of MACRO_FIELDS) {
    card.append(macroRow(field, total[field.key], profile.targets[field.key], daysCounted));
  }

  const dailyTitle = document.createElement("h3");
  dailyTitle.className = "section-title";
  dailyTitle.textContent = "לפי יום";
  card.append(dailyTitle);

  for (const row of rows) card.append(dayRow(row));

  return card;
}

export function scoreSubtitle() {
  const state = getStore().state;
  const days = new Set();
  for (const profile of state.profiles) {
    for (const row of dailyForProfile(state, profile.id)) {
      if (row.status === "eaten") days.add(row.date);
    }
  }
  if (days.size === 0) return "מחכה לארוחה ראשונה";
  return days.size === 1 ? "יום אחד עם נתונים" : `${days.size} ימים עם נתונים`;
}

export function renderScore(el) {
  const state = getStore().state;

  if (!state.profiles.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "אין פרופילים להצגה.";
    el.append(empty);
    return;
  }

  for (const profile of state.profiles) {
    el.append(personCard(profile, dailyForProfile(state, profile.id)));
  }
}
