/* שכבת אישור ההצעות — "מוצע לשבוע".

   ── למה שכבה ולא מילוי בלחיצה אחת ──────────────────────────────────
   הכפתור יכול היה פשוט למלא את כל המשבצות הריקות, כמו "העתקה משבוע
   שעבר". ההבדל: העתקה מחזירה החלטות שהמשתמש כבר קיבל בעצמו, וההצעה
   מייצרת החלטות שהוא לא קיבל מעולם. מילוי שקט של 21 משבצות מצטבר
   לתפריט שאיש לא בחר, והוא מתגלה בסופר.

   לכן השכבה מציגה את מה שיקרה *לפני* שזה קורה, עם הנימוק לכל שורה,
   והאישור הוא של המשתמש — שורה-שורה או בבת אחת.

   ── למה הרשימה מחושבת פעם אחת ───────────────────────────────────────
   אישור שורה ממלא משבצת, ומשבצת מלאה משנה את הדירוג של כל השאר (אות
   החזרה בתוך השבוע). חישוב מחדש אחרי כל אישור היה מזיז שורות מתחת
   לאצבע באמצע סשן תכנון. הרשימה נקבעת בפתיחה ונשארת יציבה.

   ── למה ההצעות מקובצות לימים ────────────────────────────────────────
   21 שורות שוות משקל הן קיר. הן גם אף פעם לא היו רשימה שטוחה — הן
   שבוע, ובדיוק במבנה שהמשתמש כבר קורא במסך השבוע. שבע קבוצות של
   שלוש נסרקות; רשימה אחת של 21 לא. */

import { getStore, weekDates, slotKey, isoLocal, DAY_NAMES } from "./store.js";
import { listDishes, resolveIngredient, resolveDish } from "./catalog.js";
import { MEAL_LABELS } from "./plan.js";
import { activeProfiles } from "./profiles.js";
import { suggestForWeek } from "./suggest.js";
import { openOverlay, reasonLine } from "./ui-overlay.js";
import { openDishSheet, dishMeta } from "./ui-sheet.js";

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

/** ההקשר שהמנוע צריך, נאסף מה-store במקום אחד. */
function buildContext(state) {
  const eaters = activeProfiles(state.profiles).map((p) => p.id);
  return {
    dishes: listDishes(),
    slots: state.plan.slots,
    dates: weekDates(state.plan.week_start),
    pantry: state.pantry,
    resolveIngredient,
    todayIso: isoLocal(new Date()),
    servings: eaters.length || 1,
    eaters,
  };
}

/**
 * כמה הצעות ממתינות לשבוע הנוכחי — קובע אם הכפתור מוצג בכלל.
 * מחושב דרך אותה פונקציה שתרוץ בפועל, כדי שהמספר על הכפתור יהיה
 * המספר שיקרה. כפתור שמבטיח מספר ואז עושה משהו אחר הוא כפתור
 * שמפסיקים ללחוץ עליו.
 */
export function countSuggestions(state) {
  return suggestForWeek(buildContext(state)).length;
}

/**
 * משבץ מנה למשבצת — ורק אם היא עדיין ריקה.
 *
 * המשבצת יכולה להתמלא בין פתיחת השכבה לאישור (טאב אחר, בורר שנפתח
 * מעל). דריסה שקטה של בחירה מפורשת בהצעה אוטומטית היא בדיוק מה
 * שהשכבה הזו קיימת כדי למנוע.
 *
 * @returns {boolean} האם שובץ
 */
function fillSlot(state, key, dishId, eaters) {
  const existing = state.plan.slots[key];
  if (existing && existing.dish_id) return false;
  state.plan.slots[key] = {
    dish_id: dishId,
    servings: eaters.length || 1,
    eaters: [...eaters],
    status: "planned",
  };
  return true;
}

/**
 * כותרת יום בתוך השכבה.
 *
 * h3 ולא div: בשכבה שיכולה להחזיק 21 שורות, ניווט לפי כותרות הוא
 * הדרך היחידה בקורא מסך לדלג ליום הרלוונטי בלי לעבור שורה-שורה.
 */
function dayHeading(date, dates) {
  const head = document.createElement("h3");
  head.className = "day-head suggest-day";

  const name = document.createElement("span");
  name.className = "day-name";
  name.textContent = DAY_NAMES[dates.indexOf(date)] || "";

  const when = document.createElement("span");
  when.className = "day-date";
  when.textContent = formatDate(date);

  head.append(name, when);
  return head;
}

/**
 * פותח את שכבת ההצעות.
 *
 * אין כאן קריאת רענון: כל אישור עובר דרך store.update, ו-app.js כבר
 * מרנדר מחדש את המסך שמאחורי השכבה. השכבה עצמה חיה מחוץ ל-screen.el
 * ולכן שורדת את הרינדור.
 */
export function openSuggestSheet() {
  const store = getStore();

  return openOverlay({
    label: "הצעות לשבוע",
    build: (panel, handle) => {
      const context = buildContext(store.state);
      // נקבע פעם אחת בפתיחה. ראה ההערה בראש הקובץ.
      const picks = suggestForWeek(context);
      const handled = new Set();
      // מנה שהוחלפה ידנית דורסת את ההצעה לאותה שורה בלבד.
      const swapped = new Map();

      const dishFor = (pick) => swapped.get(pick.key) || pick.dish;

      const apply = (pick) => {
        const dish = dishFor(pick);
        store.update((s) => {
          fillSlot(s, pick.key, dish.id, context.eaters);
        });
        // גם משבצת שנתפסה בינתיים נחשבת מטופלת: אין מה להציע לה עוד.
        handled.add(pick.key);
      };

      /* אישור שורה בונה את השכבה מחדש והורס את הכפתור שנלחץ, ואיתו
         הפוקוס. בלי החזרה, אישור במקלדת היה זורק את הסמן ל-body אחרי
         כל שורה — כלומר אי אפשר לאשר שתי שורות ברצף. המפתח יציב ולא
         תלוי במיקום, בדיוק כמו data-focus-key במסכים. */
      const focusByKey = (focusKey) => {
        if (!focusKey) return;
        const next = panel.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
        if (next instanceof HTMLElement && !next.disabled) next.focus({ preventScroll: true });
      };

      /** השורה הממתינה הבאה אחרי זו שטופלה — לשם הפוקוס ממשיך. */
      const nextPending = (afterKey) => {
        const index = picks.findIndex((pick) => pick.key === afterKey);
        const following = picks.slice(index + 1).find((pick) => !handled.has(pick.key));
        return following || picks.find((pick) => !handled.has(pick.key)) || null;
      };

      const draw = (focusKey) => {
        panel.replaceChildren();

        const heading = document.createElement("h2");
        heading.className = "sheet-title";
        heading.textContent = "מוצע לשבוע";

        const remaining = picks.filter((pick) => !handled.has(pick.key));

        const sub = document.createElement("p");
        sub.className = "sheet-sub";
        // כשהכול טופל זה לא מצב ריק אלא מצב גמור, ולכן הניסוח מאשר
        // ולא מתנצל על מה שאין.
        sub.textContent = remaining.length
          ? "הצעה לכל משבצת ריקה. אפשר לאשר אחת-אחת או הכול יחד."
          : "השבוע מלא.";

        panel.append(heading, sub);

        let lastDate = null;
        for (const pick of picks) {
          if (pick.date !== lastDate) {
            panel.append(dayHeading(pick.date, context.dates));
            lastDate = pick.date;
          }
          panel.append(buildRow(pick));
        }

        // המילוי המלא היחיד בשכבה. יורד ברגע שאין מה למלא — כפתור
        // פעולה שאין לו מה לעשות מלמד להתעלם ממנו.
        if (remaining.length) {
          const all = document.createElement("button");
          all.type = "button";
          all.className = "act act-wide act-primary suggest-all";
          all.textContent =
            remaining.length === 1 ? "לשבץ את ההצעה" : `לשבץ את כל ${remaining.length} ההצעות`;
          all.addEventListener("click", () => {
            for (const pick of remaining) apply(pick);
            // אחרי אישור גורף אין שורה ממתינה להמשיך אליה, ולכן
            // הפוקוס עובר לפעולה היחידה שנשארה.
            draw("suggest:close");
          });
          panel.append(all);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "sheet-close";
        close.dataset.focusKey = "suggest:close";
        close.textContent = remaining.length ? "סגירה" : "סיום";
        close.addEventListener("click", () => handle.close());
        panel.append(close);

        focusByKey(focusKey);
      };

      function buildRow(pick) {
        const dish = dishFor(pick);
        const done = handled.has(pick.key);

        const row = document.createElement("div");
        row.className = "meal-row suggest-row";

        const label = document.createElement("span");
        label.className = "meal-row-label";
        label.textContent = MEAL_LABELS[pick.meal] || "";

        const card = document.createElement("button");
        card.type = "button";
        // מסומן = הושלם: קו וגוון, לא מילוי. אותו היפוך שכל המערכת
        // נשענת עליו — ביצוע לא אמור להיקרא כמשקל.
        card.className = done ? "dish-card is-on" : "dish-card";
        card.setAttribute("aria-pressed", done ? "true" : "false");
        card.disabled = done;
        card.dataset.focusKey = `suggest:${pick.key}`;

        const name = document.createElement("span");
        name.className = "dish-card-name";
        name.textContent = dish.name_he;

        const meta = document.createElement("span");
        meta.className = "dish-card-meta";
        meta.textContent = dishMeta(dish);
        name.append(meta);

        // אחרי השיבוץ הנימוק כבר לא רלוונטי — הוא היה טיעון להחלטה
        // שכבר התקבלה. במקומו נאמר מה קרה.
        if (done) {
          const note = document.createElement("span");
          note.className = "dish-card-recency";
          note.textContent = "שובץ";
          name.append(note);
        } else if (swapped.has(pick.key)) {
          const note = document.createElement("span");
          note.className = "reason-line";
          const part = document.createElement("span");
          part.className = "reason is-warn";
          part.textContent = "בחירה שלך";
          note.append(part);
          name.append(note);
        } else {
          name.append(reasonLine(pick.reasons));
        }

        card.append(name);
        card.addEventListener("click", () => {
          const following = nextPending(pick.key);
          apply(pick);
          draw(following ? `suggest:${following.key}` : "suggest:close");
        });

        const swap = document.createElement("button");
        swap.type = "button";
        swap.className = "dish-edit";
        swap.dataset.focusKey = `suggest:${pick.key}:swap`;
        swap.textContent = "החלפה";
        swap.setAttribute(
          "aria-label",
          `החלפת ההצעה ל${MEAL_LABELS[pick.meal] || ""} ב${DAY_NAMES[context.dates.indexOf(pick.date)] || ""}`,
        );
        swap.disabled = done;
        swap.addEventListener("click", () => {
          openDishSheet({
            title: `${DAY_NAMES[context.dates.indexOf(pick.date)] || ""} · ${MEAL_LABELS[pick.meal] || ""}`,
            current: dish.id,
            slot: { key: pick.key, meal: pick.meal, servings: context.servings },
            onSelect: (dishId) => {
              // ניקוי המשבצת מתוך בורר שנפתח מכאן פירושו "לא רוצה
              // הצעה לשורה הזו": היא יורדת מהרשימה בלי לשבץ כלום.
              if (!dishId) {
                handled.add(pick.key);
                draw("suggest:close");
                return;
              }
              const picked = resolveDish(dishId);
              if (picked) swapped.set(pick.key, picked);
              // חוזרים לאותה שורה: המנה התחלפה אבל היא עדיין ממתינה
              // לאישור, וזו הפעולה הבאה שהמשתמש רוצה.
              draw(`suggest:${pick.key}`);
            },
          });
        });

        row.append(label, card, swap);
        return row;
      }

      draw();
    },
  });
}
