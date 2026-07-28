/* סקורבורד המאקרו — מתאר, לא שופט.

   טווחים ולא ציונים, בלי אדום ובלי "כישלון". יום בלי נתונים הוא
   "לא הוזן" ולא אפס, והסיכום השבועי משווה רק לימים שבהם באמת נאכל
   משהו — כדי שהמספר לא ישקר כלפי מטה. */

import { getStore, weekDates, slotKey, DAY_NAMES } from "./store.js";
import { getDish, getIngredient } from "./data.js";
import { slotMacrosPerEater, addMacros, formatMacros } from "./normalize.js";

const MACRO_FIELDS = [
  { key: "kcal", label: "קלוריות", unit: "" },
  { key: "protein_g", label: "חלבון", unit: "גרם" },
  { key: "fat_g", label: "שומן", unit: "גרם" },
  { key: "carbs_g", label: "פחמימות", unit: "גרם" },
];

const EMPTY = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

const numberFormat = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

function fmt(n) {
  return numberFormat.format(Math.round(n));
}

/**
 * פירוט יומי לאדם אחד: מה נאכל בפועל בכל אחד משבעת הימים.
 * מקבלת state כפרמטר ולא ניגשת ל-store, ולכן נבדקת ישירות.
 */
export function dailyForProfile(state, profileId) {
  return weekDates(state.plan.week_start).map((date, index) => {
    const slot = state.plan.slots[slotKey(date)];
    const row = { day: DAY_NAMES[index], date, status: "none", macros: null, dish: null };

    if (!slot || !slot.dish_id) return row;
    // מה שנאכל בפועל — לא מה שתוכנן. אותו סינון שרשימת הקניות מחילה.
    if (slot.status === "skipped" || slot.status === "ate_out") {
      row.status = "not_eaten";
      return row;
    }
    if (!Array.isArray(slot.eaters) || !slot.eaters.includes(profileId)) {
      row.status = "excluded";
      return row;
    }

    const dish = getDish(slot.dish_id);
    const macros = slotMacrosPerEater(slot, dish, getIngredient);
    row.status = macros.unresolved ? "unresolved" : "eaten";
    row.macros = macros;
    row.dish = dish;
    return row;
  });
}

function dayRow(row) {
  const el = document.createElement("div");
  el.className = row.status === "eaten" ? "day-macro" : "day-macro is-blank";

  const left = document.createElement("span");
  left.className = "day-macro-name";
  const right = document.createElement("span");
  right.className = "day-macro-value";

  if (row.status === "eaten") {
    const values = formatMacros(row.macros);
    left.textContent = `${row.day} · ${row.dish ? row.dish.name_he : ""}`;
    if (row.macros.override) left.append(makeTag("מאקרו ידני"));
    else if (row.macros.partial) left.append(makeTag("חלקי"));
    right.textContent = `${values.kcal} קק"ל · ${values.protein_g} גרם חלבון`;
  } else {
    left.textContent = row.day;
    const labels = {
      excluded: "לא משתתף",
      not_eaten: "לא נאכל",
      unresolved: "לא ניתן לחישוב",
      none: "לא הוזן",
    };
    right.textContent = labels[row.status] || labels.none;
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

/**
 * שורת מאקרו אחת.
 *
 * קודם הופיע כאן פסק ("מתחת לטווח היעד") מול היעד היומי המלא — בעוד
 * שהתוכנית מכסה ארוחת ערב בלבד. התוצאה הייתה שכל ארבעת המאקרו דיווחו
 * חוסר בכל שבוע, גם שבוע מתוכנן במלואו: המסך שאמור לתאר הפך למכונת
 * גירעון קבוע — בדיוק כשל הנטישה ש-ADR-004 נכתב כדי למנוע.
 *
 * במקום פסק, נאמרת עובדה: כמה מהיעד כיסו ארוחות הערב. ההסתייגות
 * ("היעד הוא ליום שלם") נאמרת פעם אחת לכרטיס, ב-scopeNote.
 */
function macroRow(field, total, target, daysCounted) {
  const el = document.createElement("div");
  el.className = "macro-row";

  const head = document.createElement("div");
  head.className = "macro-head";

  const name = document.createElement("span");
  name.className = "macro-name";
  name.textContent = field.label;

  const scaledTarget = target * daysCounted;

  // המנה היחסית נושאת את המשקל הוויזואלי, לא המספר הגולמי: היא התשובה
  // לשאלה ששואלים את המסך הזה.
  const share = document.createElement("span");
  share.className = "macro-share";
  share.textContent = scaledTarget ? `${Math.round((total / scaledTarget) * 100)}%` : "—";

  head.append(name, share);

  const values = document.createElement("div");
  values.className = "macro-values";
  values.textContent = scaledTarget
    ? `${fmt(total)} מתוך ${fmt(scaledTarget)} ${field.unit}`.trim()
    : `${fmt(total)} ${field.unit} · אין יעד מוגדר`.trim();

  el.append(head, values);
  return el;
}

/** ההסתייגות שהופכת את האחוזים לישרים — פעם אחת לכרטיס. */
function scopeNote(daysCounted) {
  const p = document.createElement("p");
  p.className = "macro-scope";
  const days = daysCounted === 1 ? "יום אחד" : `${daysCounted} ימים`;
  p.textContent = `מסוכמות ארוחות הערב של ${days}. היעד שמולן הוא של ימים שלמים, כולל שאר הארוחות.`;
  return p;
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
  card.append(summaryTitle, scopeNote(daysCounted));

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
