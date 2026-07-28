/* מסך המזווה — מה שכבר בבית.

   המסך קיים בשביל שורה אחת ברשימת הקניות: "בצל — 600 גרם (יש 300
   בבית)". כל השאר הוא תחזוקה של המספר הזה.

   המזווה מתעדכן ידנית בלבד. הנימוק המלא נמצא בראש pantry.js. */

import { getStore } from "./store.js";
import { SHELVES, resolveIngredient, shelfName } from "./catalog.js";
import { pantryRows } from "./pantry.js";
import { formatQty, UNIT_LABELS } from "./normalize.js";
import { openIngredientPicker } from "./ui-ingredient-editor.js";
import { openOverlay, fieldLabel, numberInput, chipGroup, errorLine } from "./ui-overlay.js";

const UNIT_OPTIONS = [
  { id: "g", label: "גרם" },
  { id: "ml", label: 'מ"ל' },
  { id: "unit", label: "יחידות" },
];

/**
 * טופס כמות לפריט מזווה יחיד.
 * @param {string} ingredientId
 * @param {() => void} onDone
 */
function openPantryEntry(ingredientId, onDone) {
  const store = getStore();
  const ingredient = resolveIngredient(ingredientId);
  if (!ingredient) return;

  const current = store.state.pantry[ingredientId];
  const draft = {
    qty: current ? current.qty : "",
    unit: current ? current.unit : ingredient.base_unit,
  };

  openOverlay({
    label: `כמות · ${ingredient.name_he}`,
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = ingredient.name_he;

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "כמה יש בבית עכשיו?";

      const qty = numberInput({ value: draft.qty, min: 0 });
      qty.dataset.autofocus = "true";
      qty.addEventListener("input", () => {
        draft.qty = qty.value;
      });

      const unit = chipGroup({
        options: UNIT_OPTIONS,
        value: draft.unit,
        label: "יחידה",
        onChange: (id) => {
          draft.unit = id;
        },
      });

      const error = errorLine("");
      error.hidden = true;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "act act-wide act-primary";
      save.textContent = "שמירה";
      save.addEventListener("click", () => {
        const value = Number(draft.qty);
        if (draft.qty === "" || !Number.isFinite(value) || value < 0) {
          error.textContent = "צריך כמות — מספר אפס או גדול ממנו.";
          error.hidden = false;
          qty.focus();
          return;
        }
        store.update((s) => {
          // אפס פירושו "אין לי", ולכן הוא מחיקה ולא שורה עם אפס.
          if (value === 0) delete s.pantry[ingredientId];
          else s.pantry[ingredientId] = { qty: value, unit: draft.unit };
        });
        handle.close();
        onDone();
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(heading, sub, fieldLabel("כמות", qty), unit, error, save, cancel);

      if (current) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "sheet-danger";
        remove.textContent = "הסרה מהמזווה";
        remove.addEventListener("click", () => {
          store.update((s) => {
            delete s.pantry[ingredientId];
          });
          handle.close();
          onDone();
        });
        panel.append(remove);
      }
    },
  });
}

function rowElement(row, onDone) {
  const li = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "item";

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = row.ingredient.name_he;

  if (!row.convertible) {
    const flag = document.createElement("span");
    flag.className = "item-flag";
    flag.textContent = "יקוזז רק מול מתכון שנוקב באותה יחידה";
    name.append(flag);
  }

  const qty = document.createElement("span");
  qty.className = "item-qty";
  qty.textContent = row.convertible
    ? formatQty(row.qty, row.unit)
    : `${Number(row.qty.toFixed(2))} ${UNIT_LABELS[row.unit] || row.unit}`;

  button.append(name, qty);
  button.addEventListener("click", () => openPantryEntry(row.ingredient.id, onDone));

  li.append(button);
  return li;
}

export function pantrySubtitle() {
  const state = getStore().state;
  const count = pantryRows(state.pantry, resolveIngredient).length;
  if (count === 0) return "ריק";
  return count === 1 ? "פריט אחד בבית" : `${count} פריטים בבית`;
}

export function renderPantry(el) {
  const state = getStore().state;
  const rows = pantryRows(state.pantry, resolveIngredient);

  const rerender = () => {
    el.replaceChildren();
    renderPantry(el);
  };

  const add = document.createElement("button");
  add.type = "button";
  add.className = "act act-wide act-primary";
  add.textContent = "הוספת מצרך למזווה";
  add.addEventListener("click", () =>
    openIngredientPicker({
      exclude: rows.map((row) => row.ingredient.id),
      onSelect: (id) => openPantryEntry(id, rerender),
    }),
  );

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "מה שתוסיף כאן יירד מרשימת הקניות. אם יש בבית 300 גרם בצל והשבוע דורש 900, הרשימה תבקש 600.";
    el.append(empty, add);
    return;
  }

  // אותו סדר מדפים כמו ברשימת הקניות — אותה דרך חשיבה על המטבח.
  const byShelf = new Map(SHELVES.map((shelf) => [shelf.id, []]));
  const loose = [];
  for (const row of rows) {
    const bucket = byShelf.get(row.ingredient.shelf);
    if (bucket) bucket.push(row);
    else loose.push(row);
  }

  for (const shelf of SHELVES) {
    const bucket = byShelf.get(shelf.id);
    if (!bucket.length) continue;

    const section = document.createElement("section");
    section.className = "shelf";

    const heading = document.createElement("h2");
    heading.className = "shelf-title";
    heading.textContent = shelfName(shelf.id);

    const list = document.createElement("ul");
    list.className = "items";
    for (const row of bucket) list.append(rowElement(row, rerender));

    section.append(heading, list);
    el.append(section);
  }

  if (loose.length) {
    const list = document.createElement("ul");
    list.className = "items";
    for (const row of loose) list.append(rowElement(row, rerender));
    el.append(list);
  }

  el.append(add);
}
