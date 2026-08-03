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
import { dishRole, KINDS, rolesOfKind } from "./compose.js";
import {
  ROLES,
  EFFORTS,
  KOSHER_TYPES,
  BASE_UNITS,
  resolveDish,
  resolveIngredient,
  isSeedDish,
  nextDishId,
  unitLabel,
} from "./catalog.js";
import { dishMacros, formatMacros, coerceMacroOverride } from "./normalize.js";
import { activeProfiles, dislikedBy, setDislikes } from "./profiles.js";
import {
  openOverlay,
  fieldLabel,
  fieldGroup,
  textInput,
  textArea,
  numberInput,
  chipGroup,
  chipToggleGroup,
  errorLine,
} from "./ui-overlay.js";
import { openIngredientPicker } from "./ui-ingredient-editor.js";
import { compressImage, imageUrl, putImage, deleteImage, forgetUrl } from "./images.js";

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

/* ---------- דריסת מאקרו ידנית ----------

   ── למה זה קיים בכלל ────────────────────────────────────────────────
   המנוע תמך ב-macros_override מההתחלה, ואף מסך לא קבע אותו. המקרה
   האמיתי הוא מנה שיודעים עליה מספר אחד ולא את הפירוק — מנה מהמסעדה,
   או מתכון של מישהו אחר. בלי המסלול הזה הדרך היחידה להזין אותה הייתה
   להמציא רשימת מצרכים, וזו בדיוק ההמצאה שכל המנוע נבנה כדי למנוע. */

const OVERRIDE_FIELDS = [
  { key: "kcal", label: "קלוריות" },
  { key: "protein_g", label: "חלבון (גרם)" },
  { key: "fat_g", label: "שומן (גרם)" },
  { key: "carbs_g", label: "פחמימות (גרם)" },
];

/** אותם שדות, בניסוח של משפט ולא של תווית טופס. */
const MACRO_PARTS = [
  { key: "kcal", label: 'קק"ל' },
  { key: "protein_g", label: "גרם חלבון" },
  { key: "fat_g", label: "גרם שומן" },
  { key: "carbs_g", label: "גרם פחמימות" },
];

function buildOverrideField(draft, onChange) {
  const details = document.createElement("details");
  details.className = "pantry-group";

  const summary = document.createElement("summary");
  summary.textContent = "ערכים ידניים";
  details.append(summary);

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent =
    "לא חובה. שימושי כשיודעים את הערכים של המנה עצמה — למשל מנה מהמסעדה — ולא את הפירוק למצרכים. אפשר למלא רק חלק; שדה שיישאר ריק לא יושלם באפס.";

  const grid = document.createElement("div");
  grid.className = "field-grid";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "sheet-close";
  clear.textContent = "חזרה לחישוב מהמצרכים";

  const syncClear = () => {
    clear.hidden = !coerceMacroOverride(draft.macros_override);
  };

  const inputs = [];
  for (const field of OVERRIDE_FIELDS) {
    const current = draft.macros_override ? draft.macros_override[field.key] : "";
    const input = numberInput({
      value: current === null || current === undefined ? "" : current,
      placeholder: "—",
    });
    input.addEventListener("input", () => {
      draft.macros_override = { ...(draft.macros_override || {}), [field.key]: input.value };
      syncClear();
      onChange();
    });
    inputs.push(input);
    grid.append(fieldLabel(field.label, input));
  }

  clear.addEventListener("click", () => {
    draft.macros_override = null;
    for (const input of inputs) input.value = "";
    syncClear();
    onChange();
  });

  syncClear();
  // נפתח מראש רק כשכבר יש מה להראות. סקציה מקופלת היא מה שאומר
  // "אופציונלי" בלי לכתוב את זה — פתוחה היא הייתה נקראת כשדה חסר.
  details.open = !!coerceMacroOverride(draft.macros_override);
  details.append(note, grid, clear);
  return details;
}

function blankDraft() {
  return {
    name_he: "",
    role: "main",
    time_min: 30,
    effort: "medium",
    kosher: "parve",
    ingredients: [],
    steps: [],
    prep_ahead: [],
    macros_override: null,
  };
}

function draftFrom(dish) {
  return {
    name_he: dish.name_he,
    role: dishRole(dish),
    time_min: dish.time_min,
    effort: dish.effort,
    kosher: dish.kosher,
    ingredients: dish.ingredients.map((entry) => ({ ...entry })),
    steps: [...(dish.steps || [])],
    prep_ahead: [...(dish.prep_ahead || [])],
    macros_override: dish.macros_override ? { ...dish.macros_override } : null,
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

  /* מי לא אוהב את המנה יושב על *הפרופילים*, לא על המנה, ולכן הוא נאסף
     בנפרד ונכתב בנפרד. הטופס הוא המקום הנכון לערוך אותו למרות זה:
     כאן כבר מסתכלים על המנה, ובמסך הפרופיל היה צריך לבחור אותה מתוך
     רשימה של עשרות. */
  const household = activeProfiles(store.state.profiles);
  draft.dislikedBy = dishId ? dislikedBy(store.state.profiles, dishId).map((p) => p.id) : [];

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

      /* התפקיד קובע באיזו קבוצה המנה מופיעה בבורר ההרכבה, ולכן הוא
         יושב מיד מתחת לשם: זו שאלת זהות, לא פרט טכני.

         חמשת התפקידים מוצגים תחת שתי הכותרות שהבורר עצמו נחלק אליהן.
         בלי זה הבחירה בטופס ("ירק וסלט") והמסננת בבורר ("תוספות") היו
         נראות כשתי מערכות שונות, ולא כשתי רמות של אותה אחת. */
      const role = chipGroup({
        sections: KINDS.map((kind) => ({ label: kind.label, options: rolesOfKind(kind.id) })),
        value: draft.role,
        label: "תפקיד בארוחה",
        onChange: (id) => {
          draft.role = id;
        },
      });
      const roleField = fieldGroup("תפקיד בארוחה", role);
      const roleNote = document.createElement("p");
      roleNote.className = "field-note";
      roleNote.textContent = "מנה שלמה עומדת לבד. השאר מורכבים זה עם זה בצלחת אחת.";
      roleField.append(roleNote);

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

      /* שדה שלא הוזן בדריסה מוצג "—" ולא "0".
         dishMacros ממלא את החסר באפס ומסמן את התוצאה "חלקי" בדיוק כדי
         שלא ייקרא כידע — אבל הסימון לא שווה כלום אם המסך בכל זאת מדפיס
         "0 גרם חלבון", כי מה שקוראים הוא "אין במנה הזו חלבון". הסימון
         והתצוגה חייבים לומר את אותו דבר. */
      const macroSentence = (macros, known) => {
        const values = formatMacros(macros);
        const parts = MACRO_PARTS.map(({ key, label }) =>
          known && !(key in known) ? `— ${label}` : `${values[key]} ${label}`,
        );
        return `למנה: ${parts.join(" · ")}`;
      };

      const drawPreview = () => {
        preview.replaceChildren();
        const override = coerceMacroOverride(draft.macros_override);

        if (!override && !draft.ingredients.length) {
          preview.textContent = "בלי מצרכים אי אפשר לחשב מאקרו או לבנות רשימת קניות.";
          return;
        }

        const macros = dishMacros({ ...draft, macros_override: override }, resolveIngredient);
        preview.append(document.createTextNode(macroSentence(macros, override)));

        if (macros.partial) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "חלקי";
          preview.append(tag);
        }

        /* איזה מספר גובר נאמר במילים ולא בצבע — אותו כלל של טבלת
           הייבוא. שני מספרים באותו מסך בלי משפט שמסביר מי מהם בשימוש
           הם בדיוק המקום שבו מסתכלים על הלא-נכון. */
        if (override) {
          const source = document.createElement("span");
          source.className = "macro-source";
          source.textContent = draft.ingredients.length
            ? `הערכים הידניים גוברים. לפי המצרכים היה יוצא ${
                formatMacros(dishMacros({ ...draft, macros_override: null }, resolveIngredient))
                  .kcal
              } קק"ל.`
            : "הערכים הידניים גוברים. אין מצרכים, ולכן גם לא תהיה רשימת קניות למנה הזו.";
          preview.append(source);
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

      /* המתכון — שורה לכל צעד.
         הוא יושב מתחת למצרכים כי זה סדר הבישול: קודם מה נכנס, אחר כך
         מה עושים איתו. השדה כולו לא חובה, בדיוק כמו ערכי התזונה של
         מצרך: מנה שכולם יודעים להכין לא צריכה הוראות, וחיוב היה גורם
         להקליד "לבשל" רק כדי לעבור הלאה. */
      const steps = textArea({
        value: draft.steps.join("\n"),
        placeholder: "שורה לכל צעד",
        rows: 5,
      });
      steps.addEventListener("input", () => {
        draft.steps = steps.value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      });
      const stepsField = fieldLabel("מתכון (לא חובה)", steps);
      const stepsNote = document.createElement("p");
      stepsNote.className = "field-note";
      stepsNote.textContent = "שורה לכל צעד. נפתח מכרטיס היום כשמבשלים.";
      stepsField.append(stepsNote);

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

      /* סימון ולא חסימה. מנה שמישהו לא אוהב נשארת בבורר ואפשר לתכנן
         אותה — לפעמים אותו אדם לא אוכל בבית באותו ערב. מה שהסימון כן
         עושה: מוריד אותה מההצעות, כי הצעה היא המלצה. */
      const dislikeField = household.length
        ? fieldGroup(
            "מי לא אוהב את זה",
            chipToggleGroup({
              options: household.map((profile) => ({ id: profile.id, label: profile.name_he })),
              values: draft.dislikedBy,
              label: "מי לא אוהב את זה",
              onChange: (ids) => {
                draft.dislikedBy = ids;
              },
            }),
          )
        : null;

      if (dislikeField) {
        const dislikeNote = document.createElement("p");
        dislikeNote.className = "field-note";
        dislikeNote.textContent =
          "לא חובה, ואפשר לסמן כמה. המנה תישאר בבורר עם הערה — היא רק תפסיק לעלות בהצעות.";
        dislikeField.append(dislikeNote);
      }

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
            role: draft.role,
            kosher: draft.kosher,
            effort: draft.effort,
            time_min: draft.time_min,
            ingredients: draft.ingredients.map((entry) => ({ ...entry })),
            steps: [...draft.steps],
            prep_ahead: [...draft.prep_ahead],
            tags: existing ? existing.tags || [] : [],
            macros_override: coerceMacroOverride(draft.macros_override),
            archived: false,
          };
          // ההעדפות יושבות על הפרופילים, אבל נכתבות באותה פעולה: שמירה
          // שמעדכנת מנה ומשאירה את הסימון הישן הייתה מציגה בבורר משהו
          // שהמשתמש כבר שינה בטופס.
          s.profiles = setDislikes(s.profiles, id, draft.dislikedBy);
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
        roleField,
        fieldLabel("זמן הכנה בדקות", time),
        fieldGroup("מאמץ", effort),
        fieldGroup("כשרות", kosher),
        ingredientsTitle,
        rows,
        preview,
        // הדריסה יושבת מיד אחרי התצוגה המקדימה, כי היא מתייחסת אליה.
        buildOverrideField(draft, drawPreview),
        stepsField,
        prepField,
      );
      if (dislikeField) panel.append(dislikeField);
      panel.append(error, save, cancel);

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
