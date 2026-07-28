/* נקודת הכניסה והרכבת המסכים.

   זרימה חד-כיוונית: המסכים קוראים מה-store וכותבים דרך store.update בלבד.
   כאן יושב המנוי היחיד שמרנדר מחדש את המסך הפעיל ומעדכן את הודעת המצב —
   כך שאף מסך לא מייבא בחזרה מהקובץ הזה, ואין מעגל תלויות. */

import { getStore } from "./store.js";
import { renderWeek, weekSubtitle } from "./ui-week.js";
import { renderList, listSubtitle } from "./ui-list.js";
import { renderScore, scoreSubtitle } from "./ui-score.js";

const store = getStore();

const SCREENS = {
  week: { title: "השבוע" },
  list: { title: "רשימת קניות" },
  score: { title: "מאקרו" },
};

for (const [id, screen] of Object.entries(SCREENS)) {
  screen.el = document.getElementById(`screen-${id}`);
  screen.render = null;
  screen.subtitle = null;
}

// המתכנן הוא הטאב הפעיל בטעינה — הרשימה והסקורבורד ריקים עד שמתכננים משהו.
let active = "week";

const titleEl = document.getElementById("screen-title");
const subEl = document.getElementById("screen-sub");
const bannerEl = document.getElementById("banner");

function setBanner(text) {
  if (!text) {
    bannerEl.hidden = true;
    bannerEl.textContent = "";
    return;
  }
  bannerEl.textContent = text;
  bannerEl.hidden = false;
}

function registerScreen(id, render, subtitle) {
  SCREENS[id].render = render;
  SCREENS[id].subtitle = subtitle || null;
}

/* המסך נבנה מחדש בכל שינוי מצב, ולכן האלמנט שהמשתמש עמד עליו נהרס תחתיו.
   בלי שחזור, כל לחיצה החזירה את הפוקוס ל-body: במקלדת אי אפשר היה ללחוץ
   "+" פעמיים ברצף, ובקורא מסך סמן הקריאה קפץ לראש הדף אחרי כל נגיעה.
   כל פקד נושא data-focus-key יציב שאינו תלוי במיקום ברשימה. */
function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !el.getAttribute) return null;
  const key = el.getAttribute("data-focus-key");
  if (!key) return null;
  const snapshot = { key };
  // שדות מספר לא תומכים ב-selectionStart ומשליכים בגישה. הקריאה עטופה
  // כדי שהשחזור לא ייפול בגללם.
  try {
    snapshot.start = el.selectionStart;
    snapshot.end = el.selectionEnd;
  } catch {
    /* לשדה הזה אין סמן טקסט — הפוקוס לבדו מספיק */
  }
  return snapshot;
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const el = document.querySelector(`[data-focus-key="${CSS.escape(snapshot.key)}"]`);
  if (!el) return;
  // preventScroll: הדפדפן היה מקפיץ את הגלילה אל הפקד המשוחזר.
  el.focus({ preventScroll: true });
  if (snapshot.start == null) return;
  try {
    el.setSelectionRange(snapshot.start, snapshot.end);
  } catch {
    /* כנ"ל */
  }
}

function renderActive() {
  const screen = SCREENS[active];
  const focused = captureFocus();
  titleEl.textContent = screen.title;
  subEl.textContent = screen.render && screen.subtitle ? screen.subtitle() : "";
  screen.el.replaceChildren();
  if (!screen.render) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "המסך הזה עדיין לא זמין.";
    screen.el.append(p);
    return;
  }
  // המסך מתנקה לפני הרינדור, ולכן חריגה באמצע הייתה משאירה מסך ריק
  // בלי הסבר — ובגלל שהמצב נשמר, גם בכל טעינה הבאה.
  try {
    screen.render(screen.el);
  } catch (error) {
    console.error("רינדור נכשל", error);
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "לא הצלחנו להציג את המסך הזה. שאר המסכים עדיין עובדים.";
    screen.el.append(p);
    return;
  }
  restoreFocus(focused);
}

function show(id) {
  active = id;
  for (const [key, screen] of Object.entries(SCREENS)) {
    screen.el.hidden = key !== id;
  }
  for (const tab of document.querySelectorAll(".tab")) {
    const on = tab.dataset.screen === id;
    tab.classList.toggle("is-active", on);
    if (on) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  renderActive();
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => show(tab.dataset.screen));
}

registerScreen("week", renderWeek, weekSubtitle);
registerScreen("list", renderList, listSubtitle);
registerScreen("score", renderScore, scoreSubtitle);

// כל שינוי מצב: לרענן את הודעת המצב ולרנדר מחדש את המסך הפעיל.
store.subscribe(() => {
  setBanner(store.statusMessage());
  renderActive();
});

// טאב שנשאר פתוח מעבר לחצות של מוצ"ש היה ממשיך להציג את השבוע הישן
// ומתייק לתוכו ארוחות שייעלמו בטעינה הבאה. בכל חזרה למסך בודקים מחדש
// גם את השבוע וגם מה נכתב מטאב אחר.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) store.refresh();
});
addEventListener("focus", () => store.refresh());

setBanner(store.statusMessage());
show(active);
