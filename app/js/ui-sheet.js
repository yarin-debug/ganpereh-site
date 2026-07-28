/* בורר המנה — וגם הכניסה לספריית המנות.

   הבורר הוא המקום היחיד שבו מסתכלים על כל המנות, ולכן זה גם המקום
   שבו עורכים אותן: כל שורה נושאת "עריכה", ובתחתית יש "מנה חדשה".
   ספרייה נפרדת במסך משלה הייתה מכריחה לזכור איפה היא — כאן היא
   נמצאת בדיוק שם שבו כבר עומדים כשחסרה מנה. */

import { getStore } from "./store.js";
import { listDishes, resolveDish, effortLabel } from "./catalog.js";
import { openOverlay } from "./ui-overlay.js";
import { openDishEditor } from "./ui-dish-editor.js";

/** מתאר מנה בשורה אחת: זמן ומאמץ, בלי לחזור על השם. */
export function dishMeta(dish) {
  const effort = effortLabel(dish.effort);
  return effort ? `${dish.time_min} דק' · ${effort}` : `${dish.time_min} דק'`;
}

function dishRow({ dish, selected, onPick, onEdited }) {
  const row = document.createElement("div");
  row.className = "dish-row";

  const card = document.createElement("button");
  card.type = "button";
  card.className = selected ? "dish-card is-on" : "dish-card";
  card.setAttribute("aria-pressed", selected ? "true" : "false");

  const name = document.createElement("span");
  name.className = "dish-card-name";
  name.textContent = dish.name_he;

  const meta = document.createElement("span");
  meta.className = "dish-card-meta";
  meta.textContent = dishMeta(dish);
  name.append(meta);

  card.append(name);
  card.addEventListener("click", onPick);

  // כפתור נפרד ולא מקונן: כפתור בתוך כפתור אינו HTML תקין, והקשה
  // עליו הייתה גם בוחרת את המנה וגם פותחת את העורך.
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "dish-edit";
  edit.textContent = "עריכה";
  edit.setAttribute("aria-label", `עריכת ${dish.name_he}`);
  edit.addEventListener("click", () => openDishEditor({ dishId: dish.id, onSaved: onEdited }));

  row.append(card, edit);
  return row;
}

function plainRow({ label, className, onPick }) {
  const row = document.createElement("div");
  row.className = "dish-row";

  const card = document.createElement("button");
  card.type = "button";
  card.className = "dish-card";

  const name = document.createElement("span");
  name.className = className;
  name.textContent = label;

  card.append(name);
  card.addEventListener("click", onPick);
  row.append(card);
  return row;
}

/** מנות שהוסרו מהבורר, עם מסלול חזרה. */
function archiveGroup(dishes, onRestored) {
  const store = getStore();

  const details = document.createElement("details");
  details.className = "pantry-group";

  const summary = document.createElement("summary");
  summary.textContent = `בארכיון (${dishes.length})`;
  details.append(summary);

  for (const dish of dishes) {
    const row = document.createElement("div");
    row.className = "dish-row";

    const label = document.createElement("span");
    label.className = "archived-name";
    label.textContent = dish.name_he;

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "dish-edit";
    restore.textContent = "שחזור";
    restore.setAttribute("aria-label", `שחזור ${dish.name_he}`);
    restore.addEventListener("click", () => {
      store.update((s) => {
        if (s.dishes[dish.id]) s.dishes[dish.id].archived = false;
      });
      onRestored();
    });

    row.append(label, restore);
    details.append(row);
  }

  return details;
}

/**
 * פותח את בורר המנה.
 * @param {object} options
 * @param {string} options.title           היום שאליו משבצים
 * @param {string|null} options.current    מזהה המנה המשובצת כרגע
 * @param {(dishId:string|null)=>void} options.onSelect
 */
export function openDishSheet({ title, current, onSelect }) {
  return openOverlay({
    label: `בחירת ארוחה · ${title}`,
    build: (panel, handle) => {
      const draw = () => {
        panel.replaceChildren();

        const heading = document.createElement("h2");
        heading.className = "sheet-title";
        heading.textContent = "מה אוכלים?";

        const sub = document.createElement("p");
        sub.className = "sheet-sub";
        sub.textContent = title;

        const options = document.createElement("div");
        options.className = "sheet-options";

        for (const dish of listDishes()) {
          options.append(
            dishRow({
              dish,
              selected: dish.id === current,
              onPick: () => {
                onSelect(dish.id);
                handle.close();
              },
              // מנה שנערכה עשויה לשנות שם או לרדת לארכיון, ולכן
              // הרשימה נבנית מחדש במקום להישאר על נתונים ישנים.
              onEdited: draw,
            }),
          );
        }

        // ניקוי המשבצת חי כאן ולא ככפתור נפרד במסך: זו בחירה מאותה משפחה.
        if (current) {
          options.append(
            plainRow({
              label: "בלי ארוחה מתוכננת",
              className: "dish-card-clear",
              onPick: () => {
                onSelect(null);
                handle.close();
              },
            }),
          );
        }

        const create = document.createElement("button");
        create.type = "button";
        create.className = "sheet-action";
        create.textContent = "מנה חדשה";
        create.addEventListener("click", () =>
          openDishEditor({
            dishId: null,
            // מנה שזה עתה נוצרה היא כמעט תמיד מה שרוצים לשבץ עכשיו.
            onSaved: (dishId) => {
              onSelect(dishId);
              handle.close();
            },
          }),
        );

        const close = document.createElement("button");
        close.type = "button";
        close.className = "sheet-close";
        close.textContent = "סגירה";
        close.addEventListener("click", () => handle.close());

        panel.append(heading, sub, options, create);

        // מנה בארכיון יורדת מהרשימה שלמעלה, ולכן בלי הקבוצה הזו לא
        // היה שום מסלול להחזיר אותה.
        const archived = listDishes({ includeArchived: true }).filter((dish) => dish.archived);
        if (archived.length) panel.append(archiveGroup(archived, draw));

        panel.append(close);
      };

      draw();
    },
  });
}

/** שם המנה לתצוגה, או null כשאין משבצת. */
export function dishLabel(dishId) {
  const dish = resolveDish(dishId);
  return dish ? dish.name_he : null;
}
