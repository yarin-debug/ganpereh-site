/* נקודת הכניסה: מחזיקה את הטאבים ומרנדרת מחדש את המסך הפעיל בכל שינוי מצב.
   בלי framework — רינדור מלא של מסך אחד הוא זול בסדרי הגודל של השלד. */

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

/** מציג הודעת מצב קבועה (נעילת סכמה, כשל שמירה). ריק = מוסתר. */
export function setBanner(text) {
  if (!text) {
    bannerEl.hidden = true;
    bannerEl.textContent = "";
    return;
  }
  bannerEl.textContent = text;
  bannerEl.hidden = false;
}

/** מסך רושם את עצמו: מזהה, פונקציית רינדור, וכיתוב משנה אופציונלי. */
export function registerScreen(id, render, subtitle) {
  const screen = SCREENS[id];
  screen.render = render;
  screen.subtitle = subtitle || null;
}

export function renderActive() {
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

show(active);
