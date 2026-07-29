/* בורר המנה — וגם הכניסה לספריית המנות.

   הבורר הוא המקום היחיד שבו מסתכלים על כל המנות, ולכן זה גם המקום
   שבו עורכים אותן: כל שורה נושאת "עריכה", ובתחתית יש "מנה חדשה".
   ספרייה נפרדת במסך משלה הייתה מכריחה לזכור איפה היא — כאן היא
   נמצאת בדיוק שם שבו כבר עומדים כשחסרה מנה. */

import { getStore, isoLocal, weekDates } from "./store.js";
import { listDishes, resolveDish, resolveIngredient, effortLabel } from "./catalog.js";
import { lastCookedMap, recencyLabel } from "./history.js";
import { suggestDishes } from "./suggest.js";
import { openOverlay, textInput, reasonLine } from "./ui-overlay.js";
import { openDishEditor } from "./ui-dish-editor.js";

/* כמה הצעות בראש הבורר. שלוש זה מספר של בחירה — אחת היא הכתבה, וחמש
   כבר דוחפות את הרשימה המלאה אל מתחת לקיפול. */
const SUGGEST_COUNT = 3;

/** מתאר מנה בשורה אחת: זמן ומאמץ, בלי לחזור על השם. */
export function dishMeta(dish) {
  const effort = effortLabel(dish.effort);
  return effort ? `${dish.time_min} דק' · ${effort}` : `${dish.time_min} דק'`;
}

function dishRow({ dish, selected, recency, reasons, onPick, onEdited }) {
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

  // בקבוצת המוצעות הנימוקים מחליפים את שורת ה"בישלנו לאחרונה" ולא
  // מתווספים לה: מתי בישלנו הוא כבר אחד מהנימוקים, ושתי שורות שאומרות
  // את אותו דבר נקראות כשתי עובדות.
  if (reasons && reasons.length) {
    name.append(reasonLine(reasons));
  } else if (recency) {
    // מתי בישלנו את זה לאחרונה — הסימן היחיד שעוצר לפני שמתכננים את
    // אותה מנה בפעם השלישית השבוע. מוצג רק כשיש מה לומר.
    const when = document.createElement("span");
    when.className = "dish-card-recency";
    when.textContent = recency;
    name.append(when);
  }

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

/**
 * הצעות בראש הבורר.
 *
 * מוצג רק כשהקורא מסר הקשר משבצת (איזו ארוחה, כמה מנות) — בלעדיו
 * אין למנוע על מה לדרג, ורשימה בשם "מוצע" שאינה נשענת על כלום היא
 * בדיוק הציון הסתום שהמנוע נועד לא לייצר.
 */
function suggestGroup({ dishes, state, slot, todayIso, onPick, onEdited }) {
  // ספרייה קטנה מסף ההצעות: "מוצע" ו"כל המנות" היו מציגים בדיוק את
  // אותן שורות, פעמיים. דירוג של שלוש מנות גם אינו המלצה — הוא סדר.
  if (dishes.length <= SUGGEST_COUNT) return null;

  const ranked = suggestDishes({
    dishes,
    slots: state.plan.slots,
    dates: weekDates(state.plan.week_start),
    pantry: state.pantry,
    resolveIngredient,
    todayIso,
    meal: slot.meal,
    servings: slot.servings,
    // המשבצת שעומדים לשבץ אינה "חזרה" על עצמה.
    excludeKey: slot.key,
    limit: SUGGEST_COUNT,
  });
  if (!ranked.length) return null;

  const wrap = document.createElement("div");

  const heading = document.createElement("h3");
  heading.className = "section-title section-title--sheet";
  heading.textContent = "מוצע";
  wrap.append(heading);

  const options = document.createElement("div");
  options.className = "sheet-options";
  for (const item of ranked) {
    options.append(
      dishRow({
        dish: item.dish,
        selected: false,
        reasons: item.reasons,
        onPick: () => onPick(item.dish.id),
        onEdited,
      }),
    );
  }
  wrap.append(options);

  const all = document.createElement("h3");
  all.className = "section-title section-title--sheet";
  all.textContent = "כל המנות";
  wrap.append(all);

  return wrap;
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
 * @param {object} [options.slot]          הקשר לדירוג: {key, meal, servings}
 * @param {(dishId:string|null)=>void} options.onSelect
 */
export function openDishSheet({ title, current, slot, onSelect }) {
  return openOverlay({
    label: `בחירת ארוחה · ${title}`,
    build: (panel, handle) => {
      // החיפוש שורד את בניית הרשימה מחדש (עריכת מנה, שחזור מארכיון),
      // כדי שהקלדה לא תימחק מתחת לאצבע.
      let query = "";

      const draw = () => {
        panel.replaceChildren();

        const state = getStore().state;
        const todayIso = isoLocal(new Date());
        const cooked = lastCookedMap(state.plan.slots);

        const heading = document.createElement("h2");
        heading.className = "sheet-title";
        heading.textContent = "מה אוכלים?";

        const sub = document.createElement("p");
        sub.className = "sheet-sub";
        sub.textContent = title;

        const all = listDishes();
        const search = textInput({ placeholder: "חיפוש מנה" });
        search.type = "search";
        search.value = query;
        search.addEventListener("input", () => {
          query = search.value;
          const at = search.selectionStart;
          draw();
          // הרשימה נבנית מחדש בכל תו, ולכן צריך להחזיר את המיקוד
          // ואת מיקום הסמן — אחרת ההקלדה נקטעת אחרי אות אחת.
          const next = panel.querySelector('input[type="search"]');
          if (next) {
            next.focus();
            next.setSelectionRange(at, at);
          }
        });

        const options = document.createElement("div");
        options.className = "sheet-options";

        const trimmed = query.trim();
        const matches = trimmed ? all.filter((dish) => dish.name_he.includes(trimmed)) : all;

        // בזמן חיפוש אין הצעות: מי שהקליד שם מנה כבר יודע מה הוא רוצה,
        // ורשימת "מוצע" מעליו רק דוחפת את התוצאה שלו מטה.
        const suggested =
          slot && !trimmed
            ? suggestGroup({
                dishes: all,
                state,
                slot,
                todayIso,
                onPick: (dishId) => {
                  onSelect(dishId);
                  handle.close();
                },
                onEdited: draw,
              })
            : null;

        for (const dish of matches) {
          options.append(
            dishRow({
              dish,
              selected: dish.id === current,
              recency: recencyLabel(cooked.get(dish.id), todayIso),
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

        if (!matches.length) {
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = `אין מנה בשם "${trimmed}". אפשר להוסיף אותה.`;
          options.append(empty);
        }

        // ניקוי המשבצת חי כאן ולא ככפתור נפרד במסך: זו בחירה מאותה משפחה.
        if (current && !trimmed) {
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
            // מה שכבר הוקלד בחיפוש הוא כמעט תמיד שם המנה החדשה.
            initialName: trimmed,
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

        panel.append(heading, sub, search);
        if (suggested) panel.append(suggested);
        panel.append(options, create);

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
