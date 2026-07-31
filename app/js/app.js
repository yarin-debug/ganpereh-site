/* נקודת הכניסה והרכבת המסכים.

   זרימה חד-כיוונית: המסכים קוראים מה-store וכותבים דרך store.update בלבד.
   כאן יושב המנוי היחיד שמרנדר מחדש את המסך הפעיל ומעדכן את הודעת המצב —
   כך שאף מסך לא מייבא בחזרה מהקובץ הזה, ואין מעגל תלויות. */

import { getStore } from "./store.js";
import { renderToday, todaySubtitle } from "./ui-today.js";
import { renderWeek, weekSubtitle } from "./ui-week.js";
import { renderList, listSubtitle } from "./ui-list.js";
import { renderPantry, pantrySubtitle } from "./ui-pantry.js";
import { renderScore, scoreSubtitle } from "./ui-score.js";
import { openOnboarding } from "./ui-onboarding.js";
import { startTour, tourSeen } from "./ui-tour.js";
import { consumeAuthRedirect } from "./sync/auth.js";
import { attachSync } from "./sync/sync.js";

const store = getStore();

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

registerScreen("today", renderToday, todaySubtitle);
registerScreen("week", renderWeek, weekSubtitle);
registerScreen("list", renderList, listSubtitle);
registerScreen("pantry", renderPantry, pantrySubtitle);
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

/* מסך הפתיחה ואחריו התדריך.

   ── שני דברים שונים, ולכן שני מפתחות ────────────────────────────────
   מסך הפתיחה בונה את *משק הבית* — מי אוכל, אילו ארוחות, מה היעדים —
   והוא נשמר במצב (`onboarded`) ומסתנכרן. התדריך מלמד את *הממשק*,
   ולכן הוא דגל מקומי במכשיר. השאלה שהוא עונה עליה היא "האדם הזה,
   בטלפון הזה, כבר ראה איך זה עובד?" — ולבן זוג שהצטרף למשק בית קיים
   התשובה היא לא, גם כשמסך הפתיחה כבר נענה.

   האפליקציה מרונדרת קודם והשכבות יושבות מעליה: כך הסגירה חושפת מסך
   מוכן ולא רגע של דף ריק. needsOnboarding מכבה את עצמו כשכתיבה ממילא
   תיכשל — הנימוק המלא ב-store.js. */
function startTourIfNeeded() {
  if (tourSeen()) return;
  // התדריך מחליף טאבים בעצמו, ובסופו חוזרים להיום — הטאב שהאפליקציה
  // נפתחת בו, ולא זה שהכרטיס האחרון במקרה עצר עליו.
  startTour({ onShow: show, onDone: () => show("today") });
}

if (store.needsOnboarding()) {
  openOnboarding(() => {
    show("today");
    startTourIfNeeded();
  });
} else {
  startTourIfNeeded();
}

/* סנכרון בין מכשירים.

   js/sync/config.js כבר נושא כתובת פרויקט ומפתח, ולכן attachSync
   **כן** רושם כאן מאזינים. מה שמשאיר את השורות האלה בלי שום בקשת
   רשת הוא signedIn(): כל מסלול שיוצא לרשת יוצא עליו, ואין סשן כל
   עוד לא נבנה מסך התחברות. ברגע שהמסך ייבנה וההתחברות הראשונה
   תכתוב סשן, השכבה מתחילה לרוץ — בלי שינוי בשתי השורות האלה.
   הנימוק המלא בראש attachSync ב-js/sync/sync.js.

   האחסון המקומי נשאר הבעלים גם כשהסנכרון פעיל: הכל נכתב ונקרא ממנו
   כרגיל, והשרת הוא יעד סנכרון ולא תנאי. רשימת הקניות חייבת להיפתח
   בסופר בלי קליטה, וסנכרון שהופך רשת לתנאי לקריאה היה שובר בדיוק
   את התכונה שבגללה האפליקציה נבנתה כך. */
consumeAuthRedirect();
attachSync(store);

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
