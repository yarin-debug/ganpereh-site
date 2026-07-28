/* רשימת הקניות — סכימת השבוע, מקובצת למדפי סופר.

   מוצרי מזווה יורדים לקבוצה מכווצת בתחתית במקום להעמיס את הרשימה
   הראשית, ופריטים שאי אפשר להמיר מוצגים בראש המדף שלהם עם הכמות
   המקורית — כדי שמי שקונה יראה שצריך להכריע, ולא יסמוך על מספר שהומצא. */

import { getStore, weekDates } from "./store.js";
import { SHELVES, getDish, getIngredient } from "./data.js";
import { planLineItems, sumLineItems, formatQty, UNIT_LABELS } from "./normalize.js";

/** מצב הפתיחה של קבוצת "יש בבית" — שורד את בניית המסך מחדש. */
let pantryOpen = false;

const MANUAL_HINTS = {
  no_unit_weight: "אין משקל ליחידה — להשלים בסופר",
  no_density: "אין המרת נפח למשקל — להשלים בסופר",
  unknown_unit: "יחידה לא מוכרת",
  unknown_ingredient: "מצרך לא מוכר",
  bad_qty: "כמות לא תקינה",
};

function buildList(state) {
  const dates = weekDates(state.plan.week_start);
  const items = planLineItems(dates, state.plan.slots, getDish);
  return sumLineItems(items, getIngredient);
}

/** מקבץ שורות לפי מדף, בסדר המדפים הקבוע, ומפריד מוצרי מזווה. */
function groupByShelf(lines, manualLines) {
  const shelves = new Map(SHELVES.map((shelf) => [shelf.id, { ...shelf, rows: [] }]));
  const pantryRows = [];

  const push = (row) => {
    const ingredient = row.ingredient;
    if (!ingredient) return;
    if (ingredient.pantry_staple) {
      pantryRows.push(row);
      return;
    }
    const shelf = shelves.get(ingredient.shelf);
    if (shelf) shelf.rows.push(row);
    else pantryRows.push(row);
  };

  // הפריטים הידניים נכנסים ראשונים בתוך המדף שלהם כדי שלא ייבלעו.
  for (const item of manualLines) push({ ...item, manual: true });
  for (const line of lines) push({ ...line, manual: false });

  return {
    shelves: [...shelves.values()].filter((shelf) => shelf.rows.length),
    pantryRows,
  };
}

function rowElement(row) {
  const li = document.createElement("li");
  li.className = row.manual ? "item is-manual" : "item";

  const name = document.createElement("span");
  name.textContent = row.ingredient.name_he;

  if (row.manual) {
    const flag = document.createElement("span");
    flag.className = "item-flag";
    flag.textContent = MANUAL_HINTS[row.reason] || "לבדוק ידנית";
    name.append(flag);
  }

  const qty = document.createElement("span");
  qty.className = "item-qty";
  qty.textContent = row.manual
    ? `${Number(row.qty.toFixed(2))} ${UNIT_LABELS[row.unit] || row.unit}`
    : formatQty(row.qty, row.unit);

  li.append(name, qty);
  return li;
}

function shelfElement(title, rows) {
  const section = document.createElement("section");
  section.className = "shelf";

  const heading = document.createElement("h2");
  heading.className = "shelf-title";
  heading.textContent = title;

  const list = document.createElement("ul");
  list.className = "items";
  for (const row of rows) list.append(rowElement(row));

  section.append(heading, list);
  return section;
}

export function listSubtitle() {
  const { lines, manual } = buildList(getStore().state);
  const total = lines.length + manual.length;
  if (total === 0) return "אין מה לקנות עדיין";
  const manualNote = manual.length ? ` · ${manual.length} לבדיקה ידנית` : "";
  return `${total} פריטים${manualNote}`;
}

export function renderList(el) {
  const { lines, manual } = buildList(getStore().state);

  if (lines.length === 0 && manual.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "הרשימה תתמלא ברגע שתתכנן ארוחה בשבוע.";
    el.append(empty);
    return;
  }

  const { shelves, pantryRows } = groupByShelf(lines, manual);

  for (const shelf of shelves) {
    el.append(shelfElement(shelf.name_he, shelf.rows));
  }

  if (pantryRows.length) {
    const details = document.createElement("details");
    details.className = "pantry-group";
    // המסך נבנה מחדש בכל שינוי מצב, ולכן מצב הפתיחה נשמר כאן ולא ב-DOM.
    details.open = pantryOpen;
    details.addEventListener("toggle", () => {
      pantryOpen = details.open;
    });

    const summary = document.createElement("summary");
    summary.textContent = `יש בבית (${pantryRows.length})`;

    const list = document.createElement("ul");
    list.className = "items";
    for (const row of pantryRows) list.append(rowElement(row));

    details.append(summary, list);
    el.append(details);
  }
}
