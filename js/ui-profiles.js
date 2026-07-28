/* טופס הפרופיל — שם ויעדי מאקרו.

   הפרופילים נזרעו מ-DEFAULT_PROFILES ולא היה שום מסך שנוגע בהם: לא
   שם, לא יעד, ולא מספר האנשים במשק הבית. כאן זה נסגר.

   היעדים חיים לצד המספרים שהם נמדדים מולם, ולכן העריכה יושבת במסך
   המאקרו ולא במסך הגדרות נפרד. מסך הגדרות הוא מקום שצריך לזכור
   שהוא קיים. */

import { getStore } from "./store.js";
import { activeProfiles, blankTargets, nextProfileId, removeEaterFromSlots } from "./profiles.js";
import { openOverlay, fieldLabel, textInput, numberInput, errorLine } from "./ui-overlay.js";

const TARGET_FIELDS = [
  { key: "kcal", label: "קלוריות" },
  { key: "protein_g", label: "חלבון (גרם)" },
  { key: "fat_g", label: "שומן (גרם)" },
  { key: "carbs_g", label: "פחמימות (גרם)" },
];

/**
 * טופס פרופיל.
 * @param {object} options
 * @param {string|null} options.profileId  קיים לעריכה, null להוספה
 * @param {() => void} [options.onSaved]
 */
export function openProfileEditor({ profileId = null, onSaved }) {
  const store = getStore();
  const existing = profileId ? store.state.profiles.find((p) => p.id === profileId) : null;

  const draft = {
    name_he: existing ? existing.name_he : "",
    targets: existing ? { ...existing.targets } : blankTargets(),
  };

  return openOverlay({
    label: existing ? `עריכת ${existing.name_he}` : "הוספת אדם",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = existing ? "עריכת פרופיל" : "אדם חדש";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "היעדים הם ליום אחד. הסיכום השבועי מכפיל אותם במספר הימים שנאכלו.";

      const name = textInput({ value: draft.name_he, autofocus: true });
      name.addEventListener("input", () => {
        draft.name_he = name.value;
      });

      const targetsTitle = document.createElement("h3");
      targetsTitle.className = "section-title";
      targetsTitle.textContent = "יעדים יומיים";

      const grid = document.createElement("div");
      grid.className = "field-grid";
      for (const field of TARGET_FIELDS) {
        const input = numberInput({ value: draft.targets[field.key] || "", placeholder: "—" });
        input.addEventListener("input", () => {
          const value = Number(input.value);
          draft.targets[field.key] =
            input.value !== "" && Number.isFinite(value) && value >= 0 ? value : 0;
        });
        grid.append(fieldLabel(field.label, input));
      }

      const note = document.createElement("p");
      note.className = "field-note";
      note.textContent =
        'אפשר להשאיר ריק. שדה בלי יעד מוצג במסך המאקרו כ"אין יעד מוגדר" במקום להשוות מול אפס.';

      const error = errorLine("");
      error.hidden = true;

      const save = document.createElement("button");
      save.type = "button";
      save.className = "act act-wide act-primary";
      save.textContent = "שמירה";
      save.addEventListener("click", () => {
        const trimmed = draft.name_he.trim();
        if (!trimmed) {
          error.textContent = "צריך שם.";
          error.hidden = false;
          name.focus();
          return;
        }

        const ok = store.update((s) => {
          const target = profileId ? s.profiles.find((p) => p.id === profileId) : null;
          if (target) {
            target.name_he = trimmed;
            target.targets = { ...draft.targets };
            return;
          }
          s.profiles.push({
            id: nextProfileId(s.profiles),
            name_he: trimmed,
            targets: { ...draft.targets },
            dislikes: [],
            archived: false,
          });
        });

        if (!ok) {
          error.textContent = "השמירה נכשלה. בדוק את הודעת המצב בראש המסך.";
          error.hidden = false;
          return;
        }
        handle.close();
        if (onSaved) onSaved();
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(
        heading,
        sub,
        fieldLabel("שם", name),
        targetsTitle,
        grid,
        note,
        error,
        save,
        cancel,
      );

      if (existing) panel.append(buildArchive(store, profileId, handle, onSaved));
    },
  });
}

/** הוצאה ממשק הבית. הנימוק המלא לארכיון-ולא-מחיקה נמצא ב-profiles.js. */
function buildArchive(store, profileId, handle, onSaved) {
  const wrap = document.createElement("div");
  const active = activeProfiles(store.state.profiles);

  // בלי אף אחד במשק הבית אין למי לתכנן, ואין ממי לחשב מאקרו.
  if (active.length <= 1) return wrap;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-danger";
  button.textContent = "הוצאה ממשק הבית";
  button.addEventListener("click", () => {
    store.update((s) => {
      const target = s.profiles.find((p) => p.id === profileId);
      if (target) target.archived = true;
      s.plan.slots = removeEaterFromSlots(s.plan.slots, profileId, s.plan.week_start);
    });
    handle.close();
    if (onSaved) onSaved();
  });

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent =
    "הוא יורד מהתכנון של השבוע הזה והלאה, וארוחה שתוכננה רק בשבילו נמחקת. שבועות שעברו נשארים כמו שהם, כדי שהמאקרו שלהם יישאר נכון. אפשר להחזיר אותו בכל רגע.";

  wrap.append(button, note);
  return wrap;
}
