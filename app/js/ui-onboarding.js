/* מסך הפתיחה — שלוש שאלות בהתקנה ראשונה.

   ── למה זה קיים ─────────────────────────────────────────────────────
   עד כאן האפליקציה נפתחה זרועה מראש ב"ירין" וב"בן/בת הזוג". אפשר היה
   לתקן את זה במסך המאקרו, אבל צריך לדעת ללכת לשם — כלומר משק בית אחר
   ראה לנצח שמות של מישהו אחר, ומאקרו שמחולק בין שני אנשים דמיוניים.

   ── מה נשאל, ומה במכוון לא ──────────────────────────────────────────
   רק מה שמסך קורא בפועל. שמות נקראים בכל מקום, העדפת הארוחות קובעת מה
   מוצג במסך היום ובשבוע, ויעד הקלוריות נמדד מולו במסך המאקרו.
   "כמה זמן יש לך לבשל" ו"מה אתם לא אוהבים" *לא* נשאלים כאן: אף מסך
   אינו קורא אותם. שאלה שהתשובה עליה לא משנה כלום היא מס כניסה.

   ההחלטה הזו נבחנה פעם אחת בשטח ועמדה: `dislikes` היה בדיוק השדה הזה
   — נשמר בכל פרופיל, מנורמל בכל טעינה, ואיש לא קרא אותו — והסוף שלו
   היה הסרה. המסך הזה נמנע במכוון מלהאכיל אותו, וזה מה שאיפשר להסיר
   אותו בלי להשמיד נתון של אף אחד.

   היעדים נשאלים בקלוריות בלבד. ארבעה מספרים כפול מספר האנשים הם טופס,
   לא שאלה, והם בדיוק המקום שבו נוטשים הגדרה ראשונה. שאר המאקרו מתווסף
   במסך המאקרו, שבו ממילא יושב עורך הפרופיל המלא.

   ── למה זה לא openOverlay ───────────────────────────────────────────
   שכבה במחסנית נסגרת ב-Escape ובלחיצה על הרקע. שתי הפעולות האלה שגויות
   כאן: זו אינה שכבה מעל האפליקציה אלא הדלת אליה, וסגירה בטעות הייתה
   מכניסה את המשתמש פנימה עם משק בית ריק ובלי דרך לחזור. */

import { getStore } from "./store.js";
import { blankTargets } from "./profiles.js";
import { MEALS } from "./plan.js";
import { numberInput, textInput, errorLine } from "./ui-overlay.js";
import { openBackupImport } from "./ui-backup.js";

const TOTAL_STEPS = 3;

/* הסגירה נדרשת גם ממקום שאינו בתוך הסגור של openOnboarding — טעינה
   מגיבוי מייתרת את המסך מאמצע השלב הראשון. מסך אחד פתוח בכל רגע,
   ולכן די בהפניה יחידה. */
let teardown = null;

function closeOnboarding() {
  if (teardown) teardown();
}

/* אזורי האפליקציה שיוצאים מכלל שימוש כל עוד המסך פתוח. בלי זה אפשר
   להגיע ב-Tab לטאבים שמסתתרים מאחורי המסך ולנווט למקום שעוד לא הוגדר. */
const CHROME = ["header.topbar", "main", "nav.tabbar"];

function setChromeInert(on) {
  for (const selector of CHROME) {
    const el = document.querySelector(selector);
    if (el) el.inert = on;
  }
}

/**
 * פותח את מסך הפתיחה. מחזיר רק אחרי שהמשתמש סיים — האפליקציה שמאחור
 * כבר מרונדרת, והמסך הזה יושב מעליה עד שיש משק בית.
 * @param {() => void} onDone נקרא אחרי שההגדרה נשמרה
 */
export function openOnboarding(onDone) {
  const store = getStore();

  const draft = {
    step: 0,
    // שורה ריקה אחת ולא שתיים: משק בית של אדם אחד אינו מקרה קצה, ושורה
    // שנייה שקופצת מראש היא הנחה על מי גר כאן.
    names: [""],
    // הערב הוא נקודת העוגן של היום גם בקוד (ראה defaultMeal), ולכן הוא
    // הבחירה הפותחת. בוקר וצהריים הם הצטרפות מודעת ולא ברירת מחדל
    // שנגררת בלי לשים לב.
    meals: new Set(["dinner"]),
    kcal: [],
  };

  const root = document.createElement("div");
  root.className = "onboarding";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "ob-heading");

  const panel = document.createElement("div");
  panel.className = "ob-panel";
  root.append(panel);

  teardown = () => {
    teardown = null;
    setChromeInert(false);
    document.body.classList.remove("is-onboarding");
    root.remove();
    if (onDone) onDone();
  };

  function finish() {
    const names = draft.names.map((name) => name.trim()).filter(Boolean);
    const meals = MEALS.map((meal) => meal.id).filter((id) => draft.meals.has(id));

    // כתיבה אחת לכל ההגדרה. שתי כתיבות היו יכולות להיכשל באמצע ולהשאיר
    // משק בית מוגדר מול מסך פתיחה שנפתח שוב בטעינה הבאה.
    const ok = store.update((s) => {
      s.profiles = names.map((name, index) => ({
        id: `p${index + 1}`,
        name_he: name,
        targets: { ...blankTargets(), kcal: draft.kcal[index] || 0 },
        archived: false,
      }));
      s.prefs = { ...s.prefs, meals };
      s.onboarded = true;
    });

    if (!ok) return false;
    closeOnboarding();
    return true;
  }

  function go(step) {
    draft.step = step;
    render();
  }

  function render() {
    panel.replaceChildren();
    panel.append(buildHeader(draft, go));

    const step = STEPS[draft.step];
    const error = errorLine("");
    error.hidden = true;

    panel.append(buildIntro(draft.step, step));
    panel.append(step.build(draft, () => render()));
    panel.append(error);

    const fail = (message) => {
      error.textContent = message;
      error.hidden = false;
    };

    panel.append(buildFooter(draft, step, { go, finish, fail }));

    // כותרת השלב היא נקודת הכניסה של קורא המסך אחרי מעבר. בלי המיקוד
    // הזה הקריאה נשארת על הכפתור שנעלם ולא נקראת שום שאלה חדשה.
    const heading = panel.querySelector("#ob-heading");
    if (heading) heading.focus();
  }

  render();
  document.body.classList.add("is-onboarding");
  setChromeInert(true);
  document.body.append(root);
}

/* ---------- שלד המסך ---------- */

function buildHeader(draft, go) {
  const head = document.createElement("div");
  head.className = "ob-head";

  // "חזרה" קיים משלב שני והלאה. בשלב הראשון נשאר מרווח במקומו, כדי
  // שהריבועים לא יזוזו הצידה בין שלב לשלב.
  if (draft.step > 0) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ob-back";
    back.textContent = "חזרה";
    back.addEventListener("click", () => go(draft.step - 1));
    head.append(back);
  } else {
    head.append(document.createElement("span"));
  }

  /* ── הריבועים הם פס השבוע, בשלושה ──────────────────────────────────
     אותה שפת צורות בדיוק: מקווקו = שלב שעוד לא הגענו אליו, מסגרת
     קובלט = השלב שעל השולחן, אריח רך עם וי = שלב שנסגר.

     זו אינה חזרה על אלמנט קיים לשם עקביות בלבד. פס השבוע הוא האלמנט
     שהמשתמש יפגוש בשנייה שהמסך הזה ייסגר, ואם המקווקו והוי כבר אמרו לו
     משהו כאן — הוא נוחת על מסך היום כשהוא כבר יודע לקרוא אותו.

     aria-hidden: השורה "שלב 2 מתוך 3" שמתחת אומרת את אותו הדבר במילים,
     וקורא מסך שהיה מקריא את שניהם היה חוזר על עצמו. */
  const steps = document.createElement("div");
  steps.className = "ob-steps";
  steps.setAttribute("aria-hidden", "true");
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const dot = document.createElement("span");
    dot.className = "ob-dot";
    dot.dataset.state = i < draft.step ? "cooked" : i === draft.step ? "planned" : "empty";
    steps.append(dot);
  }
  head.append(steps);

  return head;
}

function buildIntro(index, step) {
  const wrap = document.createElement("div");

  const eyebrow = document.createElement("p");
  eyebrow.className = "ob-eyebrow";
  eyebrow.textContent = `שלב ${index + 1} מתוך ${TOTAL_STEPS}`;

  const heading = document.createElement("h2");
  heading.className = "ob-title";
  heading.id = "ob-heading";
  heading.tabIndex = -1;
  heading.textContent = step.title;

  const sub = document.createElement("p");
  sub.className = "ob-sub";
  sub.textContent = step.sub;

  wrap.append(eyebrow, heading, sub);
  return wrap;
}

function buildFooter(draft, step, { go, finish, fail }) {
  const foot = document.createElement("div");
  foot.className = "ob-foot";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "act act-wide act-primary";
  next.textContent = step.next;
  next.addEventListener("click", () => {
    const problem = step.validate ? step.validate(draft) : null;
    if (problem) {
      fail(problem);
      return;
    }
    if (draft.step < TOTAL_STEPS - 1) {
      go(draft.step + 1);
      return;
    }
    if (!finish()) fail("השמירה נכשלה. בדוק את הודעת המצב בראש המסך.");
  });
  foot.append(next);

  /* הדילוג שמור לשלב היעדים, והוא נקרא על שם התוצאה ולא על שם הפעולה:
     "דלג" מספר מה *לא* עושים, "בלי יעדים בינתיים" מספר באיזה מצב
     יוצאים מכאן. הוא שקט בכוונה — המילוי המלא במסך שמור לפעולה אחת. */
  if (step.skip) {
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "ob-skip";
    skip.textContent = step.skip;
    skip.addEventListener("click", () => {
      draft.kcal = [];
      if (!finish()) fail("השמירה נכשלה. בדוק את הודעת המצב בראש המסך.");
    });
    foot.append(skip);
  }

  return foot;
}

/* ---------- שלב 1: מי אוכל כאן ---------- */

function buildNames(draft, redraw) {
  const list = document.createElement("div");
  list.className = "ob-rows";

  draft.names.forEach((value, index) => {
    const row = document.createElement("div");
    row.className = "ob-row";

    const input = textInput({
      value,
      placeholder: index === 0 ? "השם שלך" : "שם",
      autofocus: index === draft.names.length - 1,
    });
    input.setAttribute("aria-label", `שם של אדם ${index + 1}`);
    input.addEventListener("input", () => {
      draft.names[index] = input.value;
    });
    row.append(input);

    // שורה יחידה אינה ניתנת להסרה: משק בית בלי אף אחד אינו מצב שאפשר
    // להיכנס איתו לאפליקציה.
    if (draft.names.length > 1) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ob-remove";
      remove.textContent = "הסרה";
      remove.setAttribute("aria-label", `הסרת ${value.trim() || `אדם ${index + 1}`}`);
      remove.addEventListener("click", () => {
        draft.names.splice(index, 1);
        redraw();
      });
      row.append(remove);
    }

    list.append(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "act ob-add";
  add.textContent = "הוספת אדם";
  add.addEventListener("click", () => {
    draft.names.push("");
    redraw();
  });

  const wrap = document.createElement("div");
  wrap.append(list, add, buildRestore());
  return wrap;
}

/**
 * "כבר יש לי גיבוי".
 *
 * מכשיר חדש הוא בדיוק הרגע שבו מחפשים את הכפתור הזה, ומסך הפתיחה הוא
 * המסך היחיד שרואים בו — לשלוח משם למסך המאקרו היה לשלוח דרך הגדרה
 * של משק בית שכל מטרתה להידרס מיד אחר כך.
 *
 * שקט ומתחת להוספה, כי זה המסלול של המיעוט. מי שמגיע לכאן בפעם
 * הראשונה בחייו לא אמור לעצור ולשאול את עצמו מה זה גיבוי.
 */
function buildRestore() {
  const wrap = document.createElement("div");

  const error = errorLine("");
  error.hidden = true;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ob-restore";
  button.textContent = "כבר יש לי קובץ גיבוי";
  button.addEventListener("click", () => {
    error.hidden = true;
    openBackupImport({
      onProblem: (text) => {
        error.textContent = text;
        error.hidden = false;
      },
      // הייבוא כותב onboarded מתוך הקובץ, ולכן המסך הזה מיותר מרגע
      // שהוא הצליח. סגירה מלאה ולא מעבר לשלב הבא.
      onDone: () => closeOnboarding(),
    });
  });

  wrap.append(button, error);
  return wrap;
}

/* ---------- שלב 2: אילו ארוחות ---------- */

function buildMeals(draft, redraw) {
  const group = document.createElement("div");
  group.className = "ob-meals";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "ארוחות שמתכננים");

  for (const meal of MEALS) {
    const on = draft.meals.has(meal.id);
    const button = document.createElement("button");
    button.type = "button";
    // act[aria-pressed=true] הוא קו וגוון רך ולא מילוי — אותו היפוך
    // שכל המערכת נשענת עליו. בחירה אינה פעולה שצריך לעשות עכשיו.
    button.className = "act ob-meal";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = meal.label;
    button.addEventListener("click", () => {
      if (on) draft.meals.delete(meal.id);
      else draft.meals.add(meal.id);
      redraw();
    });
    group.append(button);
  }

  return group;
}

/* ---------- שלב 3: יעד קלוריות ---------- */

function buildTargets(draft) {
  const list = document.createElement("div");
  list.className = "ob-rows";

  const names = draft.names.map((name) => name.trim()).filter(Boolean);

  names.forEach((name, index) => {
    const row = document.createElement("label");
    row.className = "ob-target";

    const label = document.createElement("span");
    label.className = "ob-target-name";
    label.textContent = name;

    const input = numberInput({ value: draft.kcal[index] || "", placeholder: "—" });
    input.addEventListener("input", () => {
      const value = Number(input.value);
      draft.kcal[index] = input.value !== "" && Number.isFinite(value) && value >= 0 ? value : 0;
    });

    row.append(label, input);
    list.append(row);
  });

  return list;
}

/* ---------- השלבים ---------- */

const STEPS = [
  {
    title: "מי אוכל כאן?",
    sub: "כדי לדעת לכמה מנות לבשל, ואיך לחלק את המאקרו בין כולם.",
    next: "המשך",
    build: buildNames,
    validate: (draft) =>
      draft.names.some((name) => name.trim()) ? null : "צריך לפחות שם אחד כדי להמשיך.",
  },
  {
    title: "אילו ארוחות מתכננים?",
    sub: "מה שלא נבחר לא יופיע במסך היום ובמתכנן השבועי. אפשר לשנות את זה במסך השבוע בכל רגע.",
    next: "המשך",
    build: buildMeals,
    validate: (draft) => (draft.meals.size ? null : "צריך לבחור לפחות ארוחה אחת."),
  },
  {
    title: "יעד קלוריות ליום",
    sub: "אפשר להשאיר ריק — מסך המאקרו יראה מה נאכל בלי להשוות לשום דבר. חלבון, שומן ופחמימות מתווספים שם בכל שלב.",
    next: "אפשר להתחיל",
    skip: "בלי יעדים בינתיים",
    build: buildTargets,
  },
];
