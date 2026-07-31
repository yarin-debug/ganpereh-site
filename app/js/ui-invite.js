/* צירוף אדם שני — יצירת קוד שיתוף והזנתו.

   ── מה הפיצ'ר הזה באמת ─────────────────────────────────────────────
   עד כאן הסנכרון חיבר את המכשירים של *אותו* אדם: אותה כתובת מייל
   בטלפון ובמחשב. שני המסכים כאן הם מה שהופך אותו למשק בית — שני
   חשבונות שונים שרואים ועורכים את אותה תוכנית.

   ── הקוד נועד להיאמר, לא להיות מודבק ────────────────────────────────
   זו ההחלטה שמכתיבה כמעט הכל בקובץ הזה. האלפבית ב-`rest.js` כבר ויתר
   על 0/O ועל 1/I/L כדי שאפשר יהיה להקריא אותו בטלפון, ולכן:

     · הקוד מוצג בשתי קבוצות של ארבעה, כי כך קוראים אותו בקול
     · המפריד הוא רווח ולא מקף — מקף הוא תו שמישהו ינסה להקליד
     · אין כפתור העתקה. מסך שמניח הדבקה היה מחזיר את השאלה "למה
       בכלל האלפבית הזה", ומי שכן רוצה להעתיק יכול לסמן את הקוד
     · שדה ההזנה סלחני לרווחים, למקפים ולאותיות קטנות — כל אלה הם
       מה שקורה כשמישהו מקליד מה ששמע, ואף אחד מהם אינו טעות אמיתית

   ── למה שכבה ולא הרחבה במקום ────────────────────────────────────────
   מקטע הסנכרון במסך המאקרו נסרק בעין; שני המסכים האלה נעשים בישיבה
   אחת, עם טלפון ביד. אותה הבחנה בדיוק שמפרידה בין מסך הפתיחה
   לאפליקציה: צפיפות, לא חומרים.

   ── הערת שמות ───────────────────────────────────────────────────────
   בשרת ובקוד השכבה זה נקרא invite. במסך זה "קוד שיתוף", כי "הזמנה"
   באפליקציית אוכל נקראת קודם כל כהזמנה של אוכל. */

import { openOverlay, errorLine, fieldLabel } from "./ui-overlay.js";
import { getStore } from "./store.js";
import { AuthError, CODE_ALPHABET, createInvite } from "./sync/rest.js";
import { ensureHousehold, joinHousehold, currentHousehold } from "./sync/sync.js";

/* ---------- לוגיקה טהורה ---------- */

const CODE_LENGTH = 8;
const GROUP = 4;

/**
 * הקוד כפי שקוראים אותו — שתי קבוצות של ארבעה.
 *
 * קבוצה של ארבעה היא מה שאפשר להחזיק בראש בין המבט למקלדת, וזו גם
 * החלוקה שאדם עושה לבד כשהוא מקריא. אורך חריג מוחזר כמו שהוא: חלוקה
 * מומצאת על משהו שאיננו מזהים גרועה מהיעדר חלוקה.
 */
export function formatInviteCode(code) {
  const clean = String(code || "").toUpperCase();
  if (clean.length !== CODE_LENGTH) return clean;
  return `${clean.slice(0, GROUP)} ${clean.slice(GROUP)}`;
}

/**
 * מנרמל ומאמת קוד שהוקלד.
 *
 * ── מה נחשב טעות ומה לא ────────────────────────────────────────────
 * רווחים, מקפים ואותיות קטנות אינם טעות — הם מה שקורה כשמקלידים מה
 * ששומעים, והם מוסרים בשקט. תו שאינו באלפבית *כן* עוצר, כי הוא הרמז
 * היחיד שיש למישהו שכתב Q במקום O: הודעה מיידית עדיפה על "הקוד אינו
 * תקף" שמגיע מהשרת ונראה כאילו פג.
 *
 * @returns {{ok: boolean, value: string, problem: string|null}}
 */
export function normalizeInviteCode(raw) {
  // רווחים, מקף רגיל וכל משפחת המקפים הטיפוגרפיים (‐ – —) יורדים יחד:
  // אלה בדיוק התווים שנוספים כשמעתיקים קוד מהודעה או מקלידים אותו
  // בקבוצות, ואף אחד מהם אינו חלק ממנו.
  const value = String(raw || "")
    .toUpperCase()
    .replace(/[\s\-‐-―]/g, "");

  if (!value) return { ok: false, value: "", problem: "צריך להזין את הקוד שקיבלת." };

  for (const char of value) {
    if (!CODE_ALPHABET.includes(char)) {
      return {
        ok: false,
        value,
        problem: "יש בקוד תו שלא מופיע בקודים שלנו — כדאי לבדוק אותו שוב מול מי שיצר אותו.",
      };
    }
  }

  if (value.length !== CODE_LENGTH) {
    return { ok: false, value, problem: "קוד שיתוף הוא בן שמונה תווים." };
  }

  return { ok: true, value, problem: null };
}

/**
 * תוקף הקוד כמשפט.
 *
 * שעת התפוגה מגיעה מהשרת, ולכן היא הדבר היחיד שאפשר להבטיח. כשהיא
 * חסרה אומרים את מה שהסכמה מבטיחה ותו לא — "תוך יממה" — במקום להמציא
 * שעה משעון המכשיר.
 *
 * המשפט נגמר במילה עברית בכוונה: משפט שנגמר בספרות או בטקסט לטיני
 * מזיז את הנקודה הסופית לקצה השמאלי, והיא נראית שם כמו תקלה.
 */
export function inviteExpiryPhrase(expiresAt, now = Date.now()) {
  const at = expiresAt ? new Date(expiresAt) : null;
  const generic = "הקוד תקף לשימוש אחד, והוא פג תוך יממה.";
  if (!at || Number.isNaN(at.getTime())) return generic;

  const today = new Date(now);
  const days = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()) -
      new Date(today.getFullYear(), today.getMonth(), today.getDate())) /
      86400000,
  );
  const time = at.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  // השעה באמצע המשפט ולא בסופו: משפט עברי שנגמר בספרות מזיז את הנקודה
  // לקצה השמאלי, והיא נראית שם כמו תקלה. אותו כלל שהוליד את שורת
  // המייל הנפרדת ב-`ui-account.js`.
  if (days === 0) return `הקוד תקף היום עד השעה ${time}, ולשימוש אחד בלבד.`;
  if (days === 1) return `הקוד תקף מחר עד השעה ${time}, ולשימוש אחד בלבד.`;
  return generic;
}

/**
 * הודעת שגיאה של ההצטרפות, בעברית.
 *
 * אחותה של `authErrorMessage`, ומאותו נימוק: השרת מדבר אנגלית
 * והאפליקציה לא. היא נפרדת ממנה כי הנוסחים שם מדברים על שליחת קישור
 * ("לא הצלחנו לשלוח את הקישור"), וכאן שום דבר לא נשלח.
 *
 * הענף החשוב הוא הקוד שאינו תקף: השרת אומר רק `invalid or expired`,
 * ולמשתמש יש שלוש סיבות אפשריות שהוא לא יכול להבחין ביניהן. עדיף
 * למנות אותן מאשר להשאיר אותו מנחש אם להקליד שוב או לבקש קוד חדש.
 */
export function inviteErrorMessage(error) {
  const raw = String(error?.message || error || "").toLowerCase();

  if (raw.includes("invalid or expired")) {
    return "הקוד אינו תקף. ייתכן שכבר השתמשו בו, או שעברו יותר מ-24 שעות מאז שנוצר — כדאי לבקש קוד חדש.";
  }
  if (error instanceof AuthError || raw.includes("not authenticated") || raw.includes("jwt")) {
    return "ההתחברות פגה. יש להתחבר מחדש ואז לנסות שוב.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("aborted")) {
    return "אין כרגע חיבור לאינטרנט. אפשר לנסות שוב כשיהיה חיבור.";
  }
  return "משהו נכשל בדרך. אפשר לנסות שוב בעוד רגע.";
}

/* ---------- לבנים משותפות ---------- */

function note(text) {
  const p = document.createElement("p");
  p.className = "field-note";
  p.textContent = text;
  return p;
}

function title(panel, text, sub) {
  // מסמן את השכבה כדי שכללי המרווח בין ההערות יחולו עליה בלבד.
  panel.classList.add("inv-sheet");
  const heading = document.createElement("h2");
  heading.className = "sheet-title";
  heading.textContent = text;
  const line = document.createElement("p");
  line.className = "sheet-sub";
  line.textContent = sub;
  panel.append(heading, line);
}

function closeButton(handle, text = "סגירה") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-close";
  button.textContent = text;
  button.addEventListener("click", () => handle.close());
  return button;
}

/* ---------- יצירת קוד ---------- */

/**
 * הקוד עצמו.
 *
 * ── למה קובלט ולא חרס, ולמה מסגרת ולא מילוי ────────────────────────
 * קוד שממתין להצטרפות הוא בדיוק המצב האמצעי של משפחת הצורות: לא
 * הגענו / באמצע / נסגר. "באמצע" הוא מסגרת קובלט בכל מקום אחר
 * באפליקציה, ולכן גם כאן. מילוי חרס היה קורא כפעולה, והקוד אינו
 * פעולה — אין מה ללחוץ עליו.
 *
 * ── שם נגיש שמאיית ─────────────────────────────────────────────────
 * קורא מסך שנתקל ב-"K7QT M4XN" מנסה להגות אותו כמילה. מי שמעתיק קוד
 * צריך את התווים אחד-אחד, ולכן השם הנגיש מאיית אותם ברווחים. זה גם
 * בדיוק מה שאדם עושה כשהוא מקריא אותו בטלפון.
 */
function codeTile(code) {
  const tile = document.createElement("p");
  tile.className = "inv-code";
  tile.dir = "ltr";
  tile.textContent = formatInviteCode(code);
  tile.setAttribute("aria-label", `קוד השיתוף: ${[...code].join(" ")}`);
  return tile;
}

/**
 * שכבת "שיתוף התוכנית".
 *
 * הקוד נוצר בפתיחה ולא בלחיצה נוספת: הכפתור שפתח את השכבה כבר אמר
 * "יצירת קוד", וכפתור שני שאומר את אותו דבר הוא מס על אותה כוונה.
 */
export function openInviteSheet() {
  return openOverlay({
    label: "שיתוף התוכנית עם אדם נוסף",
    variant: "editor",
    build: (panel, handle) => {
      title(
        panel,
        "שיתוף התוכנית עם אדם נוסף",
        "הקוד מחבר מכשיר של אדם אחר לאותה תוכנית. משם והלאה שניכם רואים ועורכים את אותו שבוע.",
      );

      const body = document.createElement("div");
      // הקוד מגיע מהשרת, כלומר אחרי שהשכבה כבר נפתחה. בלי aria-live
      // קורא מסך היה נשאר עם "מייצר קוד…" ולא היה שומע שהגיע.
      body.setAttribute("aria-live", "polite");
      panel.append(body, closeButton(handle));

      async function generate() {
        body.replaceChildren(note("מייצר קוד…"));
        try {
          const householdId = currentHousehold() || (await ensureHousehold());
          const { code, expiresAt } = await createInvite(householdId);
          body.replaceChildren(
            codeTile(code),
            note(inviteExpiryPhrase(expiresAt)),
            note(
              "אפשר להקריא אותו בטלפון — אין בו אותיות או ספרות שמתחלפות זו בזו. האדם השני פותח את האפליקציה במכשיר שלו, מתחבר בכתובת המייל שלו, ומקיש על כפתור ההצטרפות באותו מקטע.",
            ),
          );
        } catch (error) {
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "act act-wide";
          retry.textContent = "ניסיון נוסף";
          retry.addEventListener("click", generate);
          body.replaceChildren(errorLine(inviteErrorMessage(error)), retry);
        }
      }

      generate();
    },
  });
}

/* ---------- הזנת קוד ---------- */

/**
 * שכבת "הצטרפות עם קוד".
 *
 * ── מה נאמר לפני הכפתור, ולמה ──────────────────────────────────────
 * ההצטרפות אינה מוחקת דבר, אבל היא כן מערבבת שתי תוכניות — ומי שלא
 * יודע את זה מראש רואה אחריה אנשים כפולים ומסיק שמשהו נשבר. המשפט
 * שמעל הכפתור אומר את שתי העובדות בסדר הנכון: קודם שכלום לא נמחק,
 * ואז מה כן יקרה. אזהרה שאומרת רק את השנייה קוראת כמו סכנה.
 *
 * @param {object} [options]
 * @param {() => void} [options.onJoined] נקרא אחרי הצטרפות שהצליחה
 */
export function openJoinSheet({ onJoined } = {}) {
  return openOverlay({
    label: "הצטרפות עם קוד",
    variant: "editor",
    build: (panel, handle) => {
      title(
        panel,
        "הצטרפות עם קוד",
        "מי שכבר מחובר יוצר את הקוד במכשיר שלו, במקטע הסנכרון שבמסך המאקרו.",
      );

      const body = document.createElement("div");
      panel.append(body);

      let value = "";
      let problem = null;
      let busy = false;

      function joinedView(sameHousehold) {
        // שורת המשנה מסבירה איך משיגים קוד, וברגע הזה זה כבר קרה.
        // הכותרת נשארת: פעולה שומרת את שמה לכל אורכה.
        panel.querySelector(".sheet-sub")?.remove();

        const head = document.createElement("p");
        head.className = "acc-head";
        const dot = document.createElement("span");
        dot.className = "acc-dot";
        dot.dataset.state = "cooked";
        dot.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = sameHousehold ? "כבר מחוברים יחד." : "הצטרפתם למשק בית משותף.";
        head.append(dot, label);

        body.replaceChildren(
          head,
          note(
            sameHousehold
              ? "המכשיר הזה כבר מסונכרן עם משק הבית שהקוד מוביל אליו, ולכן שום דבר לא השתנה."
              : "התוכנית המשותפת נמשכת עכשיו למכשיר, ומה שהיה כאן הצטרף אליה. אם אדם מופיע פעמיים — אפשר לארכב אחד מהם במסך המאקרו.",
          ),
          closeButton(handle, "סיום"),
        );
        // המיקוד עבר לכפתור שנמחק זה עתה, והוא נופל לגוף המסמך אם לא
        // מחזירים אותו לתוך השכבה.
        body.querySelector("button")?.focus();
      }

      function render() {
        const parts = [];
        if (problem) parts.push(errorLine(problem));

        const input = document.createElement("input");
        input.type = "text";
        input.className = "input inv-input";
        input.dir = "ltr";
        input.value = value;
        input.maxLength = 20; // רווחים ומקפים נכנסים ונופלים בנרמול
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("autocapitalize", "characters");
        input.dataset.autofocus = "true";
        input.addEventListener("input", () => {
          value = input.value;
        });
        input.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit();
        });

        parts.push(
          fieldLabel("קוד שיתוף", input),
          note("שמונה תווים. אפשר להזין עם רווח או בלי, ואותיות קטנות עובדות גם הן."),
          note(
            "מה שכבר במכשיר הזה — התוכנית, המנות והאנשים — לא נמחק. הוא מצטרף למשק הבית המשותף יחד עם מה שכבר יש שם.",
          ),
        );

        const go = document.createElement("button");
        go.type = "button";
        // המילוי היחיד בשכבה הזו, והפעולה היחידה שיש בה. אותו כלל
        // שאוסר שני מלבנים כתומים במסך המאקרו מרשה אחד כאן.
        go.className = "act act-wide act-primary";
        go.textContent = busy ? "מצטרפים…" : "הצטרפות";
        go.disabled = busy;
        go.addEventListener("click", submit);

        parts.push(go, closeButton(handle, "ביטול"));
        body.replaceChildren(...parts);

        // אחרי שגיאה השדה נבנה מחדש והמיקוד נופל לגוף המסמך. תיקון מה
        // שהוקלד הוא הדבר היחיד שאפשר לעשות עכשיו, ולכן הוא מקבל אותו.
        if (problem) input.focus();
      }

      async function submit() {
        if (busy) return;
        const checked = normalizeInviteCode(value);
        if (!checked.ok) {
          problem = checked.problem;
          render();
          return;
        }
        busy = true;
        problem = null;
        render();
        try {
          const result = await joinHousehold(checked.value, getStore());
          if (onJoined) onJoined();
          joinedView(!result.joined);
        } catch (error) {
          problem = inviteErrorMessage(error);
          busy = false;
          render();
        }
      }

      render();
    },
  });
}
