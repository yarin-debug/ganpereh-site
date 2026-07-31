/* סנכרון בין מכשירים — ההתחברות, מצב הסנכרון, וצירוף האדם השני.

   ── למה זה יושב במסך המאקרו ולא במסך משלו ───────────────────────────
   מאותו נימוק בדיוק שבגללו עורך הפרופיל והגיבוי יושבים שם: לאפליקציה
   אין מסך הגדרות בכוונה, כי מסך הגדרות הוא מקום שצריך לזכור שהוא קיים.
   מסך המאקרו הוא כבר המסך של "מי אנחנו", הגיבוי הוא "מה שלנו",
   והסנכרון הוא "אותו דבר גם במכשיר השני". טאב שישי בשביל פעולה שעושים
   פעם אחת בחיים היה עולה לכולם, כל יום.

   הוא יושב **מעל** הגיבוי ולא מתחתיו, כי הגיבוי הוא התחליף הידני
   לבעיה שהסנכרון פותר לבד. הסדר הזה גם מתקן משפט: ההערה שליד הגיבוי
   אומרת "אין שרת שישחזר", וזה מפסיק להיות נכון ברגע שמתחברים —
   ui-backup.js מרכך אותה בהתאם.

   ── מה זה מדליק ─────────────────────────────────────────────────────
   שכבת הסנכרון (js/sync/) שלמה ומוגדרת, ו-config.js כבר נושא כתובת
   ומפתח אמיתיים. מה שמחזיק אותה רדומה הוא `signedIn()` בלבד: כל מסלול
   שיוצא לרשת יוצא עליו. כלומר המסך הזה אינו "עוד מסך" אלא המתג —
   ההתחברות הראשונה כותבת סשן, והמאזינים שכבר רשומים מתחילים לירות
   סנכרון בלי שורת תצורה אחת נוספת.

   ── כלל המילוי, ומה הוא אומר כאן ────────────────────────────────────
   מילוי חרס מלא שמור לפעולה *אחת* שצריך לעשות עכשיו, ולכן הוא נודד
   בין המצבים ולא נשאר במקומו: מנותק → "שליחת קישור", מחובר ולבד →
   "צירוף אדם". במצב "שלחנו קישור" אין מילוי בכלל, ובמצב "שני חשבונות
   מסונכרנים" אין מילוי בכלל — בראשון הפעולה הבאה נמצאת באפליקציית
   המייל ולא כאן, ובשני אין פעולה. מסך שמאיר כפתור כשאין מה לעשות בו
   מלמד להתעלם מהמילוי, וזה בדיוק מה שהכלל נועד למנוע. */

import { getStore } from "./store.js";
import { syncConfigured } from "./sync/config.js";
import { sendMagicLink, signedIn, currentUser, signOut } from "./sync/auth.js";
import { createInvite, redeemInvite, householdMembers, AuthError } from "./sync/rest.js";
import {
  syncNow,
  syncStatus,
  currentHousehold,
  adoptHousehold,
  forgetHousehold,
} from "./sync/sync.js";
import {
  normalizeEmail,
  formatInviteCode,
  syncLine,
  householdTiles,
  sendFailure,
} from "./sync/present.js";
import { openOverlay, errorLine } from "./ui-overlay.js";

/* ---------- מצב שחייב לשרוד רינדור מחדש ----------

   המסך נבנה מאפס בכל שינוי מצב (app.js מרנדר את הטאב הפעיל), ולכן
   "שלחנו קישור למייל הזה" לא יכול לחיות בתוך הפונקציה שבונה אותו.
   מודול אחד, מסך אחד, ולכן די בהפניות יחידות. */

/** הכתובת שאליה נשלח קישור וטרם נקלט ממנה סשן. */
let awaitingLink = null;

/** ספירת החברים — נמשכת מהרשת, ולכן מטמון ולא שאילתה בכל רינדור. */
let members = { household: null, count: null, tried: false };

/**
 * מושך את ספירת החברים פעם אחת למשק בית.
 *
 * ── למה ניסיון אחד ולא ניסיונות חוזרים ──────────────────────────────
 * הרינדור כאן תכוף (כל שינוי מצב וכל דיווח של מנוע הסנכרון), וניסיון
 * חוזר בכל רינדור היה הופך כישלון רשת יחיד לזרם בקשות. כישלון כאן
 * גם אינו מצב שגיאה: האריחים פשוט לא מצוירים, ושורת המצב לבדה כבר
 * אומרת את מה שצריך. הצירוף וההצטרפות מרעננים במפורש, וטעינה מחדש
 * מנסה שוב.
 */
function ensureMembers(redraw) {
  const id = currentHousehold();
  if (!id) return;
  if (members.household === id && members.tried) return;
  members = { household: id, count: null, tried: true };
  householdMembers(id)
    .then((count) => {
      if (members.household !== id) return;
      members.count = count;
      redraw();
    })
    .catch(() => {
      /* אין ספירה — לא מציירים אריחים. ראה למעלה. */
    });
}

/** אחרי צירוף או הצטרפות הספירה השתנתה, ולכן המטמון נפסל. */
function invalidateMembers() {
  members = { household: null, count: null, tried: false };
}

/* ---------- לבנים קטנות ---------- */

/**
 * כתובת מייל או קוד בתוך משפט עברי.
 *
 * ── למה bdi ולא span ────────────────────────────────────────────────
 * מחרוזת לטינית בתוך פסקה RTL גוררת את הפיסוק שלידה: "מחוברים כ-
 * a@b.com." מרונדר עם הנקודה בצד השגוי, וכתובת שיש בה מקף או פלוס
 * נשברת באמצע. bdi מבודד את הכיוון בדיוק בשביל זה, ובלי CSS.
 */
function ltr(text) {
  const el = document.createElement("bdi");
  el.dir = "ltr";
  el.textContent = text;
  return el;
}

function note(text) {
  const p = document.createElement("p");
  p.className = "field-note";
  p.textContent = text;
  return p;
}

function quietButton(key, text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sync-quiet";
  button.dataset.focusKey = `sync:${key}`;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

/* ---------- שכבה: הקוד לצירוף ---------- */

/**
 * מציג קוד הזמנה חד-פעמי.
 *
 * הקוד נוצר *לפני* פתיחת השכבה ולא בתוכה: שכבה שנפתחת ריקה ואז
 * מתמלאת היא הבזק, ושכבה שנפתחת ונכשלת היא שכבה שצריך לסגור. כשל
 * מדווח במקום שממנו לחצו.
 */
function openInviteCode(code, redraw) {
  return openOverlay({
    label: "קוד לצירוף",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "קוד לצירוף";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "תקף ל-24 שעות ונשרף אחרי שימוש אחד.";

      /* הקוד עצמו — מקובץ, מרווח, ובגופן שווה-רוחב.

         זה המקום היחיד באפליקציה שמציג מחרוזת שנועדה להיאמר בקול, וזה
         מכתיב את שלושת המאפיינים: הקיבוץ לשתי רביעיות נותן מקום לעצור
         באמצע, המרווח מונע מזוג אותיות להיקרא כאות אחת, ורוחב אחיד
         מונע את הבלבול שגופן פרופורציונלי יוצר בין תווים צרים. */
      const codeEl = document.createElement("p");
      codeEl.className = "sync-code";
      codeEl.dir = "ltr";
      codeEl.textContent = formatInviteCode(code);

      const copyState = document.createElement("p");
      copyState.className = "field-note";
      copyState.setAttribute("role", "status");
      copyState.textContent = "";

      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "act act-wide";
      copy.textContent = "העתקת הקוד";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code);
          copyState.textContent = "הקוד הועתק.";
        } catch {
          // דפדפן שחוסם את הלוח אינו תקלה שצריך להתנצל עליה — הקוד
          // ממילא מוצג למעלה וניתן לסימון ביד.
          copyState.textContent = "הדפדפן לא נתן להעתיק. אפשר לסמן את הקוד למעלה ולהעתיק ידנית.";
        }
      });

      const how = document.createElement("p");
      how.className = "field-note";
      /* שם הכפתור בסוף המשפט ובלי מרכאות. גרסה קודמת עטפה אותו
         בגרשיים, והם נחתו בצד השגוי: סימן פיסוק שיושב בגבול בין עברית
         לביטוי מצוטט נגרר לפי כללי הכיוון ולא לפי מה שנכתב. אותה
         מלכודת בדיוק שבגללה כתובות המייל עטופות ב-bdi. */
      how.textContent =
        "מי שמצטרף פותח את האפליקציה אצלו, מתחבר עם המייל שלו, ואז לוחץ במסך המאקרו על הצטרפות למשק בית.";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "sheet-close";
      close.textContent = "סגירה";
      close.addEventListener("click", () => {
        handle.close();
        // הצירוף עשוי היה להיסגר בזמן שהשכבה הייתה פתוחה. הספירה
        // נמשכת מחדש כדי שהאריחים יראו את המצב ולא את מה שהיה.
        invalidateMembers();
        redraw();
      });

      panel.append(heading, sub, codeEl, copy, copyState, how, close);
    },
  });
}

/* ---------- שכבה: הצטרפות בקוד ---------- */

/**
 * מצטרף למשק בית קיים.
 *
 * ── מה נאמר כאן במפורש, ולמה ────────────────────────────────────────
 * `adoptHousehold` מאפס את הטביעות בכוונה, כדי שהתוכנית שכבר במכשיר
 * *תצטרף* למשק הבית במקום להימחק בהחלה הראשונה. הצד השני של אותו
 * מטבע הוא שבמפתח שקיים בשני הצדדים — משבצת באותו יום, מנה באותו
 * מזהה — הגרסה של המכשיר המצטרף היא זו שנשארת.
 *
 * זה בדיוק סוג הדבר שהאפליקציה הזו אומרת מראש ולא מגלה אחר כך, ולכן
 * המשפט יושב מעל הכפתור ולא בתיעוד.
 */
function openJoinHousehold(redraw) {
  const store = getStore();

  return openOverlay({
    label: "הצטרפות למשק בית",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "הצטרפות למשק בית";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = "הזן את הקוד שקיבלת ממי שכבר מסונכרן.";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "input sync-code-input";
      input.dir = "ltr";
      input.autocapitalize = "characters";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = "ABCD EFGH";
      input.dataset.autofocus = "true";
      input.setAttribute("aria-label", "קוד הצטרפות");

      const warn = document.createElement("p");
      warn.className = "field-note";
      warn.textContent =
        "התוכנית שבמכשיר הזה תצטרף למשק הבית. אם אותו פריט קיים בשני הצדדים, הגרסה מהמכשיר הזה היא זו שתישאר.";

      const error = errorLine("");
      error.hidden = true;

      const join = document.createElement("button");
      join.type = "button";
      join.className = "act act-wide act-primary";
      join.textContent = "הצטרפות";
      join.addEventListener("click", async () => {
        error.hidden = true;
        // שדה ריק אינו "קוד לא תקף". להחזיר עליו את הודעת הדחייה היה
        // שולח לחפש בעיה בקוד שמעולם לא הודבק.
        if (!input.value.trim()) {
          error.textContent = "צריך להזין את הקוד.";
          error.hidden = false;
          input.focus();
          return;
        }
        join.disabled = true;
        join.textContent = "מצטרפים…";
        try {
          const id = await redeemInvite(input.value);
          if (!id) throw new Error("הקוד אינו תקף.");
          adoptHousehold(id);
          invalidateMembers();
          handle.close();
          // סבב מיידי ולא המתנה להשהיה: ההצטרפות היא בדיוק הרגע שבו
          // רוצים לראות שהיא עבדה.
          await syncNow(store);
          redraw();
        } catch (err) {
          error.textContent =
            err instanceof AuthError
              ? "ההתחברות פגה. יש להתחבר שוב לפני ההצטרפות."
              : "הקוד אינו תקף, כבר נוצל, או שפג תוקפו. אפשר לבקש קוד חדש.";
          error.hidden = false;
          join.disabled = false;
          join.textContent = "הצטרפות";
        }
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(heading, sub, input, warn, error, join, cancel);
    },
  });
}

/* ---------- מצב: מנותק ---------- */

function buildSignIn(redraw) {
  const wrap = document.createElement("div");

  // עובדה, ואז ההצעה. אותו מבנה בדיוק כמו במצב המחובר, כדי שהשורה
  // הראשונה במקטע תמיד תענה על "מה המצב עכשיו".
  const line = syncLine({ signedIn: false, status: null, now: Date.now() });
  const status = document.createElement("p");
  status.className = "sync-line";
  status.dataset.tone = line.tone;
  status.textContent = line.text;

  wrap.append(
    status,
    note(
      "התחברות פותחת את אותה תוכנית גם במכשיר שני. העבודה בלי קליטה נשארת כמו שהיא — הסנכרון רץ לצד האחסון במכשיר, לא במקומו.",
    ),
  );

  const input = document.createElement("input");
  input.type = "email";
  input.className = "input";
  input.dir = "ltr";
  input.inputMode = "email";
  input.autocomplete = "email";
  input.spellcheck = false;
  input.placeholder = "you@example.com";
  input.dataset.focusKey = "sync:email";
  // בלי aria-label: ה-label שעוטף אותו כבר נותן את השם הנגיש, ותכונה
  // שנייה הייתה גוברת עליו — כלומר שתי מחרוזות שצריך לזכור לעדכן יחד.
  const label = document.createElement("label");
  label.className = "field";
  const labelText = document.createElement("span");
  labelText.className = "field-label";
  labelText.textContent = "כתובת מייל";
  label.append(labelText, input);

  const error = errorLine("");
  error.hidden = true;

  const send = document.createElement("button");
  send.type = "button";
  send.className = "act act-wide act-primary";
  send.dataset.focusKey = "sync:send";
  send.textContent = "שליחת קישור התחברות";

  const submit = async () => {
    error.hidden = true;
    // הפסילה המקומית קודמת לבקשה: כתובת בלי שטרודל אינה שווה נסיעה
    // לשרת, והתשובה עליה מיידית.
    const clean = normalizeEmail(input.value);
    if (!clean.ok) {
      error.textContent = clean.error;
      error.hidden = false;
      input.focus();
      return;
    }

    send.disabled = true;
    send.textContent = "שולחים…";
    try {
      // הקישור חייב לחזור לאפליקציה עצמה ובלי ה-fragment הנוכחי,
      // אחרת Supabase מוסיף את האסימונים על גבי hash קיים.
      await sendMagicLink(clean.email, location.origin + location.pathname);
      awaitingLink = clean.email;
      redraw();
    } catch (err) {
      error.textContent = sendFailure(err);
      error.hidden = false;
      send.disabled = false;
      send.textContent = "שליחת קישור התחברות";
    }
  };

  send.addEventListener("click", submit);
  // Enter בשדה מייל הוא מה שאצבע אחת בטלפון עושה, ובלעדיו צריך לסגור
  // מקלדת כדי להגיע לכפתור.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  wrap.append(label, error, send);
  return wrap;
}

/* ---------- מצב: הקישור נשלח ---------- */

/**
 * ההמתנה למייל.
 *
 * ── המסך היחיד כאן בלי מילוי מלא, וזה מכוון ─────────────────────────
 * הפעולה הבאה של המשתמש אינה במסך הזה אלא באפליקציית המייל. כפתור
 * ראשי בוהק שאומר "שליחה שוב" היה מזמין ללחוץ עליו שוב ושוב במקום
 * ללכת לבדוק — כלומר לייצר עוד קישורים שכל אחד מהם מבטל את קודמו.
 * שתי האפשרויות כאן שקטות בכוונה.
 */
function buildAwaiting(redraw) {
  const wrap = document.createElement("div");

  const sent = document.createElement("p");
  sent.className = "sync-line";
  sent.dataset.tone = "good";
  sent.setAttribute("role", "status");
  sent.append(
    document.createTextNode("שלחנו קישור ל-"),
    ltr(awaitingLink),
    document.createTextNode("."),
  );

  wrap.append(
    sent,
    note(
      "צריך לפתוח אותו מהמכשיר הזה — הקישור מחבר את הדפדפן שבו הוא נפתח. אם הוא לא הגיע תוך דקה, שווה לבדוק בספאם.",
    ),
  );

  const error = errorLine("");
  error.hidden = true;

  const again = quietButton("again", "שליחה שוב", async () => {
    error.hidden = true;
    again.disabled = true;
    again.textContent = "שולחים…";
    try {
      await sendMagicLink(awaitingLink, location.origin + location.pathname);
      again.textContent = "נשלח שוב";
    } catch (err) {
      error.textContent = sendFailure(err);
      error.hidden = false;
      again.disabled = false;
      again.textContent = "שליחה שוב";
    }
  });

  const other = quietButton("other", "כתובת אחרת", () => {
    awaitingLink = null;
    redraw();
  });

  const row = document.createElement("div");
  row.className = "sync-quiet-row";
  row.append(again, other);

  wrap.append(error, row);
  return wrap;
}

/* ---------- מצב: מחוברים ---------- */

function buildSignedIn(redraw) {
  const store = getStore();
  const wrap = document.createElement("div");

  ensureMembers(redraw);
  const tiles = householdTiles(members.household === currentHousehold() ? members.count : null);

  if (tiles) {
    /* הצורות שקטות לקורא מסך והכיתוב מתחתן נושא את המידע — אותו הסכם
       בדיוק כמו ריבועי מסך הפתיחה מול "שלב 2 מתוך 3". */
    const row = document.createElement("div");
    row.className = "sync-tiles";
    row.setAttribute("aria-hidden", "true");
    for (const state of tiles.states) {
      const tile = document.createElement("span");
      tile.className = "sync-tile";
      tile.dataset.state = state;
      row.append(tile);
    }
    const caption = document.createElement("p");
    caption.className = "sync-caption";
    caption.textContent = tiles.caption;
    wrap.append(row, caption);
  }

  const line = syncLine({ signedIn: true, status: syncStatus(), now: Date.now() });
  const status = document.createElement("p");
  status.className = "sync-line";
  status.dataset.tone = line.tone;
  /* בלי role="status" בכוונה, למרות שזו שורת מצב.

     המקטע נבנה מחדש בכל שינוי מצב של האפליקציה, לא רק כשהסנכרון
     דיווח משהו — כלומר עריכת מנה או סימון פריט בקניות היו מקריאים
     שוב "סונכרן לפני רגע" לקורא מסך שנמצא במסך אחר לגמרי. אזור חי
     שמכריז על דבר שלא השתנה הוא רעש שגורם לכבות אותו.

     מה שכן חי כאן הוא מה שהמשתמש הרגע גרם לו: אישור שליחת הקישור
     ואישור ההעתקה. ונעילת סכמה ממילא מגיעה לבאנר, שהוא aria-live. */
  status.textContent = line.text;
  wrap.append(status);

  const error = errorLine("");
  error.hidden = true;
  wrap.append(error);

  /* המילוי נודד: כל עוד אין אדם שני, הצירוף הוא הפעולה שצריך לעשות
     עכשיו. ברגע שיש — אין במסך הזה שום פעולה, ולכן אין בו מילוי. */
  const alone = !tiles || tiles.states.includes("empty");

  const invite = document.createElement("button");
  invite.type = "button";
  invite.className = alone ? "act act-wide act-primary" : "act act-wide";
  invite.dataset.focusKey = "sync:invite";
  invite.textContent = "צירוף אדם למשק הבית";
  invite.addEventListener("click", async () => {
    error.hidden = true;
    invite.disabled = true;
    invite.textContent = "מכינים קוד…";
    try {
      // משק הבית נוצר בסבב הסנכרון הראשון, וייתכן שהוא טרם רץ. סבב
      // כאן מבטיח שיש למה לצרף לפני שמנפיקים קוד.
      if (!currentHousehold()) await syncNow(store);
      const id = currentHousehold();
      if (!id) throw new Error("no household");
      const code = await createInvite(id);
      openInviteCode(code, redraw);
    } catch (err) {
      error.textContent =
        err instanceof AuthError
          ? "ההתחברות פגה. יש להתחבר שוב כדי להנפיק קוד."
          : "לא הצלחנו להנפיק קוד עכשיו. בדוק את החיבור ונסה שוב.";
      error.hidden = false;
    } finally {
      invite.disabled = false;
      invite.textContent = "צירוף אדם למשק הבית";
    }
  });
  wrap.append(invite);

  /* הזהות יושבת ליד ההתנתקות ולא מעל הכפתור הראשי.

     היא ההקשר של "התנתקות" — לפני שמנתקים רוצים לדעת *את מי* — ואינה
     ההקשר של "צירוף אדם". מעל הכפתור הראשי היא גם דחקה שלוש שורות
     טקסט זו על זו לפני הפעולה היחידה שצריך לעשות במסך. */
  const who = document.createElement("p");
  who.className = "sync-who";
  who.append(document.createTextNode("מחוברים כ-"), ltr(currentUser()?.email || ""));
  wrap.append(who);

  const row = document.createElement("div");
  row.className = "sync-quiet-row";

  row.append(
    quietButton("join", "הצטרפות למשק בית", () => {
      error.hidden = true;
      openJoinHousehold(redraw);
    }),
  );

  row.append(
    quietButton("signout", "התנתקות", async () => {
      await signOut();
      /* ניתוק מנתק גם את המכשיר ממשק הבית, ולא רק מהחשבון.

         בלי זה מזהה משק הבית היה שורד באחסון, ו-`ensureHousehold`
         מחזיר אותו בלי לבדוק חברות — כלומר מי שיתחבר אחריו במכשיר
         הזה היה מנסה למשוך ולדחוף למשק בית שהוא אינו חבר בו, מקבל
         דחייה מה-RLS, ורואה "ההתחברות פגה" בלולאה. הנתונים במכשיר
         נשארים; הם היו כאן לפני החשבון. */
      forgetHousehold();
      invalidateMembers();
      awaitingLink = null;
      redraw();
    }),
  );

  wrap.append(row);
  return wrap;
}

/* ---------- המקטע ---------- */

function paint(wrap, redraw) {
  /* המקטע מרנדר את עצמו, ולכן שחזור המיקוד שב-app.js אינו חל עליו.

     בלי השחזור הזה ספירת החברים — שחוזרת מהרשת שנייה אחרי הרינדור
     הראשון — הייתה מפילה את המיקוד ל-body בדיוק כשמישהו מנווט כאן
     במקלדת. אותו מנגנון ואותו שם תכונה כמו ב-app.js, כדי שפקד שיעבור
     בין שני המסלולים לא יצטרך שני מפתחות. */
  const active = document.activeElement;
  const focusKey = wrap.contains(active) ? active.dataset?.focusKey : null;

  wrap.replaceChildren();

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "סנכרון בין מכשירים";
  wrap.append(title);

  if (signedIn()) {
    // סשן שנקלט מייתר את ההמתנה למייל, גם אם הקישור נפתח בטאב אחר.
    awaitingLink = null;
    wrap.append(buildSignedIn(redraw));
  } else if (awaitingLink) {
    wrap.append(buildAwaiting(redraw));
  } else {
    wrap.append(buildSignIn(redraw));
  }

  if (!focusKey) return;
  const back = wrap.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
  // preventScroll: בלעדיו הדפדפן מקפיץ את הגלילה אל הפקד המשוחזר,
  // והמקטע הזה יושב בתחתית מסך ארוך.
  if (back instanceof HTMLElement) back.focus({ preventScroll: true });
}

/**
 * מקטע הסנכרון למסך המאקרו.
 *
 * ── למה הוא מרנדר את עצמו ולא מבקש רינדור מסך ────────────────────────
 * רוב המעברים כאן אינם שינוי מצב של ה-store: "שלחנו קישור", ספירת
 * חברים שחזרה מהרשת, התנתקות. אין להם דרך לעבור דרך `store.subscribe`,
 * ולבקש מהמסך להתרנדר מחדש היה בונה מחדש גם את כרטיסי האנשים שמעליו
 * בשביל שורה אחת שהשתנתה כאן. הקשר היחיד החוצה נשאר `onSyncStatus`
 * ב-app.js, ששם ממילא יושב המנוי היחיד שמרנדר.
 */
export function buildSyncSection() {
  // השער הראשון: כתובת פרויקט ריקה = הסנכרון כבוי לגמרי, וגם המסך
  // שמדליק אותו אינו קיים. זו עדיין הדרך המהירה לעצור הכל.
  if (!syncConfigured()) return null;

  const wrap = document.createElement("section");
  wrap.className = "sync";

  const redraw = () => paint(wrap, redraw);
  paint(wrap, redraw);

  return wrap;
}
