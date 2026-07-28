/* גיליון בחירת המנה.

   מחליף את ה-select. שיבוץ ארוחה הוא הפעולה שחוזרת הכי הרבה פעמים
   באפליקציה, ורשימה נפתחת של המערכת הופכת אותה למילוי טופס: אין מקום
   לזמן ההכנה, אין מקום למאמץ, ואי אפשר לראות שתי אפשרויות זו לצד זו.

   הגיליון הוא הרכיב היחיד שמצייר מעל המסך, ולכן הוא גם היחיד שמנהל
   מיקוד: המיקוד נכנס פנימה בפתיחה וחוזר לכפתור שפתח אותו בסגירה. */

import { DISHES, getDish } from "./data.js";

const EFFORT_LABELS = { low: "קל", medium: "בינוני", high: "מורכב" };

let openSheet = null;

/** מתאר מנה בשורה אחת: זמן ומאמץ, בלי לחזור על השם. */
function dishMeta(dish) {
  const effort = EFFORT_LABELS[dish.effort];
  return effort ? `${dish.time_min} דק' · ${effort}` : `${dish.time_min} דק'`;
}

function optionButton({ label, meta, selected, onPick, extraClass }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = selected ? "dish-card is-on" : "dish-card";
  button.setAttribute("aria-pressed", selected ? "true" : "false");

  const name = document.createElement("span");
  name.className = extraClass || "dish-card-name";
  name.textContent = label;

  if (meta) {
    const metaEl = document.createElement("span");
    metaEl.className = "dish-card-meta";
    metaEl.textContent = meta;
    name.append(metaEl);
  }

  button.append(name);
  button.addEventListener("click", onPick);
  return button;
}

/**
 * פותח את גיליון בחירת המנה.
 * @param {object} options
 * @param {string} options.title      כותרת — היום שאליו משבצים
 * @param {string|null} options.current  מזהה המנה המשובצת כרגע
 * @param {(dishId:string|null)=>void} options.onSelect
 */
export function openDishSheet({ title, current, onSelect }) {
  // פתיחה כפולה (הקשה כפולה מהירה) הייתה משאירה שכבה יתומה על המסך.
  if (openSheet) openSheet.close();

  const opener = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "sheet";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", `בחירת ארוחה · ${title}`);

  const panel = document.createElement("div");
  panel.className = "sheet-panel";

  const heading = document.createElement("h2");
  heading.className = "sheet-title";
  heading.textContent = "מה אוכלים?";

  const sub = document.createElement("p");
  sub.className = "sheet-sub";
  sub.textContent = title;

  const options = document.createElement("div");
  options.className = "sheet-options";

  for (const dish of DISHES) {
    options.append(
      optionButton({
        label: dish.name_he,
        meta: dishMeta(dish),
        selected: dish.id === current,
        onPick: () => {
          onSelect(dish.id);
          close();
        },
      }),
    );
  }

  // ניקוי המשבצת חי כאן ולא ככפתור נפרד במסך: זו בחירה מאותה משפחה.
  if (current) {
    options.append(
      optionButton({
        label: "בלי ארוחה מתוכננת",
        meta: null,
        selected: false,
        extraClass: "dish-card-clear",
        onPick: () => {
          onSelect(null);
          close();
        },
      }),
    );
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sheet-close";
  closeBtn.textContent = "סגירה";
  closeBtn.addEventListener("click", () => close());

  panel.append(heading, sub, options, closeBtn);
  overlay.append(panel);

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function close() {
    if (openSheet !== handle) return;
    openSheet = null;
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    // המסך מתרנדר מחדש אחרי בחירה, ולכן הכפתור המקורי כבר לא בהכרח
    // ב-DOM. בודקים לפני שמחזירים מיקוד לאלמנט יתום.
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  }

  const handle = { close };
  openSheet = handle;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", onKeydown);

  document.body.append(overlay);
  const first = options.querySelector("button");
  if (first) first.focus();

  return handle;
}

/** שם המנה לתצוגה, או null כשאין משבצת. */
export function dishLabel(dishId) {
  const dish = getDish(dishId);
  return dish ? dish.name_he : null;
}

export { dishMeta };
