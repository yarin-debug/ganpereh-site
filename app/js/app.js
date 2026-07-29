/* נקודת הכניסה והרכבת המסכים.

   זרימה חד-כיוונית: המסכים קוראים מה-store וכותבים דרך store.update בלבד.
   כאן יושב המנוי היחיד שמרנדר מחדש את המסך הפעיל ומעדכן את הודעת המצב —
   כך שאף מסך לא מייבא בחזרה מהקובץ הזה, ואין מעגל תלויות. */

import { getStore } from "./store.js";
import { createSync } from "./sync.js";
import { mountAuth } from "./ui-auth.js";
import { renderToday, todaySubtitle } from "./ui-today.js";
import { renderWeek, weekSubtitle } from "./ui-week.js";
import { renderList, listSubtitle } from "./ui-list.js";
import { renderPantry, pantrySubtitle } from "./ui-pantry.js";
import { renderScore, scoreSubtitle } from "./ui-score.js";

const store = getStore();
const sync = createSync(store);

const SCREENS = {
  today: { title: "מה אוכלים" },
  week: { title: "השבוע" },
  list: { title: "רשימת קניות" },
  pantry: { title: "המזווה" },
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

/* שני מקורות כותבים לבאנר: שלמות הנתונים (store) והרשאות הסנכרון.
   הראשון גובר — "הנתונים לא נשמרים" חמור מ"החשבון לא מורשה", ושתי
   הודעות זו על זו הן הודעה שאיש לא קורא. */
let authBanner = null;

function paintBanner() {
  const text = store.statusMessage() || authBanner;
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

registerScreen("today", renderToday, todaySubtitle);
registerScreen("week", renderWeek, weekSubtitle);
registerScreen("list", renderList, listSubtitle);
registerScreen("pantry", renderPantry, pantrySubtitle);
registerScreen("score", renderScore, scoreSubtitle);

// כל שינוי מצב: לרענן את הודעת המצב ולרנדר מחדש את המסך הפעיל.
// עריכה של המשתמש כאן גם מתזמנת דחיפה; מצב שהגיע מהשרת לא — אחרת שני
// מכשירים פתוחים היו דוחפים זה לזה בלי הרף.
store.subscribe((_state, reason) => {
  paintBanner();
  renderActive();
  if (reason === "local") sync.schedulePush();
});

// טאב שנשאר פתוח מעבר לחצות של מוצ"ש היה ממשיך להציג את השבוע הישן
// ומתייק לתוכו ארוחות שייעלמו בטעינה הבאה. בכל חזרה למסך בודקים מחדש
// גם את השבוע, גם מה נכתב מטאב אחר, וגם מה נכתב מהמכשיר השני.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    sync.stopPolling();
    return;
  }
  store.refresh();
  sync.startPolling();
  sync.sync();
});
addEventListener("focus", () => {
  store.refresh();
  sync.sync();
});

// חיבור הסנכרון לממשק. `onEnter` מרנדר מחדש אחרי מעבר ממסך הכניסה,
// כי המסכים היו מוסתרים ולא צוירו בזמן שהוא היה פתוח.
mountAuth(sync, {
  setBanner: (text) => {
    authBanner = text;
    paintBanner();
  },
  onEnter: () => show(active),
});

paintBanner();
show(active);

// לא ממתינים: המסך עולה מהנתונים המקומיים, והסנכרון משלים אותו כשהוא
// מגיע. זו אותה החלטה שבגללה רשימת הקניות עובדת בסופר בלי קליטה.
sync.start();

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
