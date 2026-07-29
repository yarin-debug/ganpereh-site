/* מסך הכניסה, שבב מצב הסנכרון, וגיליון החשבון.

   ── שלוש החלטות עיצוב שקל להפוך ────────────────────────────────────

   1. **הכפתור של גוגל הוא המילוי המלא של המסך הזה.**
      הכלל של האפליקציה — מילוי מלא שמור לפעולה אחת שצריך לעשות עכשיו
      — לא נשבר כאן אלא מיושם: במסך הכניסה יש בדיוק פעולה אחת. הלוגו
      של גוגל יושב באריח לבן בתוך הכפתור כדי שיישאר בצבעיו הנכונים,
      וברדיוס של `--radius-sm` כדי שהכפתור ייקרא כחלק מהאפליקציה
      ולא כרכיב מושתל.

   2. **"אין רשת" אינו שגיאה.** הצהוב שמור לכשל אמיתי, ועבודה בלי
      קליטה היא מצב תקין ומתוכנן — רשימת הקניות נכתבה בשבילו. לכן
      הנקודה בשבב מקווקוות במקום צהובה, בדיוק כמו יום שלא תוכנן בפס
      השבוע. רק מה שדורש פעולה (חשבון שאינו מורשה) עולה לבאנר.

   3. **"המשך בלי חשבון" נשאר.** האפליקציה עבדה מקומית לפני הסנכרון,
      והנתונים האלה עדיין במכשיר. מסך כניסה שנועל אותם מאחורי רשת —
      בדיוק כשאין רשת — הופך תכונה חדשה למחסום על מה שכבר עבד. */

import { openOverlay } from "./ui-overlay.js";

const LOCAL_ONLY_KEY = "gp_meals_local_only";

function readFlag(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* אחסון חסום — הבחירה תקפה לסשן הזה בלבד */
  }
}

/** הלוגו של גוגל, בצבעיו. אריח לבן מתחתיו — כך הוא נשאר תקני גם על החרס. */
function googleMark() {
  const wrap = document.createElement("span");
  wrap.className = "gate-g";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18">
<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;
  return wrap;
}

/**
 * תוכן כפתור ההתחברות.
 *
 * "Google" יוצא מפונט התצוגה בכוונה: ל-TelAviv Brutalist אין אותיות
 * לטיניות קטנות, והשם היה מופיע כ-GOOGLE — שם מותג שנכתב לא נכון.
 * העברית נשארת בפונט התצוגה כמו בכל כפתור אחר.
 */
function signInContent() {
  const brand = document.createElement("span");
  brand.className = "brand-google";
  brand.textContent = "Google";
  return [googleMark(), document.createTextNode("התחבר עם "), brand];
}

/** "לפני רגע" / "לפני 4 דקות". מספר מדויק כאן אינו מוסיף דבר. */
function agoLabel(timestamp, nowMs) {
  if (!timestamp) return "עדיין לא";
  const minutes = Math.floor((nowMs - timestamp) / 60000);
  if (minutes < 1) return "לפני רגע";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

const CHIP_STATE = {
  syncing: { dot: "syncing", text: "מסנכרן" },
  ok: { dot: "ok", text: "מסונכרן" },
  offline: { dot: "offline", text: "אין רשת" },
  denied: { dot: "attn", text: "אין גישה" },
  error: { dot: "attn", text: "לא סונכרן" },
  signed_out: { dot: "offline", text: "לא מחובר" },
};

/**
 * מחבר את הסנכרון לממשק. מחזיר את הפונקציה שמרעננת את השבב.
 *
 * @param {object} sync   מ-createSync
 * @param {object} hooks
 * @param {(text: string|null) => void} hooks.setBanner
 * @param {() => void} hooks.onEnter  נקרא כשעוברים ממסך הכניסה לאפליקציה
 */
export function mountAuth(sync, { setBanner, onEnter }) {
  const gate = document.getElementById("gate");
  const chip = document.getElementById("sync-chip");
  const app = document.querySelector("main");
  const tabbar = document.querySelector(".tabbar");
  const topbar = document.querySelector(".topbar");

  let localOnly = readFlag(LOCAL_ONLY_KEY);

  function showGate(on) {
    gate.hidden = !on;
    // הכניסה תופסת את המסך כולו: טאבים וכותרת של אפליקציה שעדיין לא
    // נפתחה הם רעש, ובמקרה של הטאבים גם יעדי מגע שלא עושים כלום.
    for (const el of [app, tabbar, topbar]) if (el) el.hidden = on;
    document.body.classList.toggle("is-gated", on);
  }

  /** מסך הכניסה נדרש רק כשיש תצורה, אין סשן, והמשתמש לא בחר מקומי. */
  function gateNeeded(state) {
    return state.configured && state.status === "signed_out" && !localOnly;
  }

  function renderGate(state) {
    const inner = gate.querySelector(".gate-inner");
    inner.replaceChildren();

    const title = document.createElement("h1");
    title.className = "gate-title";
    title.textContent = "מתכנן הארוחות";

    const sub = document.createElement("p");
    sub.className = "gate-sub";
    sub.textContent = "תכנון אחד, משותף לכל מי שמחובר אליו.";

    inner.append(title, sub);

    if (state.message) {
      const error = document.createElement("p");
      error.className = "gate-error";
      error.setAttribute("role", "alert");
      error.textContent = state.message;
      inner.append(error);
    }

    const signIn = document.createElement("button");
    signIn.type = "button";
    signIn.className = "act act-primary act-wide gate-signin";
    signIn.append(...signInContent());
    signIn.addEventListener("click", () => {
      signIn.disabled = true;
      signIn.replaceChildren(document.createTextNode("פותח את גוגל…"));
      sync.signIn();
    });

    const note = document.createElement("p");
    note.className = "gate-note";
    note.textContent = "מה שכבר תכננת במכשיר הזה יצטרף לתוכנית המשותפת.";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "gate-skip";
    skip.textContent = "המשך בלי חשבון";
    skip.addEventListener("click", () => {
      localOnly = true;
      writeFlag(LOCAL_ONLY_KEY, true);
      showGate(false);
      onEnter();
    });

    inner.append(signIn, note, skip);
  }

  function renderChip(state) {
    if (!state.configured) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;

    const preset = CHIP_STATE[state.status] || CHIP_STATE.signed_out;
    const name = state.user?.name?.split(" ")[0] || state.user?.email?.split("@")[0] || "";

    chip.replaceChildren();
    const dot = document.createElement("span");
    dot.className = `sync-dot sync-dot--${preset.dot}`;
    const label = document.createElement("span");
    label.className = "sync-label";
    label.textContent = state.signedIn === false ? preset.text : name || preset.text;
    chip.append(dot, label);
    // הטקסט הנראה הוא השם; מצב הסנכרון חייב להיאמר לקורא מסך בנפרד.
    chip.setAttribute("aria-label", `חשבון וסנכרון — ${preset.text}`);
  }

  function openAccount(state) {
    openOverlay({
      label: "חשבון וסנכרון",
      build: (panel, handle) => {
        const title = document.createElement("h2");
        title.className = "sheet-title";
        title.textContent = "חשבון";
        panel.append(title);

        if (state.user) {
          const who = document.createElement("p");
          who.className = "account-who";
          who.textContent = state.user.name || state.user.email;
          const mail = document.createElement("p");
          mail.className = "account-mail";
          mail.textContent = state.user.email;
          panel.append(who, mail);
        }

        const status = document.createElement("p");
        status.className = "account-status";
        const preset = CHIP_STATE[state.status] || CHIP_STATE.signed_out;
        status.textContent =
          state.status === "ok"
            ? `מסונכרן — ${agoLabel(state.lastSyncedAt, Date.now())}`
            : preset.text;
        panel.append(status);

        if (state.status === "offline") {
          const note = document.createElement("p");
          note.className = "account-note";
          note.textContent = "השינויים נשמרים במכשיר וייצאו לתוכנית המשותפת ברגע שתהיה רשת.";
          panel.append(note);
        }

        const actions = document.createElement("div");
        actions.className = "sheet-actions";

        if (state.signedIn) {
          const now = document.createElement("button");
          now.type = "button";
          now.className = "act act-wide";
          now.textContent = "סנכרן עכשיו";
          now.addEventListener("click", () => {
            sync.sync();
            handle.close();
          });

          const out = document.createElement("button");
          out.type = "button";
          out.className = "act act-wide";
          out.textContent = "התנתק";
          out.addEventListener("click", async () => {
            handle.close();
            await sync.signOut();
            localOnly = false;
            writeFlag(LOCAL_ONLY_KEY, false);
          });

          actions.append(now, out);
        } else {
          const inBtn = document.createElement("button");
          inBtn.type = "button";
          inBtn.className = "act act-primary act-wide";
          inBtn.append(...signInContent());
          inBtn.addEventListener("click", () => {
            handle.close();
            sync.signIn();
          });
          actions.append(inBtn);
        }

        panel.append(actions);
      },
    });
  }

  let last = sync.state();
  chip.addEventListener("click", () => openAccount(last));

  function apply(state) {
    last = { ...state, signedIn: sync.auth.signedIn };

    const needGate = gateNeeded(last);
    const wasGated = !gate.hidden;
    showGate(needGate);
    if (needGate) renderGate(last);
    else if (wasGated) onEnter();

    renderChip(last);

    // רק כשל שדורש פעולה עולה לבאנר. "אין רשת" נשאר בשבב.
    setBanner(last.status === "denied" || last.status === "error" ? last.message : null);
  }

  sync.subscribe(apply);
  apply(sync.state());

  return apply;
}
