/* בורר ההרכבה — וגם הכניסה לספריית המנות.

   ── למה מרכיבים ולא בוחרים ─────────────────────────────────────────
   רשימה שטוחה של מנות שלמות מכריחה לקבל את ההחלטה של מי שהזין את
   הנתונים: מי שרצה שניצל עם אורז נשאר בלי מסלול. כאן בוחרים רכיבים —
   חלבון, תוספת, ירק, מטבל — וההרכבה מצטברת למעלה.

   ── מה עושה את המסך הזה שווה יותר מרשימת סימונים ────────────────────
   פס ההרכבה. בזמן שמרכיבים, הצלחת מסתכמת מולך: זמן, קלוריות וחלבון
   למנה. זו התשובה לשאלה "למה בכלל להרכיב ולא לבחור" — כי אפשר לראות
   מה כל החלפה עושה לפני שמחליטים. המספרים נגזרים מאותו מנוע של מסך
   המאקרו, כולל סימון "חלקי" — מספר שנראה כמו ידיעה בלי להיות כזו הוא
   בדיוק מה שהאפליקציה נבנתה למנוע.

   הבורר הוא המקום היחיד שבו מסתכלים על כל המנות, ולכן זה גם המקום
   שבו עורכים אותן: כל שורה נושאת "עריכה", ובתחתית יש "מנה חדשה". */

import { getStore, isoLocal } from "./store.js";
import { listDishes, resolveDish, resolveIngredient, effortLabel } from "./catalog.js";
import {
  slotComponents,
  sortComponents,
  toggleComponent,
  composedTime,
  groupByRole,
} from "./compose.js";
import { composedMacros, formatMacros } from "./normalize.js";
import { lastCookedMap, recencyLabel } from "./history.js";
import { openOverlay, textInput } from "./ui-overlay.js";
import { openDishEditor } from "./ui-dish-editor.js";

/** מתאר מנה בשורה אחת: זמן ומאמץ, בלי לחזור על השם. */
export function dishMeta(dish) {
  const effort = effortLabel(dish.effort);
  return effort ? `${dish.time_min} דק' · ${effort}` : `${dish.time_min} דק'`;
}

/* ---------- פס ההרכבה ---------- */

/** צ'יפ של רכיב נבחר. ההסרה יושבת עליו, כי שם מחפשים אותה. */
function pickedChip(dish, onRemove) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "picked-chip";
  const name = dish ? dish.name_he : "מנה לא מוכרת";
  chip.setAttribute("aria-label", `הסרת ${name} מהארוחה`);

  const label = document.createElement("span");
  label.textContent = name;

  const mark = document.createElement("span");
  mark.className = "picked-chip-x";
  mark.textContent = "×";
  mark.setAttribute("aria-hidden", "true");

  chip.append(label, mark);
  chip.addEventListener("click", onRemove);
  return chip;
}

/**
 * הסיכום הנגזר: זמן, קלוריות וחלבון למנה.
 *
 * הזמן הוא של הרכיב הארוך ביותר ולא סכום הרכיבים — השניצל מטגן בזמן
 * שהאורז על האש (ראה composedTime).
 */
function summaryFacts(dishes) {
  const macros = formatMacros(composedMacros(dishes, resolveIngredient));
  const time = composedTime(
    dishes.map((dish) => dish.id),
    resolveDish,
  );
  return `${time} דק' · ${macros.kcal} קק"ל למנה · ${macros.protein_g} גרם חלבון`;
}

/* ---------- שורת רכיב ---------- */

function dishRow({ dish, selected, recency, onToggle, onEdited }) {
  const row = document.createElement("div");
  row.className = "dish-row";

  const card = document.createElement("button");
  card.type = "button";
  card.className = selected ? "dish-card is-on" : "dish-card";
  card.dataset.pick = dish.id;
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

  // סימן הבחירה הוא צורה ולא רק גוון: בשמש, על מסך טלפון, הבדל גוון
  // בלבד בין נבחר ללא נבחר אינו נקרא.
  const check = document.createElement("span");
  check.className = "dish-card-check";
  check.setAttribute("aria-hidden", "true");

  card.append(name, check);
  card.addEventListener("click", onToggle);

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
 * פותח את בורר ההרכבה.
 *
 * הבחירה נצברת בטיוטה מקומית ונשמרת בהקשה אחת בסוף, ולא כותבת לתוכנית
 * בכל נגיעה. שתי סיבות: הרכבה היא החלטה אחת ולא ארבע, ורשימת הקניות
 * מאחורי השכבה לא מהבהבת בכל צ'יפ.
 *
 * @param {object} options
 * @param {string} options.title            היום והארוחה שאליהם משבצים
 * @param {string[]} options.current        מזהי הרכיבים המשובצים כרגע
 * @param {(dishIds:string[])=>void} options.onSelect  רשימה ריקה = להסיר
 */
export function openMealSheet({ title, current, onSelect }) {
  return openOverlay({
    label: `הרכבת ארוחה · ${title}`,
    build: (panel, handle) => {
      const store = getStore();
      const todayIso = isoLocal(new Date());
      const hadMeal = (current || []).length > 0;

      // הטיוטה, החיפוש, והמנה שנגעו בה אחרונה — שלושתם שורדים בנייה
      // מחדש של הרשימה (עריכת מנה, שחזור מארכיון, הקלדה בחיפוש).
      let picked = sortComponents(current || [], resolveDish);
      let query = "";
      let restoreTo = null;

      /* אזור חי: הסיכום הוא כל המשוב על הקשה, ובלעדיו קורא מסך שומע
         "נבחר" ולא שומע *מה* זה עשה לצלחת — הזמן והמאקרו שהשתנו. */
      const summary = document.createElement("div");
      summary.className = "compose-summary";
      summary.setAttribute("aria-live", "polite");

      const options = document.createElement("div");
      options.className = "sheet-options";

      // בלי act-wide: בשורת התחתית הכפתור חולק את הרוחב עם "ביטול",
      // ו-act-wide היה פורש אותו על שני הטורים ודוחף את הביטול לשורה.
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "act act-primary";

      /* הסיכום והכפתור הראשי מתעדכנים בלי לבנות מחדש את הרשימה: הקשה
         על רכיב לא אמורה להזיז את הגלילה מתחת לאצבע. */
      const drawSummary = () => {
        summary.replaceChildren();

        if (!picked.length) {
          const invite = document.createElement("p");
          invite.className = "compose-invite";
          invite.textContent = "בוחרים חלבון, תוספת וסלט — או מנה שלמה שעומדת לבד.";
          summary.append(invite);
          return;
        }

        const chips = document.createElement("div");
        chips.className = "picked-chips";
        for (const id of picked) {
          chips.append(
            pickedChip(resolveDish(id), () => {
              picked = toggleComponent(picked, id);
              restoreTo = null;
              refresh();
            }),
          );
        }

        const dishes = picked.map((id) => resolveDish(id)).filter(Boolean);
        const facts = document.createElement("p");
        facts.className = "compose-facts";
        facts.textContent = dishes.length ? summaryFacts(dishes) : "";
        if (composedMacros(dishes, resolveIngredient).partial) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "חלקי";
          facts.append(tag);
        }

        summary.append(chips, facts);
      };

      const drawPrimary = () => {
        if (picked.length) {
          primary.hidden = false;
          primary.textContent = picked.length === 1 ? "שמירה" : `שמירה · ${picked.length} רכיבים`;
          return;
        }
        // בלי רכיבים אין מה לשמור. כשהייתה כאן ארוחה, ההסרה היא הפעולה
        // האמיתית ונאמרת בשמה; כשלא הייתה, אין פעולה ראשית בכלל.
        primary.hidden = !hadMeal;
        primary.textContent = "הסרת הארוחה";
      };

      const refresh = () => {
        // הסידור קורה כאן ולא רק בשמירה, כדי שפס ההרכבה ייקרא תמיד
        // בסדר הצלחת — חלבון, תוספת, סלט — ולא בסדר ההקשות.
        picked = sortComponents(picked, resolveDish);
        drawSummary();
        drawPrimary();
        for (const card of options.querySelectorAll("[data-pick]")) {
          const on = picked.includes(card.dataset.pick);
          card.classList.toggle("is-on", on);
          card.setAttribute("aria-pressed", on ? "true" : "false");
        }
      };

      const drawOptions = () => {
        options.replaceChildren();

        const cooked = lastCookedMap(store.state.plan.slots);
        const trimmed = query.trim();
        const all = listDishes();
        const matches = trimmed ? all.filter((dish) => dish.name_he.includes(trimmed)) : all;

        for (const group of groupByRole(matches)) {
          const heading = document.createElement("h3");
          heading.className = "section-title";
          heading.textContent = group.label;
          options.append(heading);

          for (const dish of group.dishes) {
            options.append(
              dishRow({
                dish,
                selected: picked.includes(dish.id),
                recency: recencyLabel(cooked.get(dish.id), todayIso),
                onToggle: () => {
                  picked = toggleComponent(picked, dish.id);
                  restoreTo = dish.id;
                  refresh();
                },
                // מנה שנערכה עשויה לשנות שם, תפקיד, או לרדת לארכיון,
                // ולכן הרשימה נבנית מחדש במקום להישאר על נתונים ישנים.
                onEdited: () => {
                  restoreTo = dish.id;
                  drawOptions();
                  drawArchive();
                  refresh();
                },
              }),
            );
          }
        }

        if (!matches.length) {
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = `אין מנה בשם "${trimmed}". אפשר להוסיף אותה.`;
          options.append(empty);
        }

        // הרשימה נבנית מחדש והכפתור שנגעו בו נהרס תחת האצבע. בלי
        // ההחזרה הזו מקלדת מאבדת את המקום אחרי כל בחירה.
        if (restoreTo) {
          const card = options.querySelector(`[data-pick="${CSS.escape(restoreTo)}"]`);
          if (card) card.focus({ preventScroll: true });
        }
      };

      // הכותרת מקבלת את המיקוד בפתיחה ולא שדה החיפוש: מיקוד בשדה מעלה
      // מקלדת שמכסה חצי מהשכבה עוד לפני שראו מה יש בה. קורא מסך מקריא
      // את הכותרת, ו-Tab ממשיך פנימה כרגיל.
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "מה מרכיבים?";
      heading.tabIndex = -1;
      heading.dataset.autofocus = "true";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = title;

      const search = textInput({ placeholder: "חיפוש רכיב" });
      search.type = "search";
      search.addEventListener("input", () => {
        query = search.value;
        restoreTo = null;
        drawOptions();
      });

      const create = document.createElement("button");
      create.type = "button";
      create.className = "sheet-action";
      create.textContent = "מנה חדשה";
      create.addEventListener("click", () =>
        openDishEditor({
          dishId: null,
          // מה שכבר הוקלד בחיפוש הוא כמעט תמיד שם המנה החדשה.
          initialName: query.trim(),
          // מנה שזה עתה נוצרה היא כמעט תמיד מה שרוצים בארוחה עכשיו,
          // אבל הבורר נשאר פתוח: אחרי שהוספת תוספת חדשה עוד לא סיימת
          // להרכיב.
          onSaved: (dishId) => {
            if (!picked.includes(dishId)) picked = toggleComponent(picked, dishId);
            restoreTo = dishId;
            drawOptions();
            refresh();
          },
        }),
      );

      primary.addEventListener("click", () => {
        onSelect(sortComponents(picked, resolveDish));
        handle.close();
      });

      const close = document.createElement("button");
      close.type = "button";
      close.className = "sheet-close";
      close.textContent = "ביטול";
      close.addEventListener("click", () => handle.close());

      // מנה בארכיון יורדת מהרשימה שלמעלה, ולכן בלי הקבוצה הזו לא היה
      // שום מסלול להחזיר אותה. יושבת במעטפת משלה כדי שהשחזור יוריד
      // אותה מהקבוצה באותה נשימה שבה היא חוזרת לרשימה.
      const archive = document.createElement("div");
      const drawArchive = () => {
        archive.replaceChildren();
        const archived = listDishes({ includeArchived: true }).filter((dish) => dish.archived);
        if (!archived.length) return;
        archive.append(
          archiveGroup(archived, () => {
            drawOptions();
            drawArchive();
            refresh();
          }),
        );
      };

      /* שורת התחתית נדבקת לתחתית השכבה ולא נגללת עם הרשימה. עם תשעה־
         עשר רכיבים, כפתור שמירה בסוף הגלילה היה מחייב לגלול חזרה דרך
         כל הקטלוג כדי לאשר את מה שכבר הורכב למעלה. */
      const footer = document.createElement("div");
      footer.className = "compose-footer";
      footer.append(primary, close);

      panel.append(heading, sub, summary, search, options, create, archive, footer);

      drawOptions();
      drawArchive();
      refresh();
    },
  });
}
