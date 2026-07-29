/* מנהל השכבות.

   עורך המנה פותח בורר מצרכים, והבורר פותח טופס מצרך חדש — שלוש שכבות
   זו מעל זו. גרסה קודמת החזיקה "השכבה הפתוחה" יחידה וסגרה אותה בפתיחת
   הבאה, מה שהיה מפיל את העורך ברגע שבוחרים מצרך. לכן מחסנית.

   מה מרוכז כאן: Escape סוגר את העליונה בלבד, לחיצה על הרקע סוגרת את
   השכבה שלה, המיקוד נכנס פנימה ובסגירה חוזר למה שפתח, וגלילת הרקע
   ננעלת כל עוד יש שכבה פתוחה. */

const stack = [];

function lockScroll(locked) {
  document.body.classList.toggle("is-locked", locked);
}

/**
 * פותח שכבה.
 * @param {object} options
 * @param {string} options.label            שם נגיש לדיאלוג
 * @param {string} [options.variant]        "sheet" (ברירת מחדל) או "editor"
 * @param {(panel:HTMLElement, handle:object)=>void} options.build
 * @returns {{close:()=>void, panel:HTMLElement}}
 */
export function openOverlay({ label, variant = "sheet", build }) {
  // האלמנט שפתח את השכבה. אחרי סגירה המיקוד חוזר אליו — אלא אם המסך
  // התרנדר מחדש בינתיים והוא כבר לא ב-DOM.
  const opener = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = `sheet sheet--${variant}`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", label);

  const panel = document.createElement("div");
  panel.className = "sheet-panel";
  overlay.append(panel);

  function close() {
    const index = stack.indexOf(handle);
    if (index < 0) return; // כבר נסגרה
    stack.splice(index, 1);
    overlay.remove();
    if (!stack.length) lockScroll(false);
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  }

  const handle = { close, panel };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  stack.push(handle);
  lockScroll(true);
  build(panel, handle);
  document.body.append(overlay);

  const target = panel.querySelector("[data-autofocus]") || panel.querySelector("button, input");
  if (target instanceof HTMLElement) target.focus();

  return handle;
}

/** סוגר את כל השכבות. נדרש כשמצב האפליקציה משתנה מתחת להן. */
export function closeAllOverlays() {
  while (stack.length) stack[stack.length - 1].close();
}

// מאזין יחיד: Escape שייך לשכבה העליונה בלבד.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !stack.length) return;
  event.preventDefault();
  stack[stack.length - 1].close();
});

/* ---------- לבנים משותפות לטפסים ---------- */

/**
 * שדה עם תווית — ל*פקד יחיד* (input/select).
 *
 * העטיפה ב-label היא מה שמקשר בין הכיתוב לפקד, ולכן היא מתאימה רק
 * כשיש בדיוק פקד אחד בפנים. לקבוצת צ'יפים יש fieldGroup.
 */
export function fieldLabel(text, control) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.textContent = text;
  label.append(span, control);
  return label;
}

/**
 * שדה עם תווית — לקבוצת פקדים.
 *
 * label שעוטף כמה כפתורים נותן את הכיתוב שלו כשם הנגיש של *כל אחד*
 * מהם: שלושת צ'יפי המאמץ היו נקראים "מאמץ", "מאמץ", "מאמץ" במקום
 * "קל", "בינוני", "מורכב". הקבוצה מקבלת aria-label משלה ב-chipGroup,
 * והכיתוב כאן הוא טקסט ויזואלי בלבד.
 */
export function fieldGroup(text, control) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const span = document.createElement("span");
  span.className = "field-label";
  span.setAttribute("aria-hidden", "true");
  span.textContent = text;
  wrap.append(span, control);
  return wrap;
}

export function textInput({ value = "", placeholder = "", autofocus = false } = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "input";
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  if (autofocus) input.dataset.autofocus = "true";
  return input;
}

export function numberInput({ value = "", placeholder = "", min = 0, step = "any" } = {}) {
  const input = document.createElement("input");
  // inputmode decimal מעלה מקלדת מספרים במובייל בלי לחסום נקודה עשרונית
  input.type = "number";
  input.className = "input input--num";
  input.inputMode = "decimal";
  input.min = String(min);
  input.step = String(step);
  input.value = value === null || value === undefined ? "" : String(value);
  if (placeholder) input.placeholder = placeholder;
  return input;
}

/**
 * שורת בחירה יחידה מתוך אפשרויות קצרות. עדיף על select כשהאפשרויות
 * ספורות: כולן נראות בלי פתיחה, וההשוואה ביניהן מיידית.
 */
export function chipGroup({ options, value, onChange, label }) {
  const group = document.createElement("div");
  group.className = "chips";
  group.setAttribute("role", "radiogroup");
  if (label) group.setAttribute("aria-label", label);

  let selected = value;

  const render = () => {
    group.replaceChildren();
    for (const option of options) {
      const on = option.id === selected;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = on ? "chip is-on" : "chip";
      chip.textContent = option.label;
      chip.setAttribute("role", "radio");
      chip.setAttribute("aria-checked", on ? "true" : "false");
      chip.addEventListener("click", () => {
        selected = option.id;
        render();
        onChange(option.id);
      });
      group.append(chip);
    }
  };

  render();
  return group;
}

/**
 * שורת הנימוקים של הצעה — האלמנט שנושא את כל הפיצ'ר.
 *
 * ── למה צבע ולא תג ולא אייקון ───────────────────────────────────────
 * שני גוונים, ואף אחד מהם אינו כשל: "בישלתם אתמול" היא הסתייגות, לא
 * שגיאה, ולכן הצהוב (--attn) פסול כאן לפי הגדרתו. תג מלא היה מכניס
 * מילוי שני למסך שכבר יש בו כפתור פעולה אחד.
 *
 * מה שנשאר הוא בדיוק מה שהמערכת כבר משתמשת בו לאותה משמעות: קובלט
 * למה שמושך (אותו טיפול כמו dish-card-recency), ו--ink-soft למה
 * שמסתייג. נופל מזה דבר שלא תכננו ושהוא נכון: מנה שכל נימוקיה
 * אפורים נקראת מיד כמנה שאף סיבה לא מושכת אליה.
 *
 * @param {Array<{text:string,tone:string}>} reasons
 */
export function reasonLine(reasons) {
  const line = document.createElement("span");
  line.className = "reason-line";

  for (const [index, item] of (reasons || []).entries()) {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "reason-sep";
      // המפריד *אינו* aria-hidden בכוונה. הסתרתו הייתה מדביקה את
      // הנימוקים למחרוזת אחת רצופה בקורא מסך ("עוד לא בישלתםכל
      // המצרכים במזווה"); הנקודה האמצעית עצמה כמעט תמיד אינה מוקראת,
      // ומה שנשאר ממנה הוא בדיוק ההפסקה שצריך.
      sep.textContent = " · ";
      line.append(sep);
    }
    const part = document.createElement("span");
    part.className = item.tone === "good" ? "reason is-good" : "reason is-warn";
    part.textContent = item.text;
    line.append(part);
  }

  return line;
}

export function errorLine(text) {
  const p = document.createElement("p");
  p.className = "field-error";
  p.setAttribute("role", "alert");
  p.textContent = text;
  return p;
}
