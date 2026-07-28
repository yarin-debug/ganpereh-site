/* עורך המנה.

   ── למה עריכת מנת זרע כותבת העתק ולא משנה את המקור ─────────────────
   מנות הזרע חיות בקוד. עריכה שומרת מנה שלמה תחת אותו מזהה במצב
   המשתמש, וההעתק גובר (ראה catalog.js). המשמעות המעשית: אפשר תמיד
   לחזור לגרסת הזרע — מחיקת ההעתק מחזירה את המקור.

   ── למה יש תצוגה מקדימה של המאקרו ──────────────────────────────────
   כי הערך של המנה נגזר מהמצרכים, ובלי משוב מיידי אי אפשר לדעת אם
   הכמויות שהוקלדו סבירות. התצוגה מסמנת "חלקי" בדיוק כמו מסך המאקרו,
   כדי שיהיה ברור מתי המספר אינו מלא. */

import { getStore } from "./store.js";
import {
  EFFORTS,
  KOSHER_TYPES,
  BASE_UNITS,
  resolveDish,
  resolveIngredient,
  isSeedDish,
  nextDishId,
  unitLabel,
} from "./catalog.js";
import { dishMacros, formatMacros } from "./normalize.js";
import {
  openOverlay,
  fieldLabel,
  fieldGroup,
  textInput,
  numberInput,
  chipGroup,
  errorLine,
} from "./ui-overlay.js";
import { openIngredientPicker } from "./ui-ingredient-editor.js";

function blankDraft() {
  return {
    name_he: "",
    time_min: 30,
    effort: "medium",
    kosher: "parve",
    ingredients: [],
    prep_ahead: [],
  };
}

function draftFrom(dish) {
  return {
    name_he: dish.name_he,
    time_min: dish.time_min,
    effort: dish.effort,
    kosher: dish.kosher,
    ingredients: dish.ingredients.map((entry) => ({ ...entry })),
    prep_ahead: [...(dish.prep_ahead || [])],
  };
}

/**
 * טופס המנה.
 * @param {object} options
 * @param {string|null} options.dishId  קיים לעריכה, null ליצירה
 * @param {(dishId:string)=>void} [options.onSaved]
 */
export function openDishEditor({ dishId = null, onSaved }) {
  const store = getStore();
  const existing = dishId ? resolveDish(dishId) : null;
  const draft = existing ? draftFrom(existing) : blankDraft();

  return openOverlay({
    label: existing ? `עריכת ${existing.name_he}` : "מנה חדשה",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = existing ? "עריכת מנה" : "מנה חדשה";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "הכמויות הן למנה בודדת אחת. ההכפלה לפי מספר המנות קורית בתכנון.";

      const name = textInput({ value: draft.name_he, autofocus: !existing });
      name.addEventListener("input", () => {
        draft.name_he = name.value;
      });

      const time = numberInput({ value: draft.time_min, min: 0, step: 5 });
      time.addEventListener("input", () => {
        const n = Number(time.value);
        draft.time_min = Number.isFinite(n) && n >= 0 ? n : 0;
      });

      const effort = chipGroup({
        options: EFFORTS,
        value: draft.effort,
        label: "מאמץ",
        onChange: (id) => {
          draft.effort = id;
        },
      });

      const kosher = chipGroup({
        options: KOSHER_TYPES,
        value: draft.kosher,
        label: "כשרות",
        onChange: (id) => {
          draft.kosher = id;
        },
      });

      const ingredientsTitle = document.createElement("h3");
      ingredientsTitle.className = "section-title";
      ingredientsTitle.textContent = "מצרכים למנה אחת";

      const rows = document.createElement("div");
      rows.className = "ing-rows";

      const preview = document.createElement("p");
      preview.className = "macro-preview";

      const drawPreview = () => {
        if (!draft.ingredients.length) {
          preview.textContent = "בלי מצרכים אי אפשר לחשב מאקרו או לבנות רשימת קניות.";
          return;
        }
        const macros = dishMacros({ ...draft, macros_override: null }, resolveIngredient);
        const values = formatMacros(macros);
        preview.textContent = `למנה: ${values.kcal} קק"ל · ${values.protein_g} גרם חלבון · ${values.fat_g} גרם שומן · ${values.carbs_g} גרם פחמימות`;
        if (macros.partial) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "חלקי";
          preview.append(tag);
        }
      };

      const drawRows = () => {
        rows.replaceChildren();

        for (const [index, entry] of draft.ingredients.entries()) {
          const ingredient = resolveIngredient(entry.ingredient_id);

          const row = document.createElement("div");
          row.className = "ing-row";

          const label = document.createElement("span");
          label.className = "ing-name";
          label.textContent = ingredient ? ingredient.name_he : "מצרך לא מוכר";

          const qty = numberInput({ value: entry.qty, min: 0 });
          qty.setAttribute("aria-label", `כמות · ${label.textContent}`);
          qty.addEventListener("input", () => {
            const n = Number(qty.value);
            entry.qty = Number.isFinite(n) && n >= 0 ? n : 0;
            drawPreview();
          });

          const unit = document.createElement("select");
          unit.className = "ing-unit";
          unit.setAttribute("aria-label", `יחידה · ${label.textContent}`);
          for (const option of BASE_UNITS) {
            const el = document.createElement("option");
            el.value = option.id;
            el.textContent = option.label;
            unit.append(el);
          }
          unit.value = entry.unit;
          unit.addEventListener("change", () => {
            entry.unit = unit.value;
            drawPreview();
          });

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "ing-remove";
          remove.textContent = "×";
          remove.setAttribute("aria-label", `הסרת ${label.textContent}`);
          remove.addEventListener("click", () => {
            draft.ingredients.splice(index, 1);
            drawRows();
            drawPreview();
          });

          row.append(label, qty, unit, remove);
          rows.append(row);
        }

        const add = document.createElement("button");
        add.type = "button";
        add.className = "sheet-action";
        add.textContent = "הוספת מצרך";
        add.addEventListener("click", () =>
          openIngredientPicker({
            exclude: draft.ingredients.map((e) => e.ingredient_id),
            onSelect: (ingredientId) => {
              const picked = resolveIngredient(ingredientId);
              draft.ingredients.push({
                ingredient_id: ingredientId,
                qty: 100,
                // ברירת המחדל היא יחידת הבסיס של המצרך — ההמרה הזולה
                // ביותר היא זו שלא צריך לעשות.
                unit: picked ? picked.base_unit : "g",
              });
              drawRows();
              drawPreview();
            },
          }),
        );
        rows.append(add);
      };

      drawRows();
      drawPreview();

      const prep = textInput({
        value: draft.prep_ahead.join(", "),
        placeholder: "למשל: לצפות את השניצל מראש",
      });
      prep.addEventListener("input", () => {
        draft.prep_ahead = prep.value
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      });
      const prepField = fieldLabel("אפשר להכין מראש (לא חובה)", prep);
      const prepNote = document.createElement("p");
      prepNote.className = "field-note";
      prepNote.textContent = "מופרד בפסיקים. מוצג בכרטיס של היום.";
      prepField.append(prepNote);

      const error = errorLine("");
      error.hidden = true;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "act act-wide act-primary";
      save.textContent = "שמירה";
      save.addEventListener("click", () => {
        const trimmed = draft.name_he.trim();
        if (!trimmed) {
          error.textContent = "צריך שם למנה.";
          error.hidden = false;
          name.focus();
          return;
        }

        const id = dishId || nextDishId();
        const ok = store.update((s) => {
          s.dishes[id] = {
            ...(s.dishes[id] || {}),
            id,
            name_he: trimmed,
            kosher: draft.kosher,
            effort: draft.effort,
            time_min: draft.time_min,
            ingredients: draft.ingredients.map((entry) => ({ ...entry })),
            prep_ahead: [...draft.prep_ahead],
            tags: existing ? existing.tags || [] : [],
            macros_override: existing ? existing.macros_override : null,
            archived: false,
          };
        });

        if (!ok) {
          error.textContent = "השמירה נכשלה. בדוק את הודעת המצב בראש המסך.";
          error.hidden = false;
          return;
        }
        handle.close();
        if (onSaved) onSaved(id);
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(
        heading,
        sub,
        fieldLabel("שם המנה", name),
        fieldLabel("זמן הכנה בדקות", time),
        fieldGroup("מאמץ", effort),
        fieldGroup("כשרות", kosher),
        ingredientsTitle,
        rows,
        preview,
        prepField,
        error,
        save,
        cancel,
      );

      if (existing) panel.append(buildRemoval(store, dishId, handle, onSaved));
    },
  });
}

/**
 * הסרה מהבורר.
 *
 * מנת זרע שנערכה חוזרת לגרסת המקור (מחיקת ההעתק), ומנה אחרת עוברת
 * לארכיון. בשני המקרים המזהה ממשיך להיפתר — משבצות של שבועות קודמים
 * מצביעות עליו, ומחיקה אמיתית הייתה הופכת אותן ל"מנה לא מוכרת"
 * ומשנה למפרע את מסך המאקרו.
 */
function buildRemoval(store, dishId, handle, onSaved) {
  const wrap = document.createElement("div");
  const seed = isSeedDish(dishId);
  const edited = !!store.state.dishes[dishId];

  if (seed && !edited) return wrap; // מנת זרע שלא נגעו בה — אין מה להסיר

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-danger";
  button.textContent = seed ? "שחזור לגרסה המקורית" : "העברה לארכיון";
  button.addEventListener("click", () => {
    store.update((s) => {
      if (seed) delete s.dishes[dishId];
      else if (s.dishes[dishId]) s.dishes[dishId].archived = true;
    });
    handle.close();
    if (onSaved) onSaved(dishId);
  });

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = seed
    ? "העריכות שלך יימחקו והמנה תחזור למה שהגיע עם האפליקציה."
    : "המנה תרד מהבורר. ארוחות שכבר תוכננו איתה יישארו שלמות, ואפשר לשחזר אותה בכל רגע.";

  wrap.append(button, note);
  return wrap;
}
