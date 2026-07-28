/* פס השבוע — שבעה ימים, מצב כל יום מקודד בצורה ולא בתווית.

   זה הרכיב שנושא את "הצ'קליסט היומי": במבט אחד רואים מה בושל, מה
   נאכל בחוץ, ומה עוד לא הוכרע. הרצף אינו תג נפרד אלא פשוט הריצה של
   הריבועים המלאים — ולכן אין כאן חגיגה, רק מידע. */

import { weekDates, DAY_NAMES } from "./store.js";
import { dayState } from "./plan.js";

/** אות פותחת לכל יום. שבת מקבלת "ש" ולא "ש'" — אין יום נוסף שמתחיל בה. */
const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const STATE_LABELS = {
  empty: "לא תוכנן",
  planned: "מתוכנן",
  cooked: "בישלנו",
  ate_out: "אכלנו בחוץ",
  skipped: "דילגנו",
};

/**
 * בונה את פס השבוע.
 * @param {object} options
 * @param {object} options.state       מצב האפליקציה
 * @param {string} options.todayIso    התאריך של היום
 * @param {string} options.selectedIso היום שבמוקד
 * @param {(iso:string)=>void} options.onPick
 */
export function buildStrip({ state, todayIso, selectedIso, onPick }) {
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.setAttribute("role", "group");
  strip.setAttribute("aria-label", "ימי השבוע");

  for (const [index, date] of weekDates(state.plan.week_start).entries()) {
    const status = dayState(state.plan.slots, date);

    const button = document.createElement("button");
    button.type = "button";
    button.className = date === todayIso ? "strip-day is-today" : "strip-day";
    button.dataset.state = status;
    if (date === selectedIso) button.setAttribute("aria-current", "true");
    button.setAttribute(
      "aria-label",
      `${DAY_NAMES[index]} · ${STATE_LABELS[status] || STATE_LABELS.empty}`,
    );

    const letter = document.createElement("span");
    letter.className = "strip-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = DAY_LETTERS[index];

    const mark = document.createElement("span");
    mark.className = "strip-mark";

    button.append(letter, mark);
    button.addEventListener("click", () => onPick(date));
    strip.append(button);
  }

  return strip;
}

export { STATE_LABELS };
