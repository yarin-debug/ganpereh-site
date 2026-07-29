/* בורר המנה — וגם הכניסה לספריית המנות.

   הבורר הוא המקום היחיד שבו מסתכלים על כל המנות, ולכן זה גם המקום
   שבו עורכים אותן: כל שורה נושאת "עריכה", ובתחתית יש "מנה חדשה".
   ספרייה נפרדת במסך משלה הייתה מכריחה לזכור איפה היא — כאן היא
   נמצאת בדיוק שם שבו כבר עומדים כשחסרה מנה. */

import { getStore, isoLocal } from "./store.js";
import { listDishes, resolveDish, effortLabel } from "./catalog.js";
import { lastCookedMap, recencyLabel, forgottenDishes, plannedDishIds } from "./history.js";
import { openOverlay, textInput } from "./ui-overlay.js";
import { openDishEditor } from "./ui-dish-editor.js";

/* מעל כמה מנות בקטלוג ההצעות מתחילות להרוויח את מקומן. הערך נגזר מכמה
   שורות מנה נכנסות למסך טלפון אחד — מתחת לזה אין גלילה לחסוך. */
const MIN_CATALOG_FOR_SUGGESTIONS = 6;

/** מתאר מנה בשורה אחת: זמן ומאמץ, בלי לחזור על השם. */
export function dishMeta(dish) {
  const effort = effortLabel(dish.effort);
  return effort ? `${dish.time_min} דק' · ${effort}` : `${dish.time_min} דק'`;
}

/**
 * שורת ההצעות. צ'יפים ולא כרטיסים: זה קיצור, והקטלוג המלא ממילא נמצא
 * שורה מתחת. מילוי מלא לא מופיע כאן — הצעה אינה הפעולה שצריך לעשות
 * עכשיו, היא הזכרה.
 */
function buildForgotten(entries, onSelect, handle) {
  const wrap = document.createElement("section");
  wrap.className = "forgotten";

  const title = document.createElement("h3");
  title.className = "section-title";
  title.id = "forgotten-title";
  title.textContent = "לא בישלנו מזמן";

  const row = document.createElement("div");
  row.className = "forgotten-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-labelledby", "forgotten-title");

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "forgotten-chip";

    const name = document.createElement("span");
    name.className = "forgotten-name";
    name.textContent = entry.dish.name_he;

    const when = document.createElement("span");
    when.className = "forgotten-when";
    when.textContent = weeksAgo(entry.days);

    button.append(name, when);
    button.addEventListener("click", () => {
      onSelect(entry.dish.id);
      handle.close();
    });
    row.append(button);
  }

  wrap.append(title, row);
  return wrap;
}

/** "לפני 3 שבועות" — קצר יותר מ-recencyLabel, שנועד לשורה ולא לצ'יפ. */
function weeksAgo(days) {
  if (days < 21) return "לפני שבועיים";
  if (days < 30) return "לפני 3 שבועות";
  if (days < 60) return "לפני חודש";
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

function dishRow({ dish, selected, recency, onPick, onEdited }) {
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

  // מתי בישלנו את זה לאחרונה — הסימן היחיד שעוצר לפני שמתכננים את
  // אותה מנה בפעם השלישית השבוע. מוצג רק כשיש מה לומר.
  if (recency) {
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

        /* ── "לא בישלנו מזמן" ────────────────────────────────────────
           עייפות תפריט היא לבשל את אותם שלושה דברים בלי לשים לב, וכל
           המידע לזהות את זה כבר היה כאן — lastCookedMap שימש רק להצגת
           תווית ליד מנה שכבר מסתכלים עליה, כלומר עזר רק למי שכבר נזכר.

           המקום הוא הבורר ולא מסך השבוע, כי כאן המשבצת כבר ידועה:
           הקשה על הצעה מתכננת אותה מיד. במסך השבוע היה צריך לשאול
           "לאיזה יום?" — כלומר להוסיף שלב במקום לחסוך אחד.

           מוסתר בזמן חיפוש: מי שמקליד שם כבר יודע מה הוא רוצה. */
        let forgottenBlock = null;
        // קטלוג שנכנס למסך אחד אינו דורש קיצור: שם ההצעות הן הקטלוג
        // עצמו, והבלוק חוזר מילה במילה על מה שנמצא שורה מתחתיו — כולל
        // תווית ה"בישלתם לפני..." שכבר מופיעה בכל שורה. הקיצור מרוויח
        // את מקומו רק כשיש ממה לקצר.
        if (!trimmed && all.length > MIN_CATALOG_FOR_SUGGESTIONS) {
          const forgotten = forgottenDishes(all, state.plan.slots, todayIso, {
            exclude: plannedDishIds(state.plan.slots, state.plan.week_start),
          });
          if (forgotten.length) forgottenBlock = buildForgotten(forgotten, onSelect, handle);
        }
        const matches = trimmed ? all.filter((dish) => dish.name_he.includes(trimmed)) : all;

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

        // ההצעות יושבות אחרי החיפוש ולפני הקטלוג: קיצור למי שלא יודע מה
        // הוא רוצה, ולא מסך חוצץ בפני מי שכן.
        panel.append(heading, sub, search);
        if (forgottenBlock) panel.append(forgottenBlock);
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
