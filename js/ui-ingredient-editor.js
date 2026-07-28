/* מצרכים — בורר וטופס.

   ── למה מותר לשמור מצרך בלי ערכי תזונה ──────────────────────────────
   כי מנוע הנרמול כבר בנוי לומר "אני לא יודע" במקום לנחש. מצרך בלי
   nutrition_per_100 מסמן את המנה כחלקית, ומצרך בלי unit_weight_g נופל
   למסלול "לבדוק ידנית" ברשימת הקניות עם הכמות המקורית. שני המסלולים
   האלה נבדקים, ולכן הדרישה היחידה כאן היא שם.

   לחייב מילוי של ארבעה ערכים תזונתיים כדי להוסיף "פטרוזיליה" היה
   גורם לאנשים להמציא מספרים — וזה בדיוק מה שמנוע כזה נועד למנוע. */

import { getStore } from "./store.js";
import {
  BASE_UNITS,
  KOSHER_TYPES,
  SHELVES,
  listIngredients,
  resolveIngredient,
  isSeedIngredient,
  nextIngredientId,
  shelfName,
  unitLabel,
} from "./catalog.js";
import {
  openOverlay,
  fieldLabel,
  fieldGroup,
  textInput,
  numberInput,
  chipGroup,
  errorLine,
} from "./ui-overlay.js";

const NUTRITION_FIELDS = [
  { key: "kcal", label: "קלוריות" },
  { key: "protein_g", label: "חלבון" },
  { key: "fat_g", label: "שומן" },
  { key: "carbs_g", label: "פחמימות" },
];

const SHELF_OPTIONS = SHELVES.map((shelf) => ({ id: shelf.id, label: shelf.name_he }));

/** תיאור משני למצרך ברשימה: מדף ויחידת בסיס. */
function ingredientMeta(ing) {
  const parts = [shelfName(ing.shelf), unitLabel(ing.base_unit)];
  if (!ing.nutrition_per_100) parts.push("בלי ערכי תזונה");
  return parts.join(" · ");
}

/**
 * בורר מצרך. שדה חיפוש כי הרשימה גדלה עם כל מצרך שמוסיפים, ושלושים
 * שורות בלי סינון הן גלילה ולא בחירה.
 */
export function openIngredientPicker({ onSelect, exclude = [] }) {
  return openOverlay({
    label: "בחירת מצרך",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "איזה מצרך?";

      const search = textInput({ placeholder: "חיפוש", autofocus: true });
      search.type = "search";

      const results = document.createElement("div");
      results.className = "sheet-options";

      const taken = new Set(exclude);

      const draw = () => {
        const query = search.value.trim();
        const matches = listIngredients().filter((ing) => {
          if (taken.has(ing.id)) return false;
          if (!query) return true;
          return (
            ing.name_he.includes(query) ||
            (ing.aliases || []).some((alias) => alias.includes(query))
          );
        });

        results.replaceChildren();

        if (!matches.length) {
          const empty = document.createElement("p");
          empty.className = "empty";
          empty.textContent = query
            ? `אין מצרך בשם "${query}". אפשר להוסיף אותו.`
            : "כל המצרכים כבר במנה.";
          results.append(empty);
          return;
        }

        for (const ing of matches) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "dish-card";

          const name = document.createElement("span");
          name.className = "dish-card-name";
          name.textContent = ing.name_he;

          const meta = document.createElement("span");
          meta.className = "dish-card-meta";
          meta.textContent = ingredientMeta(ing);
          name.append(meta);

          card.append(name);
          card.addEventListener("click", () => {
            onSelect(ing.id);
            handle.close();
          });
          results.append(card);
        }
      };

      search.addEventListener("input", draw);
      draw();

      const create = document.createElement("button");
      create.type = "button";
      create.className = "sheet-action";
      create.textContent = "מצרך חדש";
      create.addEventListener("click", () =>
        openIngredientEditor({
          ingredientId: null,
          // השם שכבר הוקלד בחיפוש הוא כמעט תמיד השם של המצרך החדש.
          initialName: search.value.trim(),
          onSaved: (id) => {
            onSelect(id);
            handle.close();
          },
        }),
      );

      const close = document.createElement("button");
      close.type = "button";
      close.className = "sheet-close";
      close.textContent = "ביטול";
      close.addEventListener("click", () => handle.close());

      panel.append(heading, search, results, create, close);
    },
  });
}

/**
 * טופס מצרך.
 * @param {object} options
 * @param {string|null} options.ingredientId  קיים לעריכה, null ליצירה
 * @param {string} [options.initialName]
 * @param {(id:string)=>void} options.onSaved
 */
export function openIngredientEditor({ ingredientId = null, initialName = "", onSaved }) {
  const store = getStore();
  const existing = ingredientId ? resolveIngredient(ingredientId) : null;

  const draft = {
    name_he: existing ? existing.name_he : initialName,
    base_unit: existing ? existing.base_unit : "g",
    shelf: existing ? existing.shelf : "produce",
    kosher: existing ? existing.kosher : "parve",
    unit_weight_g: existing ? existing.unit_weight_g : null,
    pantry_staple: existing ? existing.pantry_staple : false,
    nutrition: existing && existing.nutrition_per_100 ? { ...existing.nutrition_per_100 } : {},
  };

  return openOverlay({
    label: existing ? `עריכת ${existing.name_he}` : "מצרך חדש",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = existing ? "עריכת מצרך" : "מצרך חדש";

      const name = textInput({ value: draft.name_he, autofocus: !draft.name_he });
      name.addEventListener("input", () => {
        draft.name_he = name.value;
      });

      const unit = chipGroup({
        options: BASE_UNITS,
        value: draft.base_unit,
        label: "יחידת בסיס",
        onChange: (id) => {
          draft.base_unit = id;
          syncUnitWeight();
        },
      });

      const shelf = chipGroup({
        options: SHELF_OPTIONS,
        value: draft.shelf,
        label: "מדף בסופר",
        onChange: (id) => {
          draft.shelf = id;
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

      const unitWeight = numberInput({ value: draft.unit_weight_g, placeholder: "לא ידוע" });
      unitWeight.addEventListener("input", () => {
        const n = Number(unitWeight.value);
        draft.unit_weight_g = unitWeight.value && Number.isFinite(n) && n > 0 ? n : null;
      });
      const unitWeightField = fieldLabel("משקל יחידה אחת בגרמים", unitWeight);
      const unitWeightNote = document.createElement("p");
      unitWeightNote.className = "field-note";
      unitWeightNote.textContent =
        'בלי זה, מתכון שנוקב "2 יחידות" יופיע ברשימת הקניות כפריט לבדיקה ידנית במקום להיסכם בגרמים.';
      unitWeightField.append(unitWeightNote);

      // ההמרה בין ספירה למשקל רלוונטית רק כשהבסיס הוא משקל.
      const syncUnitWeight = () => {
        unitWeightField.hidden = draft.base_unit !== "g";
      };
      syncUnitWeight();

      const nutritionTitle = document.createElement("h3");
      nutritionTitle.className = "section-title";
      nutritionTitle.textContent = "ערכים ל-100 (לא חובה)";

      const nutritionGrid = document.createElement("div");
      nutritionGrid.className = "field-grid";
      for (const field of NUTRITION_FIELDS) {
        const input = numberInput({ value: draft.nutrition[field.key], placeholder: "—" });
        input.addEventListener("input", () => {
          const n = Number(input.value);
          if (input.value !== "" && Number.isFinite(n) && n >= 0) draft.nutrition[field.key] = n;
          else delete draft.nutrition[field.key];
        });
        nutritionGrid.append(fieldLabel(field.label, input));
      }

      const nutritionNote = document.createElement("p");
      nutritionNote.className = "field-note";
      nutritionNote.textContent =
        "אפשר להשאיר ריק או למלא חלקית. מנה שמכילה מצרך בלי ערכים מלאים תסומן במסך המאקרו כחלקית, ולא תוצג כאילו היא מחושבת עד הסוף.";

      const staple = document.createElement("button");
      staple.type = "button";
      const syncStaple = () => {
        staple.className = draft.pantry_staple ? "chip is-on" : "chip";
        staple.setAttribute("aria-pressed", draft.pantry_staple ? "true" : "false");
      };
      staple.textContent = "תמיד יש בבית";
      syncStaple();
      staple.addEventListener("click", () => {
        draft.pantry_staple = !draft.pantry_staple;
        syncStaple();
      });
      const stapleWrap = document.createElement("div");
      stapleWrap.className = "chips";
      stapleWrap.append(staple);

      const error = errorLine("");
      error.hidden = true;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "act act-wide act-primary";
      save.textContent = "שמירה";
      save.addEventListener("click", () => {
        const trimmed = draft.name_he.trim();
        if (!trimmed) {
          error.textContent = "צריך שם למצרך.";
          error.hidden = false;
          name.focus();
          return;
        }

        const id = ingredientId || nextIngredientId();
        const saved = store.update((s) => {
          s.ingredients[id] = {
            ...(s.ingredients[id] || {}),
            id,
            name_he: trimmed,
            aliases: existing ? existing.aliases || [] : [],
            base_unit: draft.base_unit,
            unit_weight_g: draft.base_unit === "g" ? draft.unit_weight_g : null,
            density_g_per_ml: existing ? existing.density_g_per_ml : null,
            shelf: draft.shelf,
            kosher: draft.kosher,
            pantry_staple: draft.pantry_staple,
            gtin: existing ? existing.gtin || null : null,
            nutrition_per_100: Object.keys(draft.nutrition).length ? { ...draft.nutrition } : null,
            archived: false,
          };
        });

        if (!saved) {
          error.textContent = "השמירה נכשלה. בדוק את הודעת המצב בראש המסך.";
          error.hidden = false;
          return;
        }
        handle.close();
        onSaved(id);
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(
        heading,
        fieldLabel("שם", name),
        fieldGroup("נמדד ב", unit),
        unitWeightField,
        fieldGroup("מדף בסופר", shelf),
        fieldGroup("כשרות", kosher),
        stapleWrap,
        nutritionTitle,
        nutritionGrid,
        nutritionNote,
        error,
        save,
        cancel,
      );

      if (existing && !isSeedIngredient(ingredientId)) {
        panel.append(buildArchive(store, ingredientId, existing, handle));
      }
    },
  });
}

/** ארכיון למצרך משתמש. מצרך זרע נשאר — הוא חלק מהמנות המוכנות. */
function buildArchive(store, id, ingredient, handle) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-danger";
  button.textContent = "העברה לארכיון";
  button.addEventListener("click", () => {
    store.update((s) => {
      if (s.ingredients[id]) s.ingredients[id].archived = true;
    });
    handle.close();
  });
  return button;
}
