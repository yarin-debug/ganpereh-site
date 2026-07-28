/* רשימת הקניות — סכימת השבוע, מקובצת למדפי סופר, וניתנת לסימון.

   מוצרי מזווה יורדים לקבוצה מכווצת בתחתית במקום להעמיס את הרשימה
   הראשית, ופריטים שאי אפשר להמיר מוצגים בראש המדף שלהם עם הכמות
   המקורית — כדי שמי שקונה יראה שצריך להכריע, ולא יסמוך על מספר שהומצא.

   הסימון נשמר לפי מצרך ולא לפי כמות: שינוי בתוכנית באמצע הקנייה מעדכן
   את הכמות בשורה, אבל לא מוחק את מה שכבר בעגלה. */

import { getStore, weekDates } from "./store.js";
import { SHELVES, resolveDish, resolveIngredient } from "./catalog.js";
import { planLineItems, sumLineItems, formatQty, UNIT_LABELS } from "./normalize.js";
import { lineKey } from "./plan.js";
import { applyPantry } from "./pantry.js";

/* מצב הפתיחה של הקבוצות המכווצות — שורד את בניית המסך מחדש. */
let staplesOpen = false;
let coveredOpen = false;

/** מסמן אילו שורות כבר בעגלה. אותו מפתח שהסימון נשמר תחתיו. */
function markChecked(rows, checked) {
  return rows.map((row) => ({ ...row, checked: !!checked[lineKey(row)] }));
}

const MANUAL_HINTS = {
  no_unit_weight: "אין משקל ליחידה — להשלים בסופר",
  no_density: "אין המרת נפח למשקל — להשלים בסופר",
  unknown_unit: "יחידה לא מוכרת",
  unknown_ingredient: "מצרך לא מוכר",
  bad_qty: "כמות לא תקינה",
};

/** מה שהשבוע דורש, פחות מה שכבר בבית. */
function buildList(state) {
  const dates = weekDates(state.plan.week_start);
  const items = planLineItems(dates, state.plan.slots, resolveDish);
  return applyPantry(sumLineItems(items, resolveIngredient), state.pantry);
}

/** מקבץ שורות לפי מדף, בסדר המדפים הקבוע, ומפריד מוצרי בסיס. */
function groupByShelf(lines, manualLines, checked) {
  const shelves = new Map(SHELVES.map((shelf) => [shelf.id, { ...shelf, rows: [] }]));
  const stapleRows = [];

  const push = (row) => {
    const ingredient = row.ingredient;
    if (!ingredient) return;
    if (ingredient.pantry_staple) {
      stapleRows.push(row);
      return;
    }
    const shelf = shelves.get(ingredient.shelf);
    if (shelf) shelf.rows.push(row);
    else stapleRows.push(row);
  };

  // הפריטים הידניים נכנסים ראשונים בתוך המדף שלהם כדי שלא ייבלעו.
  for (const item of manualLines) push({ ...item, manual: true });
  for (const line of lines) push({ ...line, manual: false });

  // מה שכבר בעגלה יורד לתחתית המדף. הרשימה מתקצרת תוך כדי הליכה
  // בסופר במקום להישאר באותו אורך עם שורות מחוקות באמצע.
  const sink = (rows) => {
    const marked = markChecked(rows, checked);
    return [...marked.filter((row) => !row.checked), ...marked.filter((row) => row.checked)];
  };

  return {
    shelves: [...shelves.values()]
      .filter((shelf) => shelf.rows.length)
      .map((shelf) => ({
        ...shelf,
        rows: sink(shelf.rows),
      })),
    stapleRows: sink(stapleRows),
  };
}

function rowElement(row, store) {
  const key = lineKey(row);

  const li = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = ["item", row.manual ? "is-manual" : "", row.checked ? "is-checked" : ""]
    .filter(Boolean)
    .join(" ");
  button.setAttribute("aria-pressed", row.checked ? "true" : "false");

  const box = document.createElement("span");
  box.className = "item-box";
  box.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = row.ingredient.name_he;

  if (row.manual) {
    const flag = document.createElement("span");
    flag.className = "item-flag";
    flag.textContent = MANUAL_HINTS[row.reason] || "לבדוק ידנית";
    name.append(flag);
  }

  const show = (value) =>
    row.manual
      ? `${Number(value.toFixed(2))} ${UNIT_LABELS[row.unit] || row.unit}`
      : formatQty(value, row.unit);

  // הכמות המוצגת היא מה שצריך *לקנות*. בלי לומר מה קוזז, שורה שירדה
  // מ-900 ל-600 גרם נראית כמו טעות בחישוב.
  if (row.onHand > 0) {
    const flag = document.createElement("span");
    flag.className = "item-flag";
    flag.textContent = `השבוע דורש ${show(row.required)}, יש בבית ${show(row.onHand)}`;
    name.append(flag);
  }

  const qty = document.createElement("span");
  qty.className = "item-qty";
  qty.textContent = show(row.qty);

  button.append(box, name, qty);
  button.addEventListener("click", () => {
    store.update((s) => {
      // כבוי נמחק ולא נשמר כ-false — האובייקט לא תופח עם כל פריט שנראה.
      if (s.plan.checked[key]) delete s.plan.checked[key];
      else s.plan.checked[key] = true;
    });
  });

  li.append(button);
  return li;
}

function shelfElement(title, rows, store) {
  const section = document.createElement("section");
  section.className = "shelf";

  const heading = document.createElement("h2");
  heading.className = "shelf-title";
  heading.textContent = title;

  const list = document.createElement("ul");
  list.className = "items";
  for (const row of rows) list.append(rowElement(row, store));

  section.append(heading, list);
  return section;
}

export function listSubtitle() {
  const state = getStore().state;
  const { lines, manual, covered } = buildList(state);
  const total = lines.length + manual.length;

  if (total === 0) {
    if (covered.length) return "הכל כבר בבית";
    return "אין מה לקנות עדיין";
  }

  const checked = state.plan.checked || {};
  const done = [
    ...lines.map((l) => ({ ...l, manual: false })),
    ...manual.map((m) => ({ ...m, manual: true })),
  ].filter((row) => checked[lineKey(row)]).length;

  if (done === 0) {
    const note = covered.length ? ` · ${covered.length} כבר בבית` : "";
    return `${total} פריטים${note}`;
  }
  if (done === total) return "הכל בעגלה";
  return `${done} מתוך ${total} בעגלה`;
}

/** קבוצה מכווצת בתחתית הרשימה. */
function collapsedGroup(title, rows, store, open, onToggle) {
  const details = document.createElement("details");
  details.className = "pantry-group";
  details.open = open;
  details.addEventListener("toggle", () => onToggle(details.open));

  const summary = document.createElement("summary");
  summary.textContent = `${title} (${rows.length})`;

  const list = document.createElement("ul");
  list.className = "items";
  for (const row of rows) list.append(rowElement(row, store));

  details.append(summary, list);
  return details;
}

export function renderList(el) {
  const store = getStore();
  const state = store.state;
  const { lines, manual, covered } = buildList(state);
  const checked = state.plan.checked || {};

  if (lines.length === 0 && manual.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = covered.length
      ? "כל מה שהשבוע דורש כבר נמצא במזווה."
      : "הרשימה תתמלא ברגע שתתכנן ארוחה בשבוע.";
    el.append(empty);
    if (covered.length) {
      el.append(
        collapsedGroup("כבר במזווה", markChecked(covered, checked), store, coveredOpen, (open) => {
          coveredOpen = open;
        }),
      );
    }
    return;
  }

  const { shelves, stapleRows } = groupByShelf(lines, manual, checked);

  for (const shelf of shelves) {
    el.append(shelfElement(shelf.name_he, shelf.rows, store));
  }

  // "מוצרי בסיס" הם דגל על המצרך (מלח, שמן) ולא מלאי אמיתי; "כבר
  // במזווה" הוא מה שהמזווה באמת מכסה. שתי קבוצות נפרדות, כי הן
  // עונות על שתי שאלות שונות.
  if (stapleRows.length) {
    el.append(
      collapsedGroup("מוצרי בסיס", stapleRows, store, staplesOpen, (open) => {
        staplesOpen = open;
      }),
    );
  }

  if (covered.length) {
    el.append(
      collapsedGroup("כבר במזווה", markChecked(covered, checked), store, coveredOpen, (open) => {
        coveredOpen = open;
      }),
    );
  }
}
