/* האפיון הראשוני — שבע שאלות, אחת למסך.

   ── שלוש החלטות עיצוב שקל להפוך ────────────────────────────────────

   1. **מד ההתקדמות הוא פס השבוע.**
      שבע שאלות, שבעה ימים — ולכן המד אינו פס התקדמות גנרי אלא אותה
      שפת צורות בדיוק: מקווקו = טרם נענתה, מסגרת קובלט = כאן אנחנו
      עכשיו, אריח רך עם וי = נענתה. זו לא חמידות. המשתמש פוגש את
      אוצר המילים הוויזואלי של האפליקציה *לפני* שהוא רואה את מסך
      השבוע, וכשהוא מגיע לשם הצורות כבר אומרות לו משהו.

   2. **מילוי מלא אחד בכל שלב, והכלל לא נשבר.**
      בכל מסך כאן יש בדיוק פעולה אחת שצריך לעשות עכשיו — לענות
      ולהמשיך — ולכן "ממשיכים" לובש את החרס. הצ'יפים של התשובות
      נבחרים בקובלט (`.chip.is-on` הקיים), לא בחרס. שני מילויים
      במסך אחד היו הופכים את "בחרתי" ואת "קדימה" לאותו משקל.

   3. **דילוג הוא מסלול ראשי, לא נטישה.**
      אפליקציה ביתית שדורשת שבע תשובות לפני שהיא מראה משהו היא
      אפליקציה שלא נפתחת פעם שנייה. הדילוג מפורש בכל שלב, והוא כותב
      ברירות מחדל שקופות שאפשר לשנות אחר כך בכל מסך. */

import {
  COOK_TIMES,
  DISLIKE_SUGGESTIONS,
  GOALS,
  defaultHousehold,
  profilesFromNames,
  targetsForGoal,
} from "./onboarding.js";
import { MEALS } from "./plan.js";
import { isoLocal } from "./store.js";
import { syncConfigured } from "./config.js";
import { chipGroup, fieldLabel, numberInput, textInput } from "./ui-overlay.js";

const TARGET_FIELDS = [
  { key: "kcal", label: "קלוריות" },
  { key: "protein_g", label: "חלבון (ג׳)" },
  { key: "fat_g", label: "שומן (ג׳)" },
  { key: "carbs_g", label: "פחמימות (ג׳)" },
];

/* ---------- הטיוטה ---------- */

function newDraft() {
  const base = defaultHousehold();
  return {
    names: [""], // [0] הוא מי שממלא; השאר נוספים בשאלה השנייה
    meals: base.meals.slice(),
    cook_time: base.cook_time,
    dislikes: [],
    goal: base.goal,
    targets: [], // מקביל ל-names, נזרע מהמטרה בשאלה האחרונה
    targetsSeededFor: null,
    seeded: false, // האם שאלת משק הבית כבר פתחה שורה ריקה
  };
}

/** השמות שיהפכו לפרופילים. ריקים נופלים כאן ולא בשכבת הנתונים. */
function realNames(draft) {
  return draft.names.map((name) => name.trim()).filter(Boolean);
}

/**
 * זורע את היעדים מהמטרה — אבל רק כשהמטרה השתנתה.
 *
 * בלי התנאי, כל חזרה קדימה לשאלה האחרונה הייתה מוחקת מספרים שהמשתמש
 * הקליד ביד. עם התנאי, שינוי מטרה אכן מרענן אותם, וזה מה שהוא ביקש.
 */
function seedTargets(draft) {
  if (draft.targetsSeededFor === draft.goal) return;
  draft.targets = realNames(draft).map(() => targetsForGoal(draft.goal));
  draft.targetsSeededFor = draft.goal;
}

/* ---------- לבנים ---------- */

function questionHead(title, help) {
  const wrap = document.createElement("div");

  const heading = document.createElement("h1");
  heading.className = "ob-q";
  heading.textContent = title;
  // המיקוד נכנס לכותרת בכל מעבר שלב, ולכן היא חייבת להיות ממוקדת-יכולה.
  heading.tabIndex = -1;
  wrap.append(heading);

  if (help) {
    const p = document.createElement("p");
    p.className = "ob-help";
    p.textContent = help;
    wrap.append(p);
  }
  return wrap;
}

/**
 * קבוצת בחירה מרובה. `chipGroup` שב-ui-overlay הוא בחירה יחידה
 * (radiogroup), וכאן צריך סמנטיקה אחרת: כל צ'יפ הוא מתג בפני עצמו.
 */
function toggleChips({ options, selected, onToggle, label }) {
  const group = document.createElement("div");
  group.className = "chips";
  group.setAttribute("role", "group");
  if (label) group.setAttribute("aria-label", label);

  for (const option of options) {
    const on = selected.includes(option.id);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = on ? "chip is-on" : "chip";
    chip.textContent = option.label;
    chip.setAttribute("aria-pressed", on ? "true" : "false");
    chip.addEventListener("click", () => onToggle(option.id));
    group.append(chip);
  }
  return group;
}

/* ---------- השאלות ----------
   `blocked` הוא הדבר היחיד שעוצר את "ממשיכים", והוא שמור לשאלה אחת:
   משק בית בלי אף שם. כל השאר אפשר לעבור בלי לגעת — לשאלה שלא נענתה
   יש ברירת מחדל מוצהרת, וזה עדיף על טופס שנועל את הדרך פנימה. */

const STEPS = [
  {
    id: "me",
    blocked: (draft) => (realNames(draft).length ? null : "צריך שם אחד לפחות."),
    build(draft, rerender) {
      const wrap = document.createElement("div");
      wrap.append(
        questionHead("איך קוראים לך?", "השם מופיע בתכנון ובמסך המאקרו. אפשר לשנות אותו בכל רגע."),
      );

      const input = textInput({ value: draft.names[0] || "", placeholder: "השם שלך" });
      input.dataset.focusKey = "ob-name-0";
      input.addEventListener("input", () => {
        draft.names[0] = input.value;
        rerender({ keepFocus: true });
      });
      wrap.append(fieldLabel("שם", input));
      return wrap;
    },
  },

  {
    id: "household",
    build(draft, rerender) {
      /* שורה ריקה אחת מחכה מראש: שאלה שאין בה שדה לענות בו דורשת
         ללחוץ "הוספת אדם" רק כדי להתחיל, וזה חיכוך בלי תמורה.
         פעם אחת בלבד — בלי הדגל, "הסרה" של השורה האחרונה הייתה
         מחזירה אותה מיד, וכפתור שלא עושה כלום גרוע מכפתור חסר. */
      if (!draft.seeded) {
        draft.seeded = true;
        draft.names.push("");
      }

      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "מי עוד אוכל כאן?",
          "כל אדם מקבל יעדים משלו, והמאקרו מחלק את המנות לפי מי אכל. אפשר להוסיף עוד בהמשך.",
        ),
      );

      const list = document.createElement("div");
      list.className = "ob-people";

      // מתחילים מ-1: המקום הראשון שייך למי שממלא, והוא נשאל קודם.
      for (let i = 1; i < draft.names.length; i++) {
        const row = document.createElement("div");
        row.className = "ob-person";

        const input = textInput({ value: draft.names[i], placeholder: "שם" });
        input.dataset.focusKey = `ob-name-${i}`;
        input.setAttribute("aria-label", `שם של אדם ${i + 1}`);
        input.addEventListener("input", () => {
          draft.names[i] = input.value;
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ob-person-x";
        remove.textContent = "הסרה";
        remove.setAttribute("aria-label", `הסרת ${draft.names[i].trim() || `אדם ${i + 1}`}`);
        remove.addEventListener("click", () => {
          draft.names.splice(i, 1);
          rerender();
        });

        row.append(input, remove);
        list.append(row);
      }

      const add = document.createElement("button");
      add.type = "button";
      add.className = "act ob-add";
      add.textContent = "הוספת אדם";
      add.addEventListener("click", () => {
        draft.names.push("");
        rerender({ focusKey: `ob-name-${draft.names.length - 1}` });
      });

      wrap.append(list, add);

      // הערה זו מופיעה רק כשהסנכרון מוגדר בפועל. הבטחה על שיתוף
      // באפליקציה שעובדת מקומית בלבד היא הבטחה שלא תתקיים.
      if (syncConfigured()) {
        const note = document.createElement("p");
        note.className = "ob-note";
        note.textContent =
          "שם כאן יוצר פרופיל בתכנון. כדי לפתוח את אותה תוכנית גם מהטלפון שלהם, כתובת הגוגל שלהם צריכה להיות רשומה למשק הבית — הגדרה חד-פעמית.";
        wrap.append(note);
      }

      return wrap;
    },
  },

  {
    id: "meals",
    build(draft, rerender) {
      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "אילו ארוחות לתכנן?",
          "מה שלא מסומן פשוט לא יופיע בשבוע. ארוחה שכבר תוכננה נשארת גלויה גם אם כיבית אותה כאן.",
        ),
      );

      wrap.append(
        toggleChips({
          label: "ארוחות לתכנון",
          options: MEALS.map((meal) => ({ id: meal.id, label: meal.label })),
          selected: draft.meals,
          onToggle: (id) => {
            const next = draft.meals.includes(id)
              ? draft.meals.filter((m) => m !== id)
              : [...draft.meals, id];
            // ארוחה אחת לפחות: שבוע בלי אף משבצת אינו מסך שאפשר לתכנן בו.
            if (next.length) draft.meals = next;
            rerender();
          },
        }),
      );
      return wrap;
    },
  },

  {
    id: "time",
    build(draft) {
      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "כמה זמן לבישול ביום רגיל?",
          "מנות שנכנסות בזמן הזה יעלו לראש בורר המנות. מה שחורג עדיין שם — רק נמוך יותר.",
        ),
      );

      wrap.append(
        chipGroup({
          label: "תקציב זמן לבישול",
          options: COOK_TIMES.map((entry) => ({ id: entry.id, label: entry.label })),
          value: draft.cook_time,
          onChange: (id) => {
            draft.cook_time = id;
          },
        }),
      );
      return wrap;
    },
  },

  {
    id: "dislikes",
    build(draft, rerender) {
      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "מה לא אוכלים כאן?",
          "מנה שמכילה את זה תסומן בבורר ותרד לסוף — אבל לא תיעלם. אורח שכן אוכל את זה הוא סיבה טובה לבשל.",
        ),
      );

      const chosen = draft.dislikes;
      const options = [...DISLIKE_SUGGESTIONS];
      // מה שהוקלד ביד מצטרף לרשימת הצ'יפים, אחרת הוא היה נעלם מהמסך
      // מיד אחרי ההוספה ואי אפשר היה לבטל אותו.
      for (const value of chosen) if (!options.includes(value)) options.push(value);

      wrap.append(
        toggleChips({
          label: "מה לא אוכלים",
          options: options.map((value) => ({ id: value, label: value })),
          selected: chosen,
          onToggle: (value) => {
            draft.dislikes = chosen.includes(value)
              ? chosen.filter((entry) => entry !== value)
              : [...chosen, value];
            rerender();
          },
        }),
      );

      const row = document.createElement("div");
      row.className = "ob-add-row";

      const input = textInput({ placeholder: "משהו אחר" });
      input.dataset.focusKey = "ob-dislike";
      const submit = () => {
        const value = input.value.trim();
        if (!value || chosen.includes(value)) return;
        draft.dislikes = [...chosen, value];
        rerender({ focusKey: "ob-dislike" });
      };
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        // בלי זה ה-Enter היה מפעיל את "ממשיכים" ומדלג על השאלה.
        event.preventDefault();
        submit();
      });

      const add = document.createElement("button");
      add.type = "button";
      add.className = "act";
      add.textContent = "הוספה";
      add.addEventListener("click", submit);

      row.append(input, add);
      wrap.append(row);
      return wrap;
    },
  },

  {
    id: "goal",
    build(draft, rerender) {
      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "מה המטרה?",
          "היא קובעת רק את היעדים המוצעים בשאלה הבאה. מסך המאקרו מתאר מה נאכל — הוא לא שופט.",
        ),
      );

      wrap.append(
        chipGroup({
          label: "מטרה תזונתית",
          options: GOALS.map((goal) => ({ id: goal.id, label: goal.label })),
          value: draft.goal,
          onChange: (id) => {
            draft.goal = id;
            rerender();
          },
        }),
      );
      return wrap;
    },
  },

  {
    id: "targets",
    build(draft, rerender) {
      seedTargets(draft);
      const names = realNames(draft);

      const wrap = document.createElement("div");
      wrap.append(
        questionHead(
          "יעדים ליום",
          "נקודת פתיחה עגולה, לא חישוב אישי. אפשר לשנות, ואפשר למחוק — שדה ריק מוצג כ״אין יעד״ במקום להשוות מול אפס.",
        ),
      );

      names.forEach((name, index) => {
        if (!draft.targets[index]) draft.targets[index] = targetsForGoal(draft.goal);
        const targets = draft.targets[index];

        const person = document.createElement("div");
        person.className = "ob-targets";

        const title = document.createElement("h2");
        title.className = "section-title";
        title.textContent = name;

        const grid = document.createElement("div");
        grid.className = "field-grid";
        for (const field of TARGET_FIELDS) {
          const input = numberInput({ value: targets[field.key] || "", placeholder: "—" });
          input.dataset.focusKey = `ob-t-${index}-${field.key}`;
          input.addEventListener("input", () => {
            const value = Number(input.value);
            targets[field.key] =
              input.value !== "" && Number.isFinite(value) && value >= 0 ? value : 0;
          });
          grid.append(fieldLabel(field.label, input));
        }

        person.append(title, grid);
        wrap.append(person);
      });

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "act ob-add";
      clear.textContent = "בלי יעדים בכלל";
      clear.addEventListener("click", () => {
        draft.goal = "none";
        draft.targetsSeededFor = null;
        rerender();
      });
      wrap.append(clear);
      return wrap;
    },
  },
];

/* ---------- שמירה ---------- */

/**
 * כותב את הטיוטה למצב.
 *
 * הפרופילים נבנים **מאפס** ולא ממוזגים לתוך הקיימים: האפיון רץ פעם
 * אחת, על משק בית שעדיין לא נגעו בו, ומה שיושב שם הוא פרופיל ברירת
 * המחדל ("אני") ולא נתון של אדם. מיזוג היה משאיר אותו תלוי באוויר
 * לצד השמות האמיתיים.
 */
export function applyOnboarding(store, draft, now = new Date()) {
  const names = realNames(draft);

  return store.update((state) => {
    if (names.length) {
      const profiles = profilesFromNames(names, targetsForGoal(draft.goal));
      profiles.forEach((profile, index) => {
        if (draft.targets[index]) profile.targets = { ...draft.targets[index] };
      });
      state.profiles = profiles;
    }

    state.household = {
      ...state.household,
      meals: draft.meals.slice(),
      cook_time: draft.cook_time,
      dislikes: draft.dislikes.slice(),
      goal: draft.goal,
      onboarded_at: isoLocal(now),
    };
  });
}

/* ---------- המסך ---------- */

/**
 * מרכיב את האפיון על `#onboarding`.
 *
 * @param {object} options
 * @param {object} options.store
 * @param {() => void} options.onDone  נקרא אחרי שמירה — גם בסיום וגם בדילוג
 */
export function mountOnboarding({ store, onDone }) {
  const root = document.getElementById("onboarding");
  const draft = newDraft();
  let index = 0;
  /* ⚠️ עד כמה התקדמנו בפועל, ולא "מה יש לו ערך תקין".
     גרסה קודמת צבעה אריח כ"נענתה" בכל שאלה שיש לה ברירת מחדל — כלומר
     חמש מתוך שבע נראו ענויות לפני שהמשתמש ראה אותן. מד שמדווח על
     תשובות שלא ניתנו הוא מד שמשקר. */
  let reached = 0;
  let open = true;

  /* אותה החלטה כמו במסך הכניסה, ומאותה סיבה: מתחת לאפיון עדיין אין
     אפליקציה להסתיר. טאבים שאי אפשר להשתמש בהם הם יעדי מגע שלא עושים
     כלום, ובמקלדת הם עצירות מיותרות בדרך לשאלה. */
  function chrome(visible) {
    for (const el of [
      document.querySelector("main"),
      document.querySelector(".tabbar"),
      document.querySelector(".topbar"),
    ]) {
      if (el) el.hidden = !visible;
    }
    document.body.classList.toggle("is-gated", !visible);
  }

  function teardown() {
    open = false;
    root.hidden = true;
    root.replaceChildren();
    chrome(true);
  }

  const finish = () => {
    applyOnboarding(store, draft);
    teardown();
    onDone();
  };

  /**
   * סגירה בלי שמירה. נקראת כשמצב מרוחק מגלה שמשק הבית כבר עבר אפיון
   * — בן זוג שמצטרף לתוכנית קיימת נשאל שאלות שכבר יש להן תשובה.
   */
  function dismiss() {
    if (!open) return;
    teardown();
  }

  function render({ focusKey = null, keepFocus = false } = {}) {
    const step = STEPS[index];
    // בלי שמירת המיקוד, כל הקלדה בשדה שם הייתה מחזירה את הסמן ל-body:
    // השדה מתרנדר מחדש בכל תו, ואותו שיקול בדיוק חי ב-app.js.
    const active = keepFocus ? document.activeElement?.dataset?.focusKey : null;
    const caret = keepFocus ? document.activeElement?.selectionStart : null;

    const panel = document.createElement("div");
    panel.className = "ob-panel";

    /* --- ראש: מד ההתקדמות, המונה, והדילוג --- */
    const head = document.createElement("div");
    head.className = "ob-head";

    const strip = document.createElement("div");
    strip.className = "ob-strip";
    // המד הוא חזרה ויזואלית על המונה שלידו, ולכן הוא מוסתר מקוראי מסך.
    strip.setAttribute("aria-hidden", "true");
    STEPS.forEach((_entry, i) => {
      const tile = document.createElement("span");
      tile.className = "ob-tile";
      tile.dataset.state = i === index ? "current" : i < reached ? "done" : "empty";
      strip.append(tile);
    });

    const count = document.createElement("p");
    count.className = "ob-count";
    count.textContent = `שאלה ${index + 1} מתוך ${STEPS.length}`;

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "ob-skip";
    skip.textContent = "דילוג";
    skip.setAttribute("aria-label", "דילוג על שאר האפיון");
    skip.addEventListener("click", finish);

    const headRow = document.createElement("div");
    headRow.className = "ob-head-row";
    headRow.append(count, skip);
    head.append(strip, headRow);

    /* --- גוף השאלה --- */
    const body = document.createElement("div");
    body.className = "ob-body";
    body.append(step.build(draft, render));

    /* --- מסד: ממשיכים / חזרה --- */
    const foot = document.createElement("div");
    foot.className = "ob-foot";

    /* ההנחיה נולדת מוסתרת ומתגלה רק אחרי ניסיון חסום. שאלה ריקה
       שמקדימה ואומרת "צריך שם" עוד לפני שנגעו בה נוזפת במי שרק הגיע. */
    const hint = document.createElement("p");
    hint.className = "field-error";
    hint.setAttribute("role", "alert");
    hint.hidden = true;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "act act-primary act-wide";
    next.textContent = index === STEPS.length - 1 ? "סיימנו" : "ממשיכים";
    next.addEventListener("click", () => {
      const stop = step.blocked ? step.blocked(draft) : null;
      if (stop) {
        hint.textContent = stop;
        hint.hidden = false;
        panel.querySelector("[data-focus-key]")?.focus();
        return;
      }
      if (index === STEPS.length - 1) return finish();
      reached = Math.max(reached, index + 1);
      index++;
      render();
    });

    foot.append(hint, next);

    if (index > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "ob-back";
      back.textContent = "חזרה";
      back.addEventListener("click", () => {
        index--;
        render();
      });
      foot.append(back);
    }

    panel.append(head, body, foot);
    root.replaceChildren(panel);

    /* --- מיקוד --- */
    const wanted = focusKey || active;
    const target = wanted && panel.querySelector(`[data-focus-key="${CSS.escape(wanted)}"]`);
    if (target) {
      target.focus({ preventScroll: true });
      if (caret != null && target.setSelectionRange) {
        try {
          target.setSelectionRange(caret, caret);
        } catch {
          /* לשדה הזה אין סמן טקסט */
        }
      }
      return;
    }
    // ברירת המחדל: הכותרת. קורא מסך מקריא את השאלה החדשה, והמקלדת
    // מתחילה מראש המסך ולא מהכפתור האחרון שנלחץ.
    panel.querySelector(".ob-q")?.focus({ preventScroll: true });
  }

  root.hidden = false;
  chrome(false);
  render();

  return {
    dismiss,
    get open() {
      return open;
    },
  };
}

/* נחשפים לעמוד הבדיקות: `newDraft`, `realNames` ו-`blocked` שעל
   השלבים הם לוגיקה טהורה שרצה בלי DOM. */
export { STEPS, newDraft, realNames };
