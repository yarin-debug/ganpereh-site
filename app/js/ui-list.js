/* רשימת הקניות — סכימת השבוע, מקובצת למדפי סופר.

   כל שורה נפתחת לשני דברים שהקונה צריך ואין לו מהמספר לבדו:
   **מאיפה זה הגיע** (אילו ארוחות מרכיבות את הכמות) ו**מה כבר יש בבית**.
   מה שמכוסה מהמזווה יורד לקבוצת "יש בבית" יחד עם מוצרי הבסיס, ופריטים
   שאי אפשר להמיר מוצגים בראש המדף שלהם עם הכמות המקורית — כדי שמי שקונה
   יראה שצריך להכריע, ולא יסמוך על מספר שהומצא. */

import { getStore, weekDates, DAY_NAMES } from "./store.js";
import { SHELVES, resolveDish, resolveIngredient } from "./catalog.js";
import { planLineItems, sumLineItems, formatQty, UNIT_LABELS } from "./normalize.js";
import { applyPantry } from "./pantry.js";
import { lineKey } from "./plan.js";
import { buildShareText } from "./share.js";
import { openOverlay } from "./ui-overlay.js";

/** מצב הפתיחה של קבוצת "יש בבית" ושל שורות בודדות — שורד בנייה מחדש של המסך. */
let pantryOpen = false;
const openRows = new Set();

/* מצב מתוכנן ולא תקלה (ADR-003): אין המרה, אז ההכרעה עוברת לסופר.
   הניסוח אומר מה לעשות ולא מה חסר לנו — הקונה לא צריך לדעת שהטבלה
   הפנימית לא כיסתה את המצרך, הוא צריך לדעת שהוא מכריע מול המדף. */
const MANUAL_HINTS = {
  no_unit_weight: "להעריך בסופר — אין משקל ליחידה",
  no_density: "להעריך בסופר — אין המרה מנפח למשקל",
  unknown_unit: "להעריך בסופר — יחידה לא מוכרת",
  unknown_ingredient: "להעריך בסופר — מצרך שלא בטקסונומיה",
  bad_qty: "לבדוק את הכמות",
};

function buildList(state) {
  const dates = weekDates(state.plan.week_start);
  const items = planLineItems(dates, state.plan.slots, resolveDish);
  const { lines, manual } = sumLineItems(items, resolveIngredient);
  return { lines: applyPantry(lines, state.pantry, resolveIngredient), manual };
}

function dayNameOf(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

/**
 * מקבץ שורות לפי מדף ומפריד את מה שלא צריך לקנות.
 *
 * גם הכותרת וגם המסך נגזרים מכאן ולא סופרים בנפרד: קודם הכותרת ספרה
 * מוצרי בסיס כ"פריטים לקנות" בזמן שהמסך אמר שאין מה לקנות. מיוצאת
 * כדי שהחלוקה תיבדק בלי DOM.
 */
export function splitList(lines, manualLines) {
  const shelves = new Map(SHELVES.map((shelf) => [shelf.id, { ...shelf, rows: [] }]));
  const pantryRows = [];
  const unknownRows = [];
  let manualToBuy = 0;

  const push = (row) => {
    const ingredient = row.ingredient;

    // מצרך שאינו בטקסונומיה לא נעלם מהרשימה. קודם הוא הושמט בשקט, כלומר
    // מי שקנה לפי הרשימה חזר הביתה בלעדיו בלי שאיש ידע. מוצג בשמו הגולמי.
    if (!ingredient) {
      unknownRows.push(row);
      if (row.manual) manualToBuy += 1;
      return;
    }

    // שתי סיבות שונות לא לקנות — מוצר בסיס שתמיד בבית, וכמות שכבר כוסתה.
    if (ingredient.pantry_staple || row.covered) {
      pantryRows.push(row);
      return;
    }
    const shelf = shelves.get(ingredient.shelf);
    if (!shelf) {
      pantryRows.push(row);
      return;
    }
    shelf.rows.push(row);
    if (row.manual) manualToBuy += 1;
  };

  // הפריטים הידניים נכנסים ראשונים בתוך המדף שלהם כדי שלא ייבלעו.
  for (const item of manualLines) push({ ...item, manual: true });
  for (const line of lines) push({ ...line, manual: false });

  const kept = [...shelves.values()].filter((shelf) => shelf.rows.length);
  return {
    shelves: kept,
    pantryRows,
    unknownRows,
    // "לקנות" הוא בדיוק מה שמוצג לקנייה — לא חישוב מקביל שיכול לסטות.
    toBuy: kept.reduce((total, shelf) => total + shelf.rows.length, 0) + unknownRows.length,
    atHome: pantryRows.length,
    manualToBuy,
  };
}

/* ---------- חלקי השורה ---------- */

/* השורה מציגה תמיד את מה שצריך *לקנות*, חוץ משורה מכוסה — שם המספר
   הוא מה שהשבוע צורך, כי אין מה לקנות והכמות היא המידע היחיד שנשאר. */
function qtyText(row) {
  if (row.manual) return `${Number(row.qty.toFixed(2))} ${UNIT_LABELS[row.unit] || row.unit}`;
  if (row.covered) return formatQty(row.qty, row.unit);
  return formatQty(row.needed ?? row.qty, row.unit);
}

/** הסבר קצר מתחת לשם, כשהמספר לבדו לא מספר את כל הסיפור. */
function noteText(row) {
  if (row.manual) return MANUAL_HINTS[row.reason] || "לבדוק ידנית";
  if (row.covered) return "מכוסה מהמזווה";
  if (row.stock > 0) {
    return `מתוך ${formatQty(row.qty, row.unit)} · ${formatQty(row.stock, row.unit)} בבית`;
  }
  return "";
}

function sourcesElement(row) {
  const list = document.createElement("ul");
  list.className = "sources";

  if (!row.sources || row.sources.length === 0) {
    const li = document.createElement("li");
    li.textContent = "אין פירוט מקורות לשורה הזו.";
    list.append(li);
    return list;
  }

  for (const source of row.sources) {
    const dish = resolveDish(source.dish_id);
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${dish ? dish.name_he : source.dish_id} · ${dayNameOf(source.date)}`;
    const qty = document.createElement("span");
    qty.className = "source-qty";
    qty.textContent = formatQty(source.qty, source.unit);
    li.append(label, qty);
    list.append(li);
  }
  return list;
}

/**
 * עורך המזווה. יושב בתוך השורה הנפתחת ולא במסך נפרד, כי הרגע שבו יודעים
 * מה יש בבית הוא הרגע שמסתכלים על הרשימה — לא רגע אחר.
 */
function pantryEditor(row, store) {
  const wrap = document.createElement("div");
  wrap.className = "pantry-edit";

  const label = document.createElement("label");
  label.className = "control-label";
  label.textContent = "יש בבית";

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "decimal";
  input.min = "0";
  input.step = "any";
  input.className = "pantry-input";
  // בלי placeholder: "0" בשדה ריק נקרא כערך שנקבע, ולא כ"לא מילאנו".
  input.value = row.stock > 0 ? String(Number(row.stock.toFixed(2))) : "";
  input.setAttribute("aria-label", `כמות ${row.ingredient.name_he} שיש בבית`);
  input.dataset.focusKey = `list:${row.ingredient_id}:stock`;
  label.append(input);

  const unit = document.createElement("span");
  unit.className = "pantry-unit";
  unit.textContent = UNIT_LABELS[row.unit] || row.unit;

  const save = document.createElement("button");
  save.type = "button";
  save.className = "chip";
  save.textContent = "עדכן";
  save.dataset.focusKey = `list:${row.ingredient_id}:save`;

  const commit = () => {
    const value = Number(input.value);
    store.update((s) => {
      if (!s.pantry || typeof s.pantry !== "object") s.pantry = {};
      // ריק, אפס או קלט לא תקין = אין במזווה. לא כותבים NaN לאחסון.
      if (!Number.isFinite(value) || value <= 0) delete s.pantry[row.ingredient_id];
      else s.pantry[row.ingredient_id] = { qty: value, unit: row.unit };
    });
  };

  save.addEventListener("click", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
  });

  wrap.append(label, unit, save);

  if (row.stock > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "chip";
    clear.textContent = "אין לי";
    clear.dataset.focusKey = `list:${row.ingredient_id}:clear`;
    clear.addEventListener("click", () => {
      store.update((s) => {
        if (s.pantry) delete s.pantry[row.ingredient_id];
      });
    });
    wrap.append(clear);
  }

  return wrap;
}

/**
 * סימון "בעגלה".
 *
 * מטרת מגע נפרדת ולא חלק מה-summary: כפתור בתוך summary אינו HTML
 * תקין, והקשה עליו הייתה גם מסמנת וגם פותחת את השורה. כאן הסימון
 * והפתיחה הם שני אזורים שאי אפשר לבלבל ביניהם.
 *
 * הסימון נשמר לפי מצרך ולא לפי כמות: שינוי בתוכנית באמצע הקנייה מעדכן
 * את הכמות בשורה, אבל לא מוחק את מה שכבר נלקח.
 */
function checkButton(row, key, store) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "item-check";
  button.dataset.focusKey = `list:${key}:check`;
  button.setAttribute("aria-pressed", row.checked ? "true" : "false");
  const label = row.ingredient ? row.ingredient.name_he : row.ingredient_id;
  button.setAttribute("aria-label", row.checked ? `${label} — בעגלה` : `${label} — לסמן בעגלה`);

  const box = document.createElement("span");
  box.className = "item-box";
  box.setAttribute("aria-hidden", "true");
  button.append(box);

  button.addEventListener("click", () => {
    store.update((s) => {
      if (!s.plan.checked || typeof s.plan.checked !== "object") s.plan.checked = {};
      // כבוי נמחק ולא נשמר כ-false — האובייקט לא תופח עם כל פריט שנראה.
      if (s.plan.checked[key]) delete s.plan.checked[key];
      else s.plan.checked[key] = true;
    });
  });

  return button;
}

function rowElement(row, store) {
  const li = document.createElement("li");
  li.className = "item";
  if (row.manual) li.classList.add("is-manual");
  if (row.covered) li.classList.add("is-covered");
  if (row.checked) li.classList.add("is-checked");

  const key = lineKey(row);
  const details = document.createElement("details");
  details.className = "row";
  details.open = openRows.has(key);
  details.addEventListener("toggle", () => {
    if (details.open) openRows.add(key);
    else openRows.delete(key);
  });

  const summary = document.createElement("summary");
  summary.className = "row-head";
  summary.dataset.focusKey = `list:${key}:head`;

  const name = document.createElement("span");
  name.className = "row-name";
  // מצרך לא מזוהה מוצג במזהה הגולמי שלו — עדיף שם מכוער על שורה חסרה.
  name.textContent = row.ingredient ? row.ingredient.name_he : row.ingredient_id;

  const note = noteText(row);
  if (note) {
    const flag = document.createElement("span");
    flag.className = "item-flag";
    flag.textContent = note;
    name.append(flag);
  }

  const qty = document.createElement("span");
  qty.className = "item-qty";
  qty.textContent = qtyText(row);

  summary.append(name, qty);

  const body = document.createElement("div");
  body.className = "row-body";
  body.append(sourcesElement(row));

  // שורה ידנית לא מקבלת עורך מזווה: אין ממה לנכות בלי המרה מומצאת.
  if (row.manual) {
    const hint = document.createElement("p");
    hint.className = "row-hint";
    hint.textContent = "אי אפשר לנכות מהמזווה לפני שהכמות מוכרעת.";
    body.append(hint);
  } else {
    body.append(pantryEditor(row, store));
  }

  details.append(summary, body);

  // מה שכבר במזווה אינו נקנה, ולכן אין מה לסמן עליו בעגלה.
  if (!row.covered) li.append(checkButton(row, key, store));
  li.append(details);
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

/** מסמן אילו שורות כבר בעגלה, ומוריד אותן לתחתית הקבוצה שלהן. */
function markAndSink(rows, checked) {
  const marked = rows.map((row) => ({ ...row, checked: !!checked[lineKey(row)] }));
  // הרשימה מתקצרת תוך כדי הליכה בסופר במקום להישאר באותו אורך עם
  // שורות מסומנות באמצע.
  return [...marked.filter((row) => !row.checked), ...marked.filter((row) => row.checked)];
}

export function listSubtitle() {
  const state = getStore().state;
  const { lines, manual } = buildList(state);
  if (lines.length === 0 && manual.length === 0) return "אין מה לקנות עדיין";

  const { toBuy, atHome, manualToBuy, shelves, unknownRows } = splitList(lines, manual);
  const homeNote = atHome ? ` · ${atHome} כבר בבית` : "";

  if (toBuy === 0) return `אין מה לקנות${homeNote}`;

  const checked = state.plan.checked || {};
  const inCart = [...shelves.flatMap((shelf) => shelf.rows), ...unknownRows].filter(
    (row) => checked[lineKey(row)],
  ).length;

  if (inCart === toBuy) return "הכל בעגלה";
  if (inCart > 0) return `${inCart} מתוך ${toBuy} בעגלה${homeNote}`;

  const manualNote = manualToBuy ? ` · ${manualToBuy} לבדיקה ידנית` : "";
  return `${toBuy} פריטים${homeNote}${manualNote}`;
}

/* ---------- שיתוף ---------- */

const dateFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function shortDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

/**
 * מסלול היציאה של הטקסט, לפי סדר יורד של נוחות.
 *
 * גיליון השיתוף של המערכת הוא הדרך הישירה לוואטסאפ, ולכן הוא ראשון.
 * ביטול מצדו אינו כשל ואינו מקבל הודעה — המשתמש התחרט, וזו תשובה.
 * דפדפן שולחני בלי שיתוף נופל להעתקה ללוח, וכשגם היא חסומה (הרשאה,
 * הקשר לא מאובטח) הטקסט מוצג כדי שאפשר יהיה לסמן ולהעתיק ביד.
 * מה שאסור כאן הוא כפתור שלא עושה כלום ולא אומר כלום.
 */
async function shareText(text, say) {
  if (navigator.share) {
    try {
      await navigator.share({ title: "רשימת קניות", text });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      /* כל כשל אחר ממשיך ללוח */
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    say("הרשימה הועתקה. אפשר להדביק בהודעה.");
    return;
  } catch {
    /* נופל להצגה ידנית */
  }

  openOverlay({
    label: "רשימת הקניות כטקסט",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "הרשימה כטקסט";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "הדפדפן לא אפשר העתקה אוטומטית. אפשר לסמן ולהעתיק מכאן.";

      const box = document.createElement("textarea");
      box.className = "share-text";
      box.readOnly = true;
      box.rows = 12;
      box.value = text;
      box.dataset.autofocus = "true";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "sheet-close";
      close.textContent = "סגירה";
      close.addEventListener("click", () => handle.close());

      panel.append(heading, sub, box, close);
      // הטקסט מסומן מראש: מי שהגיע עד לכאן כבר איבד שתי דרכים קלות יותר.
      requestAnimationFrame(() => box.select());
    },
  });
}

/**
 * כפתור השיתוף. מוחזר null כשאין מה לשתף — כפתור שמייצר הודעה ריקה
 * גרוע מכפתור שלא קיים.
 */
function buildShare(state, shelves, unknownRows, checked) {
  const unchecked = (rows) => rows.filter((row) => !checked[lineKey(row)]);
  const groups = [
    ...shelves.map((shelf) => ({ title: shelf.name_he, rows: unchecked(shelf.rows) })),
    { title: "לא מזוהה", rows: unchecked(unknownRows) },
  ];

  const inCart = [...shelves.flatMap((shelf) => shelf.rows), ...unknownRows].filter(
    (row) => checked[lineKey(row)],
  ).length;

  const dates = weekDates(state.plan.week_start);
  const text = buildShareText(groups, {
    heading: `רשימת קניות · ${shortDate(dates[0])} – ${shortDate(dates[6])}`,
    inCart,
    hintOf: (row) => MANUAL_HINTS[row.reason],
  });
  if (!text) return null;

  const wrap = document.createElement("div");
  wrap.className = "share";

  const note = document.createElement("p");
  note.className = "field-note";
  note.hidden = true;
  note.setAttribute("role", "status");

  const button = document.createElement("button");
  button.type = "button";
  // .act ולא act-primary: במסך הזה הפעולה שצריך לעשות עכשיו היא לסמן
  // מה שנכנס לעגלה, ושני מילויים במסך אחד הם מה שהמערכת אוסרת.
  button.className = "act act-wide";
  button.dataset.focusKey = "list:share";
  button.textContent = "שיתוף הרשימה";
  button.addEventListener("click", () => {
    note.hidden = true;
    shareText(text, (message) => {
      note.textContent = message;
      note.hidden = false;
    });
  });

  wrap.append(button, note);
  return wrap;
}

export function renderList(el) {
  const store = getStore();
  const { lines, manual } = buildList(store.state);
  const checked = store.state.plan.checked || {};

  if (lines.length === 0 && manual.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "הרשימה תתמלא ברגע שתתכנן ארוחה בשבוע.";
    el.append(empty);
    return;
  }

  const { shelves, pantryRows, unknownRows } = splitList(lines, manual);

  // למעלה ולא למטה: את הרשימה שולחים *לפני* שיוצאים, ולא אחרי שגוללים
  // דרך כל המדפים.
  const share = buildShare(store.state, shelves, unknownRows, checked);
  if (share) el.append(share);

  for (const shelf of shelves) {
    el.append(shelfElement(shelf.name_he, markAndSink(shelf.rows, checked), store));
  }

  if (unknownRows.length) {
    el.append(shelfElement("לא מזוהה", markAndSink(unknownRows, checked), store));
  }

  // יש מה לקנות ברשימה, אבל שום דבר לא נשאר לסופר — אומרים את זה במפורש
  // במקום להשאיר מסך שנראה ריק בטעות.
  if (shelves.length === 0 && unknownRows.length === 0) {
    const done = document.createElement("p");
    done.className = "empty";
    done.textContent = "אין מה לקנות השבוע — הכול כבר בבית.";
    el.append(done);
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
    summary.dataset.focusKey = "list:pantry-group";

    const list = document.createElement("ul");
    list.className = "items";
    for (const row of pantryRows) list.append(rowElement(row, store));

    details.append(summary, list);
    el.append(details);
  }
}
