/* נקודת הכניסה והרכבת המסכים.

   זרימה חד-כיוונית: המסכים קוראים מה-store וכותבים דרך store.update בלבד.
   כאן יושב המנוי היחיד שמרנדר מחדש את המסך הפעיל ומעדכן את הודעת המצב —
   כך שאף מסך לא מייבא בחזרה מהקובץ הזה, ואין מעגל תלויות. */

import { getStore } from "./store.js";
import { renderToday, todaySubtitle } from "./ui-today.js";
import { renderWeek, weekSubtitle } from "./ui-week.js";
import { renderList, listSubtitle } from "./ui-list.js";
import { renderScore, scoreSubtitle } from "./ui-score.js";

const store = getStore();

const SCREENS = {
  today: { title: "מה אוכלים" },
  week: { title: "השבוע" },
  list: { title: "רשימת קניות" },
  score: { title: "מאקרו" },
};

for (const [id, screen] of Object.entries(SCREENS)) {
  screen.el = document.getElementById(`screen-${id}`);
  screen.render = null;
  screen.subtitle = null;
}

// היום הוא הטאב הפעיל בטעינה: השאלה שבגללה פותחים את האפליקציה היא
// "מה אוכלים היום", לא "איך נראה השבוע".
let active = "today";

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

registerScreen("today", renderToday, todaySubtitle);
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

/* התקנה למסך הבית ועבודה בלי קליטה. רשימת הקניות נפתחת בסופר, ושם
   הקליטה גרועה בדיוק כשצריך אותה — לכן הרישום הוא חלק מהמוצר ולא
   שיפור ביצועים. כשל רישום לא מפיל כלום: האפליקציה פשוט נשארת מקוונת. */
if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("רישום ה-service worker נכשל", error);
    });
  });
}
