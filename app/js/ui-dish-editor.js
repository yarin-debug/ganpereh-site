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
import { dishMacros, formatMacros, MACRO_FIELDS } from "./normalize.js";
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
import { compressImage, imageUrl, putImage, deleteImage, forgetUrl } from "./images.js";

/* "ידני" הוא בדיוק המילה שמסך המאקרו מציג על מנה כזו ("מאקרו ידני") —
   אותו מושג חייב להיקרא אותו דבר בשני המסכים. */
const MACRO_SOURCES = [
  { id: "derived", label: "מהמצרכים" },
  { id: "manual", label: "ידני" },
];

/* היחידה יושבת בתווית ולא ב-placeholder: placeholder נעלם בהקלדה, ואז
   אי אפשר לדעת אם הוקלדו גרמים או קלוריות. */
const MACRO_INPUTS = [
  { id: "kcal", label: 'קק"ל' },
  { id: "protein_g", label: "חלבון (גרם)" },
  { id: "fat_g", label: "שומן (גרם)" },
  { id: "carbs_g", label: "פחמימות (גרם)" },
];

/** דריסה שיש בה מספר אחד לפחות, אבל לא את כל הארבעה. */
function isPartialOverride(override) {
  const filled = MACRO_FIELDS.filter((field) => typeof override[field] === "number");
  return filled.length > 0 && filled.length < MACRO_FIELDS.length;
}

/**
 * מה נשמר בפועל בשדה הדריסה. רק המצב הנבחר קובע — הערכים שהוקלדו
 * נשארים בטיוטה גם ב"מהמצרכים", אבל אינם נשמרים.
 */
function buildOverride(draft) {
  if (draft.macro_source !== "manual") return null;
  const out = {};
  for (const field of MACRO_FIELDS) {
    if (typeof draft.macros_override[field] === "number") out[field] = draft.macros_override[field];
  }
  return Object.keys(out).length ? out : null;
}

/* ---------- תמונת המנה ----------

   ── התמונה אינה חלק מטיוטת המנה שנשמרת ל-store ──────────────────────
   היא יושבת ב-IndexedDB תחת מזהה המנה (ראה images.js), ולכן היא נכתבת
   רק *אחרי* שהמנה נשמרה ויש לה מזהה. במנה חדשה המזהה עוד לא קיים בזמן
   הבחירה, ולכן ה-Blob ממתין בטיוטה עד השמירה. */

function buildPhotoField(dishId, draft) {
  const wrap = document.createElement("div");
  wrap.className = "field photo-field";

  const label = document.createElement("span");
  label.className = "field-label";
  label.setAttribute("aria-hidden", "true");
  label.textContent = "תמונה";

  const frame = document.createElement("div");
  frame.className = "photo-frame";

  const actions = document.createElement("div");
  actions.className = "photo-actions";

  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "act";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "act";
  remove.textContent = "הסרה";

  const note = document.createElement("p");
  note.className = "field-note";

  /* מצב ריק מכובד: מסגרת מקווקוות ומשפט שמסביר מה זה נותן, ולא ריבוע
     אפור עם אייקון שבור. אותה שפה של "לא תוכנן" בפס השבוע. */
  const draw = (url) => {
    frame.replaceChildren();
    if (url) {
      const img = document.createElement("img");
      img.className = "photo-img";
      img.alt = "";
      img.src = url;
      frame.append(img);
      frame.classList.remove("is-empty");
      pick.textContent = "החלפת תמונה";
      remove.hidden = false;
      note.textContent = "התמונה מוצגת בכרטיס היום ובבורר המנה.";
    } else {
      frame.classList.add("is-empty");
      pick.textContent = "הוספת תמונה";
      remove.hidden = true;
      note.textContent = "לא חובה. תמונה עוזרת לזהות את המנה במבט אחד בבורר.";
    }
  };

  draw(null);
  // התמונה הקיימת נטענת אסינכרונית; עד שהיא מגיעה מוצג המצב הריק.
  if (dishId) imageUrl(dishId).then((url) => draw(draft.photoRemove ? null : url));

  pick.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      note.textContent = "מכווץ…";
      const blob = await compressImage(file);
      if (!blob) {
        note.textContent = "לא הצלחנו לקרוא את הקובץ. אפשר לנסות תמונה אחרת.";
        return;
      }
      draft.photoBlob = blob;
      draft.photoRemove = false;
      draw(URL.createObjectURL(blob));
      note.textContent = "התמונה תישמר יחד עם המנה.";
    });
    document.body.append(input);
    input.click();
  });

  remove.addEventListener("click", () => {
    draft.photoBlob = null;
    draft.photoRemove = true;
    draw(null);
    note.textContent = "התמונה תוסר בשמירה.";
  });

  actions.append(pick, remove);
  wrap.append(label, frame, actions, note);
  return wrap;
}

/**
 * מחיל את שינוי התמונה אחרי שהמנה נשמרה ויש לה מזהה.
 * @returns {Promise<true|false|null>} null כשלא היה מה לעשות, false בכשל
 */
async function applyPhoto(dishId, draft) {
  if (draft.photoRemove) {
    await deleteImage(dishId);
    forgetUrl(dishId);
    return null; // מחיקה שנכשלה אינה שווה הודעה — התמונה ממילא לא תוצג
  }
  if (!draft.photoBlob) return null;

  const ok = await putImage(dishId, draft.photoBlob);
  forgetUrl(dishId);
  return ok ? null : false;
}

function blankDraft() {
  return {
    name_he: "",
    time_min: 30,
    effort: "medium",
    kosher: "parve",
    ingredients: [],
    prep_ahead: [],
    macro_source: "derived",
    macros_override: {},
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
    macro_source: dish.macros_override ? "manual" : "derived",
    macros_override: { ...(dish.macros_override || {}) },
  };
}

/**
 * טופס המנה.
 * @param {object} options
 * @param {string|null} options.dishId       קיים לעריכה, null ליצירה
 * @param {string} [options.initialName]     שם התחלתי (מגיע מהחיפוש בבורר)
 * @param {(dishId:string)=>void} [options.onSaved]
 */
export function openDishEditor({ dishId = null, initialName = "", onSaved }) {
  const store = getStore();
  const existing = dishId ? resolveDish(dishId) : null;
  const draft = existing ? draftFrom(existing) : { ...blankDraft(), name_he: initialName };

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

      const macroTitle = document.createElement("h3");
      macroTitle.className = "section-title";
      macroTitle.textContent = "מאקרו";

      const macroSource = chipGroup({
        options: MACRO_SOURCES,
        value: draft.macro_source,
        label: "מקור המאקרו",
        onChange: (id) => {
          draft.macro_source = id;
          syncMacroSource();
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
          // המשפט הזה נאמר פעם ב"אי אפשר לחשב מאקרו", וזה חדל להיות
          // מדויק ברגע שיש הקלדה ידנית: למנה במסעדה *יש* מאקרו בלי
          // מצרכים. לכן הוא מצביע עכשיו על המצב שכן פותר את זה.
          preview.textContent =
            "בלי מצרכים אין מה לחשב ואין ממה לבנות רשימת קניות. למנה שלא מבשלים בבית אפשר לבחור ידני.";
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

      /* ---------- הקלדה ידנית של המאקרו ----------

         ── שדה ריק הוא "לא יודע", ולא אפס ──────────────────────────
         המקרה שהמנגנון הזה נבנה בשבילו הוא מנה במסעדה: יודעים קלוריות
         ולא את הפירוק. לכן ריק *נמחק* מהאובייקט ולא נשמר כ-0 — המנוע
         מבדיל בין השניים (`typeof !== "number"` → partial), ואפס שמור
         היה מוצג כידע במסך המאקרו במקום כחוסר.

         ── ולמה המעבר ל"ידני" מתחיל ריק ולא מועתק מהחישוב ──────────
         כי "מאקרו ידני" הוא טענה על *מקור* המספר. מילוי מראש מהחישוב
         היה הופך מספר שנגזר ממצרכים למספר שהמשתמש כאילו הצהיר עליו,
         ומסך המאקרו היה מתייג אותו "ידני" — כלומר מייחס למשתמש נתון
         שהוא לא הקליד. */
      const manual = document.createElement("div");
      manual.className = "macro-manual";

      const manualGrid = document.createElement("div");
      manualGrid.className = "macro-manual-grid";

      const manualNote = document.createElement("p");
      manualNote.className = "field-note";

      const drawManualNote = () => {
        // סדר המשפטים אינו שרירותי: התג נצמד לסוף הטקסט, ולכן המשפט על
        // השדות הריקים הוא זה שחייב להיות אחרון — תג "חלקי" אחרי משפט
        // על רשימת הקניות נקרא כאילו הרשימה היא החלקית.
        manualNote.textContent =
          "המצרכים ממשיכים להזין את רשימת הקניות. מה שנשאר ריק נשאר בלי מידע — לא אפס.";
        // אותו תג ואותה מילה כמו בתצוגה הנגזרת וכמו במסך המאקרו, כדי
        // שיהיה ברור מראש איך המנה תסומן שם.
        if (isPartialOverride(draft.macros_override)) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "חלקי";
          manualNote.append(tag);
        }
      };

      for (const field of MACRO_INPUTS) {
        const input = numberInput({ value: draft.macros_override[field.id] ?? "", min: 0 });
        input.addEventListener("input", () => {
          const raw = input.value.trim();
          const n = Number(raw);
          if (!raw || !Number.isFinite(n) || n < 0) delete draft.macros_override[field.id];
          else draft.macros_override[field.id] = n;
          drawManualNote();
        });
        manualGrid.append(fieldLabel(field.label, input));
      }

      manual.append(manualGrid, manualNote);

      /* שתי התצוגות חיות זו לצד זו ב-DOM ומתחלפות ב-hidden: הערכים
         שהוקלדו נשארים בטיוטה גם אחרי מעבר חזרה ל"מהמצרכים", כדי
         שהקשה אחת בטעות לא תמחק הקלדה. מה שנשמר נקבע לפי המצב הנבחר
         בלבד (ראה השמירה למטה). */
      const syncMacroSource = () => {
        const isManual = draft.macro_source === "manual";
        preview.hidden = isManual;
        manual.hidden = !isManual;
        if (isManual) drawManualNote();
        else drawPreview();
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
      syncMacroSource(); // מצייר את התצוגה הנכונה מבין השתיים

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
      save.addEventListener("click", async () => {
        const trimmed = draft.name_he.trim();
        if (!trimmed) {
          error.textContent = "צריך שם למנה.";
          error.hidden = false;
          name.focus();
          return;
        }

        const id = dishId || nextDishId();

        /* ── התמונה נכתבת *לפני* המנה, וזה מכוון ────────────────────
           store.update מודיע למאזינים באופן סינכרוני, וכל המסכים
           מתרנדרים בתוך הקריאה הזו. כשהתמונה נכתבה אחריה, הרינדור
           קרה כשהיא עוד לא הייתה במסד — כלומר שומרים תמונה, וכרטיס
           היום נשאר בלי שום שינוי עד הרענון הבא.

           המזהה יציב ונגזר מראש (nextDishId טהורה), ולכן אפשר לכתוב
           לפי אותו מפתח לפני הכתיבה למצב. אם הכתיבה למצב תיכשל, יישאר
           Blob שאף מנה לא מצביעה עליו — הוא בלתי נראה, אינו נספר בשום
           מקום, ונדרס בשמירה הבאה תחת אותו מזהה. */
        const photo = await applyPhoto(id, draft);

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
            /* דריסה שלא הוקלד בה אף מספר נשמרת כ-null ולא כ-{}: אובייקט
               ריק הוא truthy, ולכן הוא היה גורם למנה לדווח 0 קק"ל ולהתייג
               "מאקרו ידני" גם כשיש לה מצרכים לגזור מהם. המשמעות למשתמש:
               בחירת "ידני" בלי להקליד כלום אינה משנה כלום. */
            macros_override: buildOverride(draft),
            archived: false,
          };
        });

        if (!ok) {
          error.textContent = "השמירה נכשלה. בדוק את הודעת המצב בראש המסך.";
          error.hidden = false;
          return;
        }

        /* התמונה יושבת במסד נפרד ולכן היא יכולה להיכשל לבדה — למשל
           כשמכסת האחסון מלאה. במקרה כזה המנה כן נשמרה, וזה מה שנאמר:
           להחזיר "השמירה נכשלה" על מנה ששמורה היה שולח את המשתמש
           להקליד הכל מחדש בחינם. */
        if (photo === false) {
          error.textContent = "המנה נשמרה, אבל התמונה לא נכנסה. ייתכן שאין מקום פנוי במכשיר.";
          error.hidden = false;
          if (onSaved) onSaved(id);
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
        buildPhotoField(dishId, draft),
        fieldLabel("שם המנה", name),
        fieldLabel("זמן הכנה בדקות", time),
        fieldGroup("מאמץ", effort),
        fieldGroup("כשרות", kosher),
        ingredientsTitle,
        rows,
        macroTitle,
        macroSource,
        preview,
        manual,
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
