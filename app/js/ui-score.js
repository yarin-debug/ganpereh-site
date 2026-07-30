/* סקורבורד המאקרו — מתאר, לא שופט.

   טווחים ולא ציונים, בלי אדום ובלי "כישלון". יום בלי נתונים הוא
   "לא הוזן" ולא אפס, והסיכום השבועי משווה רק לימים שבהם באמת נאכל
   משהו — כדי שהמספר לא ישקר כלפי מטה. */

import { getStore, weekDates, slotKey, DAY_NAMES } from "./store.js";
import { resolveDish, resolveIngredient } from "./catalog.js";
import { MEALS } from "./plan.js";
import { activeProfiles } from "./profiles.js";
import { openProfileEditor } from "./ui-profiles.js";
import { buildBackupSection } from "./ui-backup.js";
import { slotComponents } from "./compose.js";
import { slotMacrosPerEater, addMacros, formatMacros } from "./normalize.js";
import { extrasMacrosFor } from "./extras.js";

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
 * פירוט יומי לאדם אחד: מה נאכל בפועל בכל אחד משבעת הימים, על פני כל
 * הארוחות. היום נחשב "נאכל" אם לפחות ארוחה אחת נספרה — ולכן ארוחת
 * בוקר לבד היא יום עם נתונים, גם אם הערב עוד לא הוכרע.
 *
 * מקבלת state כפרמטר ולא ניגשת ל-store, ולכן נבדקת ישירות.
 */
export function dailyForProfile(state, profileId) {
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

      // כל רכיבי המשבצת נספרים. ספירת הראשי בלבד הייתה מציגה את
      // הקלוריות של השניצל ומשמיטה את הצ'יפס שלידו — כלומר להראות
      // מספר שנראה שלם ואינו.
      const dishes = slotComponents(slot)
        .map((id) => resolveDish(id))
        .filter(Boolean);
      const macros = slotMacrosPerEater(slot, dishes, resolveIngredient);
      if (macros.unresolved) continue;
      row.meals.push({ label: meal.label, names: dishes.map((dish) => dish.name_he), macros });
    }

    // נשנושים ומשקאות. עד שהם נכנסו לכאן המסך השווה חצי יום ליעד של
    // יום שלם, וכל מי ששותה קפה עם חלב ראה גירעון שלא היה קיים.
    const extras = extrasMacrosFor(state.plan.extras, date, profileId, resolveIngredient);
    row.extras = extras.items;
    row.extrasUnresolved = extras.unresolved;

    // יום שכולו נשנושים הוא יום עם נתונים. הדרישה לארוחה מתוכננת הייתה
    // מוחקת אותו מהסיכום ומציגה "לא הוזן" למי שדיווח חמישה פריטים.
    if (!row.meals.length && !row.extras.length) {
      row.status = row.planned ? "not_eaten" : "none";
      return row;
    }

    const counted = [...row.meals, ...row.extras];
    row.status = "eaten";
    row.macros = counted.reduce((acc, entry) => addMacros(acc, entry.macros), { ...EMPTY });
    row.macros.partial = counted.some((entry) => entry.macros.partial);
    row.macros.override = row.meals.some((entry) => entry.macros.override);
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
    // ארוחה מורכבת נאמרת ברכיב הראשי ובמספר הנוספים ("שניצל +2"): שורת
    // סיכום יומי צריכה להישאר שורה אחת, והמספר לצדה כבר סופר את הכל.
    const names = row.meals
      .map((entry) =>
        entry.names.length > 1 ? `${entry.names[0]} +${entry.names.length - 1}` : entry.names[0],
      )
      .filter(Boolean);
    // הנשנושים נספרים ולא נמנים בשמם: חמישה שמות בשורה אחת היו הופכים
    // את הטור לבלתי סריק, וזו שורת סיכום ולא פירוט. המפריד הוא נקודה
    // ולא "+", כי "+" כבר אומר "עוד רכיבים באותה ארוחה".
    const extras = row.extras?.length || 0;
    if (extras) names.push(extras === 1 ? "נשנוש אחד" : `${extras} נשנושים`);
    left.textContent = names.length ? `${row.day} · ${names.join(" · ")}` : row.day;
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

/**
 * ההסתייגות שהופכת את ההשוואה לישרה — פעם אחת לכרטיס.
 *
 * הנוסח הקודם התנצל על פער שהיה אמיתי: נספרו ארוחות מתוכננות בלבד,
 * ולכן היעד היומי תמיד נראה כמו גירעון. עכשיו אפשר להזין גם נשנושים
 * ומשקאות, ולכן ההערה אומרת מה באמת נספר ומה עדיין חסר — מה שלא
 * הוזן. זו הסתייגות על *הזנה*, לא על יכולת.
 *
 * פריט שאי אפשר לחשב לו מאקרו נאמר במפורש ולא נבלע: מצרך בלי ערכי
 * תזונה שנעלם בשקט הוא בדיוק הפער שגורם למספר להיראות נמוך מדי.
 */
function scopeNote(rows) {
  const meals = rows.reduce((total, row) => total + (row.meals?.length || 0), 0);
  const extras = rows.reduce((total, row) => total + (row.extras?.length || 0), 0);
  const skipped = rows.reduce((total, row) => total + (row.extrasUnresolved || 0), 0);
  const days = rows.filter((row) => row.status === "eaten").length;

  const parts = [];
  if (meals) parts.push(meals === 1 ? "ארוחה אחת" : `${meals} ארוחות`);
  if (extras) parts.push(extras === 1 ? "תוספת אחת" : `${extras} תוספות`);

  const p = document.createElement("p");
  p.className = "macro-scope";
  let text =
    `מסוכמות ${parts.join(" ו")} מתוך ${days === 1 ? "יום אחד" : `${days} ימים`}. ` +
    "היעד שמולן הוא של ימים שלמים — מה שלא הוזן לא נספר.";
  // הסיבה עצמה נאמרת על השורה במסך היום, שם גם אפשר לתקן אותה. כאן
  // די במספר: הכרטיס הזה מסכם, ולא מקום לתקן בו מצרכים.
  if (skipped) {
    text +=
      skipped === 1
        ? " תוספת אחת לא נספרה — ראה אותה במסך היום."
        : ` ${skipped} תוספות לא נספרו — ראה אותן במסך היום.`;
  }
  p.textContent = text;
  return p;
}

function personCard(profile, rows, onEdited) {
  const card = document.createElement("section");
  card.className = "person";

  const head = document.createElement("div");
  head.className = "person-head";

  const name = document.createElement("h2");
  name.className = "person-name";
  name.textContent = profile.name_he;

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "dish-edit";
  edit.textContent = "עריכה";
  edit.setAttribute("aria-label", `עריכת ${profile.name_he}`);
  edit.addEventListener("click", () =>
    openProfileEditor({ profileId: profile.id, onSaved: onEdited }),
  );

  head.append(name, edit);
  card.append(head);

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
  card.append(summaryTitle, scopeNote(rows));

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
  for (const profile of activeProfiles(state.profiles)) {
    for (const row of dailyForProfile(state, profile.id)) {
      if (row.status === "eaten") days.add(row.date);
    }
  }
  if (days.size === 0) return "מחכה לארוחה ראשונה";
  return days.size === 1 ? "יום אחד עם נתונים" : `${days.size} ימים עם נתונים`;
}

/** מי שיצא ממשק הבית, עם מסלול חזרה. */
function archivedGroup(profiles, store, onRestored) {
  const details = document.createElement("details");
  details.className = "pantry-group";

  const summary = document.createElement("summary");
  summary.textContent = `לא במשק הבית (${profiles.length})`;
  details.append(summary);

  for (const profile of profiles) {
    const row = document.createElement("div");
    row.className = "dish-row";

    const label = document.createElement("span");
    label.className = "archived-name";
    label.textContent = profile.name_he;

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "dish-edit";
    restore.textContent = "החזרה";
    restore.setAttribute("aria-label", `החזרת ${profile.name_he}`);
    restore.addEventListener("click", () => {
      store.update((s) => {
        const target = s.profiles.find((p) => p.id === profile.id);
        if (target) target.archived = false;
      });
      onRestored();
    });

    row.append(label, restore);
    details.append(row);
  }

  return details;
}

export function renderScore(el) {
  const store = getStore();
  const state = store.state;
  const active = activeProfiles(state.profiles);

  // עריכת פרופיל היא שינוי מצב ולכן ה-store מרנדר מחדש לבד. השחזור
  // מהארכיון עובר דרך אותו מסלול, ולכן די בקריאה אחת.
  const redraw = () => {};

  if (!active.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "אין אף אחד במשק הבית. הוסף אדם כדי לראות מאקרו.";
    el.append(empty);
  }

  for (const profile of active) {
    el.append(personCard(profile, dailyForProfile(state, profile.id), redraw));
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "act act-wide act-primary";
  add.textContent = "הוספת אדם";
  add.addEventListener("click", () => openProfileEditor({ profileId: null, onSaved: redraw }));
  el.append(add);

  const archived = (state.profiles || []).filter((p) => p.archived);
  if (archived.length) el.append(archivedGroup(archived, store, redraw));

  el.append(buildBackupSection());
}
