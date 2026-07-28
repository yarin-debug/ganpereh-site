/* נקודת הכניסה והרכבת המסכים.

   זרימה חד-כיוונית: המסכים קוראים מה-store וכותבים דרך store.update בלבד.
   כאן יושב המנוי היחיד שמרנדר מחדש את המסך הפעיל ומעדכן את הודעת המצב —
   כך שאף מסך לא מייבא בחזרה מהקובץ הזה, ואין מעגל תלויות. */

import { getStore } from "./store.js";
import { renderWeek, weekSubtitle } from "./ui-week.js";

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

function renderActive() {
  const screen = SCREENS[active];
  titleEl.textContent = screen.title;
  subEl.textContent = screen.render && screen.subtitle ? screen.subtitle() : "";
  screen.el.replaceChildren();
  if (screen.render) {
    screen.render(screen.el);
  } else {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "המסך הזה עדיין לא זמין.";
    screen.el.append(p);
  }
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

// כל שינוי מצב: לרענן את הודעת המצב ולרנדר מחדש את המסך הפעיל.
store.subscribe(() => {
  setBanner(store.statusMessage());
  renderActive();
});

setBanner(store.statusMessage());
show(active);
