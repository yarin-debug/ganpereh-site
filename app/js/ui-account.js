/* חיבור המכשיר — הזנת מייל, קישור קסם, וחיווי מצב הסנכרון.

   ── למה זה יושב במסך המאקרו ─────────────────────────────────────────
   מאותו נימוק שבגללו הגיבוי ועורך הפרופיל יושבים שם: לאפליקציה אין
   מסך הגדרות בכוונה, כי מסך הגדרות הוא מקום שצריך לזכור שהוא קיים.
   מסך המאקרו הוא כבר המסך של "מי אנחנו" ו"מה שלנו", והחיבור הוא
   "איפה זה נשמר".

   ── הכלל שמכתיב את הצורה כאן ────────────────────────────────────────
   מילוי מלא שמור לפעולה *אחת* שצריך לעשות עכשיו, ומה שהושלם מקבל קו
   וגוון רך. מכאן נגזרים שלושת המצבים בלי שיקול דעת נוסף:

     מנותק  → "שליחת קישור" היא הפעולה עכשיו       → מילוי חרס
     נשלח   → הפעולה עברה לתיבת המייל, לא כאן      → אין מילוי בכלל
     מחובר  → סנכרון שעובד הוא מצב שנסגר           → קו וגוון קובלט

   המצב האמצעי הוא זה שקל לטעות בו: הפיתוי הוא להשאיר כפתור "שליחה
   חוזרת" ממולא, כי הוא הכפתור היחיד על המסך. אבל מה שצריך לעשות אחרי
   שנשלח קישור הוא לפתוח את המייל — ושליחה חוזרת היא בדיוק *לא* זה.
   כפתור ממולא שם היה דוחף את המשתמש למחזור של שליחות מיותרות.

   באותו היגיון אין במצב "מחובר" שום כפתור ממולא. סנכרון שעובד אינו
   מטלה, וכפתור "סנכרן עכשיו" ממולא היה ממציא אחת.

   ── שלוש הצורות אינן חדשות ──────────────────────────────────────────
   מקווקו / מסגרת קובלט / אריח רך עם וי הן אותן שלוש צורות של פס השבוע
   ושל ריבועי מסך הפתיחה, מוגדרות פעם אחת ב-CSS. שלושת המצבים כאן
   נופלים עליהן בדיוק, ולכן `.acc-dot` מצטרף למשפחה הקיימת במקום
   לייצר אוצר מילים רביעי לאותה אמירה. */

import { sendMagicLink, signOut, signedIn, currentUser } from "./sync/auth.js";
import { syncStatus, onSyncStatus, resetSync } from "./sync/sync.js";
import { errorLine, fieldLabel } from "./ui-overlay.js";
import { openInviteSheet, openJoinSheet } from "./ui-invite.js";

/* המייל שאליו נשלח קישור, שורד רענון.

   בלי ההתמדה הזו המסלול הסביר ביותר נשבר: שולחים קישור, יוצאים
   לאפליקציית המייל, וחוזרים — ואם האפליקציה נפרקה מהזיכרון בינתיים,
   המסך חוזר לשדה מייל ריק כאילו לא קרה כלום. "האם זה בכלל נשלח?" הוא
   בדיוק הרגע שבו אנשים שולחים שוב ושוב. */
const PENDING_KEY = "gp_meals_pending_email";

/* ---------- לוגיקה טהורה ---------- */

/**
 * מנרמל ומאמת כתובת מייל.
 *
 * מחמיר יותר מ-`sendMagicLink`, שמסתפק ב-`@`, ובכוונה: כתובת כמו
 * `yarin@gmail` עוברת שם, Supabase מקבל אותה בלי להתלונן, והמשתמש
 * ממתין לדואר שלא יגיע לעולם. כשל שקט שנמשך דקות גרוע בהרבה משגיאה
 * מיידית, ולכן הבדיקה כאן דורשת גם נקודה בדומיין.
 *
 * @returns {{ok: boolean, value: string, problem: string|null}}
 */
export function normalizeEmail(raw) {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value) return { ok: false, value: "", problem: "צריך כתובת מייל כדי לשלוח קישור." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    // בלי נקודה בסוף בכוונה: המשפט נגמר בטקסט לטיני, ונקודה עברית
    // אחריו נודדת לקצה השמאלי ונראית כמו תקלה בעצמה.
    return { ok: false, value, problem: "הכתובת לא נראית שלמה. צריך משהו בסגנון name@example.com" };
  }
  return { ok: true, value, problem: null };
}

/**
 * הודעת שגיאה של שכבת ההתחברות, בעברית.
 *
 * ── למה זה קיים ────────────────────────────────────────────────────
 * `authFetch` זורק עם הנוסח שהשרת החזיר, ו-Supabase מדבר אנגלית.
 * הגרסה הראשונה הציגה אותו כמו שהוא, ועל המסך הופיע
 * "email rate limit exceeded" — באנגלית, בתוך אפליקציה שכל מחרוזת
 * בה עברית, ובלי שום רמז מה עושים עכשיו.
 *
 * ההודעה החשובה מכולן היא חסימת הקצב, כי היא זו שנראית כמו תקלה
 * חמורה ואינה כזו: היא נגמרת מעצמה. ובעיקר — הקישור הקודם שכבר הגיע
 * עדיין תקף, וזו העצה שחוסכת את ההמתנה. בלי המשפט הזה אנשים ממתינים
 * שעה על משהו שכבר יושב להם בתיבה.
 */
export function authErrorMessage(error) {
  const raw = String(error?.message || error || "").toLowerCase();

  /* "you can only request this after 47 seconds" — המתנה קצרה וידועה,
     ולכן אומרים את המספר במקום "נסה שוב מאוחר יותר". */
  const seconds = raw.match(/after (\d+) seconds?/);
  if (seconds) {
    const n = Number(seconds[1]);
    return n === 1 ? "אפשר לשלוח קישור נוסף בעוד שנייה." : `אפשר לשלוח קישור נוסף בעוד ${n} שניות.`;
  }

  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "נשלחו יותר מדי קישורים בזמן קצר, והשליחה חסומה לכשעה. הקישור האחרון שכבר הגיע עדיין תקף — כדאי לחפש אותו במייל במקום להמתין.";
  }
  if (raw.includes("signups not allowed") || raw.includes("signup is disabled")) {
    return "הכתובת הזו אינה רשומה, והרשמות סגורות כרגע.";
  }
  if (raw.includes("invalid") && raw.includes("email")) {
    return "השרת דחה את הכתובת. כדאי לבדוק שהיא נכתבה נכון.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("aborted")) {
    return "אין כרגע חיבור לאינטרנט, ולכן לא שלחנו. אפשר לנסות שוב כשיהיה חיבור.";
  }
  // נוסח לא מוכר: לא ממציאים הסבר, אבל גם לא מציגים אנגלית.
  return "לא הצלחנו לשלוח את הקישור. אפשר לנסות שוב בעוד רגע.";
}

/** ניסוח יחסי לרגע הסנכרון האחרון. */
export function agoPhrase(at, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes === 1) return "לפני דקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "לפני שעה";
  if (hours < 24) return `לפני ${hours} שעות`;
  return "לפני יותר מיממה";
}

/**
 * מצב הסנכרון כמשפט.
 *
 * `offline` ו-`locked` נושאים כבר נוסח מלא מ-`sync.js` ולכן נמסרים
 * כמו שהם — שכפול הניסוח כאן היה מייצר שתי אמיתות שנפרדות בשקט.
 */
export function syncPhrase(status, now = Date.now()) {
  if (!status) return "";
  switch (status.state) {
    case "syncing":
      return "מסנכרן…";
    case "ok":
      return `מסונכרן ${agoPhrase(status.at, now)}`;
    case "offline":
    case "locked":
    case "signed_out":
      return status.message || "";
    default:
      return "ממתין לסנכרון הראשון.";
  }
}

/* ---------- מצב מקומי של המקטע ---------- */

/* המסך נבנה מחדש בכל שינוי מצב, ולכן מה שהוקלד ולא נשמר נהרס תחת
   המשתמש. שחזור הפוקוס ב-app.js מחזיר את הסמן אבל לא את הערך, ולכן
   הטיוטה יושבת כאן ולא ב-DOM בלבד. */
let draft = "";
let sending = false;
let problem = null;

function readPending() {
  try {
    return localStorage.getItem(PENDING_KEY) || null;
  } catch {
    return null;
  }
}

function writePending(email) {
  try {
    if (email) localStorage.setItem(PENDING_KEY, email);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* אחסון חסום — המצב יחיה עד לרענון. לא שווה להפיל עליו זרימה */
  }
}

/* עדכון חי של שורת המצב.

   מנוי יחיד ברמת המודול, ולא אחד לכל בנייה: המקטע נבנה מחדש בכל
   שינוי מצב, ומנוי בתוך הבנייה היה נערם עד שכל שינוי סטטוס היה יורה
   עשרות פעמים. החיפוש ב-DOM בכל אירוע מוותר על החזקת הפניה שממילא
   מתיישנת בבנייה הבאה. */
onSyncStatus((status) => {
  const node = document.getElementById("acc-sync");
  if (node) node.textContent = syncPhrase(status);
});

/* ---------- הכתובת שאליה הקישור חוזר ---------- */

/* בלי fragment ובלי query: `consumeAuthRedirect` מצפה לקבל את
   האסימונים ב-fragment נקי, וכתובת שכבר נושאת אחד הייתה מתנגשת. */
function redirectTarget() {
  return location.origin + location.pathname;
}

/* ---------- הרכיב ---------- */

/** האריח שנושא את המצב בצורה, לא רק במילים. */
function stateDot(state) {
  const dot = document.createElement("span");
  dot.className = "acc-dot";
  dot.dataset.state = state;
  // הצורה היא כפילות ויזואלית של הטקסט לידה, ולא מידע נוסף. קורא מסך
  // שמקריא את שניהם היה אומר את אותו דבר פעמיים.
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

function headRow(state, text) {
  const row = document.createElement("p");
  row.className = "acc-head";
  const label = document.createElement("span");
  label.textContent = text;
  row.append(stateDot(state), label);
  return row;
}

/**
 * כתובת מייל כשורה נפרדת.
 *
 * ── למה לא בתוך המשפט ──────────────────────────────────────────────
 * הגרסה הראשונה כתבה "שלחנו קישור ל-<כתובת>." והצילום פסל אותה משתי
 * סיבות שנראות רק בעין: הכתובת ירשה את פונט התצוגה של שורת הכותרת
 * ונקראה כשלט, ובעיקר — עברית ולטינית באותה שורה הזיזו את הנקודה
 * הסופית לקצה השמאלי, כך שהמשפט נראה שבור.
 *
 * כתובת היא נתון ולא טקסט תצוגה, ולכן היא מקבלת שורה, פונט גוף,
 * וכיוון לטיני מפורש. המשפט שמעליה נשאר עברי נקי ונגמר בנקודה שלו.
 */
function mailLine(email) {
  const line = document.createElement("p");
  line.className = "acc-mail";
  line.dir = "ltr";
  line.textContent = email;
  return line;
}

export function buildAccountSection() {
  const wrap = document.createElement("section");
  wrap.className = "account";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "סנכרון בין מכשירים";

  const body = document.createElement("div");
  wrap.append(title, body);

  /* בנייה מחדש של הגוף בלבד. התחברות והתנתקות אינן שינוי מצב ב-store,
     ולכן הרינדור הכללי של האפליקציה לא ירוץ אחריהן. */
  function refresh() {
    body.replaceChildren(...buildBody(refresh));
  }

  refresh();
  return wrap;
}

function buildBody(refresh) {
  if (signedIn()) return connectedBody(refresh);
  const pending = readPending();
  return pending ? sentBody(pending, refresh) : idleBody(refresh);
}

/* ---------- מנותק ---------- */

function idleBody(refresh) {
  const parts = [];

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent =
    "התוכנית יושבת רק בדפדפן הזה. חיבור בכתובת מייל מסנכרן אותה בין המכשירים שלך, כך שהטלפון והמחשב מציגים את אותה תוכנית.";
  parts.push(headRow("empty", "המכשיר הזה לא מחובר."), note);

  if (problem) {
    const error = errorLine(problem);
    parts.push(error);
  }

  const input = document.createElement("input");
  input.type = "email";
  // אותה מחלקה של כל שדה באפליקציה. שדה משלו היה נבדל מהם בלי סיבה.
  input.className = "input";
  input.inputMode = "email";
  input.autocomplete = "email";
  input.placeholder = "name@example.com";
  input.value = draft;
  input.dataset.focusKey = "account:email";
  input.addEventListener("input", () => {
    draft = input.value;
  });

  const send = document.createElement("button");
  send.type = "button";
  /* ── למה זה *לא* act-primary, למרות שזו הפעולה של המקטע ──────────
     הגרסה הראשונה כן מילאה אותו בחרס, והצילום ב-390 פסל אותה: מסך
     המאקרו כבר נושא מילוי מלא אחד — "הוספת אדם" — ושני מלבנים כתומים
     באותה גלילה נאבקים זה בזה במקום להוביל. הכלל בקוד אומר את זה
     במפורש: אם החרס מופיע פעמיים במסך אחד, אחד מהם טעות.

     ההכרעה לטובת הקיים ולא לטובת החדש, כי הדרך השנייה הייתה משנה
     בשקט משקל של פקד שאין לו קשר לחיבור. המקטע לא מאבד מזה: יש לו
     כותרת ומפריד משלו, הוא הכפתור היחיד בתוכו, והאריח המקווקו כבר
     אומר "כאן חסר משהו" בערוץ שאינו תלוי בצבע.

     זו אותה הכרעה בדיוק שכבר נעשתה במקטע הגיבוי, מאותה סיבה — ראה
     את ההערה מעל `buildBackupSection`. אם אי פעם מחליטים להפוך את
     אחד משלושת המקטעים במסך הזה לממולא, ההחלטה נוגעת בשלושתם. */
  send.className = "act act-wide";
  send.dataset.focusKey = "account:send";
  send.textContent = sending ? "שולח…" : "שליחת קישור למייל";
  send.disabled = sending;

  async function submit() {
    const checked = normalizeEmail(draft);
    if (!checked.ok) {
      problem = checked.problem;
      refresh();
      return;
    }
    sending = true;
    problem = null;
    refresh();
    try {
      await sendMagicLink(checked.value, redirectTarget());
      draft = "";
      writePending(checked.value);
    } catch (error) {
      problem = authErrorMessage(error);
    } finally {
      sending = false;
      refresh();
    }
  }

  send.addEventListener("click", submit);
  // Enter בשדה מייל הוא מה שהאצבע עושה ממילא אחרי הקלדת כתובת.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  parts.push(fieldLabel("כתובת מייל", input), send);
  return parts;
}

/* ---------- נשלח קישור ---------- */

function sentBody(email, refresh) {
  const parts = [headRow("planned", "שלחנו קישור למייל."), mailLine(email)];

  const note = document.createElement("p");
  note.className = "field-note";
  /* "מהמכשיר הזה" אינו פרט טכני אלא ההוראה המרכזית: האסימון נקלט
     בדפדפן שפותח את הקישור, ולכן פתיחה במחשב אחר תחבר אותו ולא את
     המכשיר שממתין כאן. בלי המשפט הזה זה כשל שנראה כמו באג. */
  note.textContent =
    "צריך לפתוח את הקישור מהמכשיר הזה — הוא מחבר את הדפדפן שפותח אותו. אם הוא לא הגיע, כדאי לבדוק בספאם.";
  parts.push(note);

  if (problem) parts.push(errorLine(problem));

  const again = document.createElement("button");
  again.type = "button";
  // שקט בכוונה: מה שצריך לעשות עכשיו הוא לפתוח את המייל, לא לשלוח שוב.
  again.className = "act act-wide";
  again.dataset.focusKey = "account:resend";
  again.textContent = sending ? "שולח…" : "שליחה חוזרת";
  again.disabled = sending;
  again.addEventListener("click", async () => {
    sending = true;
    problem = null;
    refresh();
    try {
      await sendMagicLink(email, redirectTarget());
    } catch (error) {
      problem = authErrorMessage(error);
    } finally {
      sending = false;
      refresh();
    }
  });

  const other = document.createElement("button");
  other.type = "button";
  other.className = "act act-wide";
  other.dataset.focusKey = "account:other";
  other.textContent = "כתובת אחרת";
  other.addEventListener("click", () => {
    writePending(null);
    problem = null;
    draft = email;
    refresh();
  });

  parts.push(again, other);
  return parts;
}

/* ---------- אדם שני ---------- */

/**
 * שני הכפתורים שמחברים אדם *אחר* לאותה תוכנית.
 *
 * ── למה רק במצב מחובר ──────────────────────────────────────────────
 * קוד שיתוף למי שאין לו חשבון הוא מבוי סתום: ההצטרפות מחברת שני
 * חשבונות, וכל עוד אין אחד אין למה לצרף. הצגתו קודם הייתה מזמינה
 * לנסות ואז מסבירה למה לא — שני מסכים במקום אחד.
 *
 * ── למה שניהם שקטים ────────────────────────────────────────────────
 * זו לא פעולה שצריך לעשות עכשיו אלא שתי דרכים לאותו יעד, ואף אחת מהן
 * אינה ברירת מחדל: מי שיצר את משק הבית ייצור קוד, ומי שהוזמן יזין
 * אחד. מילוי על אחת מהן היה בוחר עבור המשתמש איזה משניהם הוא, וגם
 * שובר את הכלל שמסך המאקרו נושא מילוי אחד בלבד.
 *
 * ── למה לא כפתור אחד שמתפצל ────────────────────────────────────────
 * "צירוף אדם" שפותח מסך בחירה היה מוסיף שלב לשתי הדרכים כדי לחסוך
 * שורה אחת. שני הכפתורים אומרים בעצמם מה יקרה.
 */
function peopleBlock(refresh) {
  const heading = document.createElement("h3");
  heading.className = "acc-sub";
  heading.textContent = "אדם נוסף";

  const explain = document.createElement("p");
  explain.className = "field-note";
  explain.textContent =
    "אפשר לחבר לתוכנית גם מכשיר של אדם אחר, עם כתובת המייל שלו. מי שמצטרף רואה את אותו שבוע, ומה שהוא משנה מגיע לכאן.";

  const share = document.createElement("button");
  share.type = "button";
  share.className = "act act-wide";
  share.dataset.focusKey = "account:invite";
  share.textContent = "יצירת קוד שיתוף";
  share.addEventListener("click", () => openInviteSheet());

  const join = document.createElement("button");
  join.type = "button";
  join.className = "act act-wide";
  join.dataset.focusKey = "account:join";
  join.textContent = "הצטרפות עם קוד";
  // ההצטרפות מחליפה משק בית, ולכן שורת המצב במקטע כבר אינה נכונה.
  join.addEventListener("click", () => openJoinSheet({ onJoined: refresh }));

  return [heading, explain, share, join];
}

/* ---------- מחובר ---------- */

function connectedBody(refresh) {
  const user = currentUser();
  const parts = [headRow("cooked", "המכשיר מחובר.")];
  if (user?.email) parts.push(mailLine(user.email));

  const status = document.createElement("p");
  status.className = "field-note";
  status.id = "acc-sync";
  // aria-live כדי שמעבר ל"מסנכרן" ובחזרה יישמע בקורא מסך בלי לגנוב
  // פוקוס. polite ולא assertive: זה דיווח, לא קריאה לפעולה.
  status.setAttribute("aria-live", "polite");
  status.textContent = syncPhrase(syncStatus());
  parts.push(status);

  if (problem) parts.push(errorLine(problem));

  parts.push(...peopleBlock(refresh));

  const out = document.createElement("button");
  out.type = "button";
  out.className = "act act-wide acc-exit";
  out.dataset.focusKey = "account:signout";
  out.textContent = "התנתקות מהמכשיר הזה";
  out.addEventListener("click", async () => {
    try {
      await signOut();
      // מצב הסנכרון נמחק יחד עם הסשן. משק הבית והטביעות שנשמרו שייכים
      // למשתמש שהתנתק, והתחברות של אדם אחר במכשיר הזה הייתה יוצאת
      // לדרך עם מזהה משק בית שאין לו גישה אליו — בקשה שנדחית ב-RLS
      // ומוצגת כ"אין חיבור", כלומר תקלה שנראית כמו בעיית רשת.
      resetSync();
    } catch (error) {
      problem = error.message || "ההתנתקות נכשלה.";
    } finally {
      refresh();
    }
  });

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = "הנתונים נשארים במכשיר גם אחרי התנתקות. מה שנפסק הוא הסנכרון.";

  parts.push(out, note);
  return parts;
}

/** נקרא אחרי קליטת קישור קסם — מנקה את ההמתנה שכבר הסתיימה. */
export function clearPendingEmail() {
  writePending(null);
  draft = "";
  problem = null;
}
