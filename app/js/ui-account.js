/* חיבור המכשיר — הזנת מייל, קוד חד-פעמי, וחיווי מצב הסנכרון.

   ── למה זה יושב במסך המאקרו ─────────────────────────────────────────
   מאותו נימוק שבגללו הגיבוי ועורך הפרופיל יושבים שם: לאפליקציה אין
   מסך הגדרות בכוונה, כי מסך הגדרות הוא מקום שצריך לזכור שהוא קיים.
   מסך המאקרו הוא כבר המסך של "מי אנחנו" ו"מה שלנו", והחיבור הוא
   "איפה זה נשמר".

   ── שלושת המצבים ────────────────────────────────────────────────────
     מנותק  → מזינים מייל, נשלח קוד
     נשלח   → מקלידים את הקוד כאן, בלי לעזוב את האפליקציה
     מחובר  → סנכרון שעובד הוא מצב שנסגר → קו וגוון קובלט

   ── ⚠️ למה אין מילוי חרס גם במצב האמצעי ─────────────────────────────
   הכלל הוא שמילוי מלא שמור לפעולה *אחת* שצריך לעשות עכשיו, וכאן הוא
   מתנגש בכלל שני. הנימוק הישן היה ש"הפעולה עברה לתיבת המייל ולא כאן"
   — והוא **כבר לא נכון**: מאז שהמסלול הוא קוד, ההקלדה קורית בדיוק
   כאן, וזו הפעולה היחידה שצריך לעשות ברגע הזה.

   בכל זאת אין מילוי, מסיבה אחרת לגמרי: מסך המאקרו נושא מילוי מלא אחד
   בלבד — "הוספת אדם" — ושני מלבנים כתומים באותה גלילה נאבקים זה בזה
   במקום להוביל. אותה הכרעה בדיוק שכבר נעשתה בכפתור השליחה ובמקטע
   הגיבוי. אם אי פעם הופכים אחד משלושת המקטעים לממולא — ההחלטה נוגעת
   בשלושתם, ואז זה המקום הראשון שראוי לו.

   מה שכן נושא את המשקל במקום הצבע: שדה הקוד עצמו, שהוא בפונט התצוגה
   ובגודל כותרת, ומיקוד אוטומטי שנכנס אליו ברגע שהמצב מתחלף.

   באותו היגיון אין במצב "מחובר" שום כפתור ממולא. סנכרון שעובד אינו
   מטלה, וכפתור "סנכרן עכשיו" ממולא היה ממציא אחת.

   ── שלוש הצורות אינן חדשות ──────────────────────────────────────────
   מקווקו / מסגרת קובלט / אריח רך עם וי הן אותן שלוש צורות של פס השבוע
   ושל ריבועי מסך הפתיחה, מוגדרות פעם אחת ב-CSS. שלושת המצבים כאן
   נופלים עליהן בדיוק, ולכן `.acc-dot` מצטרף למשפחה הקיימת במקום
   לייצר אוצר מילים רביעי לאותה אמירה. */

import { sendLoginCode, verifyEmailOtp, signOut, signedIn, currentUser } from "./sync/auth.js";
import { syncStatus, onSyncStatus, resetSync, syncNow } from "./sync/sync.js";
import { errorLine, fieldLabel } from "./ui-overlay.js";
import { openInviteSheet, openJoinSheet } from "./ui-invite.js";
import { getStore } from "./store.js";

/* המייל שאליו נשלח קוד, שורד רענון.

   בלי ההתמדה הזו המסלול הסביר ביותר נשבר: שולחים קוד, יוצאים
   לאפליקציית המייל כדי לקרוא אותו, וחוזרים — ואם האפליקציה נפרקה
   מהזיכרון בינתיים, המסך חוזר לשדה מייל ריק כאילו לא קרה כלום. במסלול
   הקוד זה חמור אף יותר מאשר בקישור: הקוד ביד, ואין לאן להקליד אותו. */
const PENDING_KEY = "gp_meals_pending_email";

/* אורך הקוד ש-Supabase מנפיק. ניתן להגדרה בקונסולה (6–10), וברירת
   המחדל היא 6. הבדיקה כאן סלחנית לאורך אחר ובודקת רק שהכל ספרות —
   קוד שנדחה בלקוח בגלל ספרה שביעית הוא בדיוק סוג הכשל שאי אפשר להבין
   ממנו כלום, והשרת ממילא יודע לומר "לא תקף" בעצמו. */
const OTP_LENGTH = 6;

/* ---------- לוגיקה טהורה ---------- */

/**
 * מנרמל ומאמת כתובת מייל.
 *
 * מחמיר יותר מ-`sendLoginCode`, שמסתפק ב-`@`, ובכוונה: כתובת כמו
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
  if (!value) return { ok: false, value: "", problem: "צריך כתובת מייל כדי לשלוח קוד." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    // בלי נקודה בסוף בכוונה: המשפט נגמר בטקסט לטיני, ונקודה עברית
    // אחריו נודדת לקצה השמאלי ונראית כמו תקלה בעצמה.
    return { ok: false, value, problem: "הכתובת לא נראית שלמה. צריך משהו בסגנון name@example.com" };
  }
  return { ok: true, value, problem: null };
}

/**
 * מנרמל ומאמת קוד שהוקלד.
 *
 * ── מה נחשב טעות ומה לא ────────────────────────────────────────────
 * אותו הסכם בדיוק כמו בקוד השיתוף (`normalizeInviteCode`), ומאותה
 * סיבה: רווחים ומקפים הם מה שקורה כשמעתיקים מספר מהמייל או מקלידים
 * אותו בקבוצות, ואף אחד מהם אינו טעות אמיתית. הם יורדים בשקט.
 *
 * מה שכן עוצר הוא **תו שאינו ספרה**. זו לא קפדנות: מי שהעתיק בטעות
 * מילה מהמייל ("Please") מקבל תשובה מיידית במקום "הקוד אינו תקף"
 * מהשרת — נוסח שנקרא כאילו הקוד פג, ושולח לבקש חדש בחינם.
 *
 * ── למה האורך אינו חוסם ────────────────────────────────────────────
 * `MAILER_OTP_LENGTH` ניתן לשינוי בקונסולה של Supabase, ולקוח שדוחה
 * קוד באורך שהשרת דווקא הנפיק היה יוצר תקלה שאין ממנה מוצא בממשק.
 * לכן אורך חריג מקבל **הערה** ולא פסילה: הבקשה נשלחת, והשרת מכריע.
 *
 * @returns {{ok: boolean, value: string, problem: string|null}}
 */
export function normalizeOtpCode(raw) {
  // רווחים, מקף רגיל וכל משפחת המקפים הטיפוגרפיים — כמו בקוד השיתוף.
  const value = String(raw || "").replace(/[\s\-‐-―]/g, "");

  if (!value) return { ok: false, value: "", problem: "צריך להזין את הקוד שהגיע במייל." };

  if (!/^\d+$/.test(value)) {
    return {
      ok: false,
      value,
      problem: "הקוד מורכב מספרות בלבד. כדאי לבדוק שלא נכנס תו נוסף מהמייל.",
    };
  }

  // נאמר, לא נחסם. ההודעה מציינת את האורך המצופה כדי שמי שהקליד ספרה
  // חסרה יראה את זה מיד, אבל היא אינה עוצרת את השליחה.
  if (value.length !== OTP_LENGTH) {
    return { ok: true, value, problem: `הקוד במייל הוא בן ${OTP_LENGTH} ספרות.` };
  }

  return { ok: true, value, problem: null };
}

/**
 * הודעת שגיאה של אימות הקוד, בעברית.
 *
 * נפרדת מ-`authErrorMessage` כי שם כל הנוסחים מדברים על *שליחה*
 * ("לא הצלחנו לשלוח"), וכאן כבר לא שולחים שום דבר — מאמתים.
 *
 * הענף שקובע הוא הקוד שאינו תקף. Supabase מחזיר על שלושה מצבים שונים
 * את אותו `invalid or expired`: קוד שהוקלד לא נכון, קוד שפג, וקוד
 * שכבר נוצל. המשתמש אינו יכול להבחין ביניהם, ולכן עדיף למנות אותם
 * ולומר מה עושים — מאשר להשאיר אותו מנחש אם להקליד שוב או לבקש חדש.
 */
export function otpErrorMessage(error) {
  const raw = String(error?.message || error || "").toLowerCase();

  if (raw.includes("expired") || raw.includes("invalid") || raw.includes("not found")) {
    return "הקוד אינו תקף. ייתכן שהוקלד לא נכון, שכבר השתמשת בו, או שפג תוקפו — אפשר לבקש קוד חדש.";
  }
  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "היו יותר מדי ניסיונות בזמן קצר. כדאי להמתין רגע ולנסות שוב.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("aborted")) {
    return "אין כרגע חיבור לאינטרנט, ולכן לא הצלחנו לאמת. אפשר לנסות שוב כשיהיה חיבור.";
  }
  return "לא הצלחנו להשלים את ההתחברות. אפשר לנסות שוב בעוד רגע.";
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
 * חמורה ואינה כזו: היא נגמרת מעצמה. ובעיקר — הקוד הקודם שכבר הגיע
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
    return n === 1 ? "אפשר לשלוח קוד נוסף בעוד שנייה." : `אפשר לשלוח קוד נוסף בעוד ${n} שניות.`;
  }

  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "נשלחו יותר מדי קודים בזמן קצר, והשליחה חסומה לכשעה. הקוד האחרון שכבר הגיע עדיין תקף — כדאי לחפש אותו במייל במקום להמתין.";
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
  return "לא הצלחנו לשלוח את הקוד. אפשר לנסות שוב בעוד רגע.";
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
let codeDraft = "";
let sending = false;
let verifying = false;
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

/* המסלול הראשי הוא הקוד, אבל אותו מייל נושא גם קישור — ומי שילחץ
   עליו צריך לנחות במקום הנכון. לכן היעד עדיין נשלח.

   בלי fragment ובלי query: `consumeAuthRedirect` מצפה לקבל את
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
  send.textContent = sending ? "שולח…" : "שליחת קוד למייל";
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
      await sendLoginCode(checked.value, redirectTarget());
      draft = "";
      // שדה הקוד נפתח ריק גם אם נשאר בו משהו מניסיון קודם: קוד ישן
      // ממתין בשדה הוא בדיוק מה שנשלח בטעות ואז נדחה כ"אינו תקף".
      codeDraft = "";
      codeFocusPending = true;
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

/* ---------- נשלח קוד ---------- */

/* המיקוד נכנס לשדה הקוד פעם אחת, במעבר למצב הזה — ולא בכל בנייה.

   המקטע נבנה מחדש בכל שינוי מצב באפליקציה, ומיקוד ללא תנאי היה חוטף
   את הסמן מכל פקד אחר במסך בכל פעם שמשהו מסתנכרן ברקע. הדגל נדלק
   בשליחה ובשגיאה — שני הרגעים שבהם ההקלדה בשדה היא באמת הדבר הבא. */
let codeFocusPending = false;

function sentBody(email, refresh) {
  const parts = [headRow("planned", "שלחנו קוד למייל."), mailLine(email)];

  const note = document.createElement("p");
  note.className = "field-note";
  /* מה שאין כאן חשוב כמו מה שיש: אין יותר "צריך לפתוח מהמכשיר הזה".
     זו הייתה ההוראה המרכזית במסלול הקישור, והיא נעלמה יחד עם הכשל
     שהיא באה להסביר — קוד מוקלד בדפדפן שכבר פתוח, ולכן אין מצב שבו
     ההתחברות נוחתת במקום אחר. */
  note.textContent = "אפשר להקליד אותו כאן. אם הוא לא הגיע, כדאי לבדוק בספאם.";
  parts.push(note);

  if (problem) parts.push(errorLine(problem));

  const input = document.createElement("input");
  input.type = "text";
  /* `.inv-input` היא הצורה שכבר הוכרעה לקוד שנקרא תו-תו: פונט תצוגה,
     גודל כותרת, ריווח אותיות, ומרכוז. הסיבה המקורית תקפה כאן חזק
     אף יותר — הספרות ב-Alef הן ספרות "ישנות" שיושבות בגובה x, וקוד
     שכולו ספרות היה נראה בו כאילו הוקטן. */
  input.className = "input inv-input";
  input.dir = "ltr";
  /* מקלדת ספרות במובייל. `numeric` ולא `tel`: השנייה מציגה גם * ו-#,
     שאינם חלק מהקוד ורק מזמינים הקלדה שתידחה. */
  input.inputMode = "numeric";
  /* מה שהופך את זה לזול באמת: ספארי ואנדרואיד מציעים את הקוד ישירות
     מהמייל שהרגע הגיע, בהקשה אחת ובלי לעבור לאפליקציית הדואר. */
  input.autocomplete = "one-time-code";
  input.spellcheck = false;
  input.maxLength = 12; // רווחים ומקפים נכנסים ונופלים בנרמול
  input.value = codeDraft;
  input.dataset.focusKey = "account:code";
  input.addEventListener("input", () => {
    codeDraft = input.value;
  });

  const enter = document.createElement("button");
  enter.type = "button";
  /* ללא מילוי, למרות שזו הפעולה של הרגע — מסך המאקרו נושא מילוי אחד
     בלבד. הנימוק המלא בראש הקובץ. */
  enter.className = "act act-wide";
  enter.dataset.focusKey = "account:verify";
  enter.textContent = verifying ? "מתחבר…" : "כניסה";
  enter.disabled = verifying;

  async function submitCode() {
    if (verifying) return;
    const checked = normalizeOtpCode(codeDraft);
    if (!checked.ok) {
      problem = checked.problem;
      codeFocusPending = true;
      refresh();
      return;
    }
    // אורך חריג מדווח אבל אינו עוצר — ההערה מוצגת, והשרת מכריע.
    verifying = true;
    problem = checked.problem;
    refresh();
    try {
      await verifyEmailOtp(email, checked.value);
      clearPendingEmail();
      /* ⚠️ הבעיטה הראשונה חייבת להיות כאן, וזה ההבדל המהותי מול מסלול
         הקישור. שם ההתחברות הסתיימה בטעינת דף מחדש, ו-`attachSync`
         קרא ל-`syncNow` בעצמו בשורה האחרונה שלו. כאן שום דבר לא נטען
         מחדש: המאזינים כבר רשומים מזמן, וכולם יוצאים על `signedIn()`
         שהיה false כשהם נקבעו. בלי השורה הזו המכשיר מתחבר בהצלחה
         ואז יושב בלי לסנכרן עד השינוי הבא בתוכנית — כלומר "התחברתי
         ושום דבר לא הגיע", שהוא בדיוק הכשל שהמסלול הזה בא למנוע.

         לא ממתינים לתוצאה: הכניסה הצליחה גם אם הסבב הראשון ייכשל,
         ושורת המצב במקטע כבר מדווחת עליו בעצמה. */
      syncNow(getStore());
    } catch (error) {
      problem = otpErrorMessage(error);
      codeFocusPending = true;
    } finally {
      verifying = false;
      refresh();
    }
  }

  enter.addEventListener("click", submitCode);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitCode();
  });

  parts.push(fieldLabel("הקוד מהמייל", input), enter);

  const again = document.createElement("button");
  again.type = "button";
  again.className = "act act-wide";
  again.dataset.focusKey = "account:resend";
  again.textContent = sending ? "שולח…" : "שליחת קוד חדש";
  again.disabled = sending || verifying;
  again.addEventListener("click", async () => {
    sending = true;
    problem = null;
    codeDraft = "";
    refresh();
    try {
      await sendLoginCode(email, redirectTarget());
      codeFocusPending = true;
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
  other.disabled = verifying;
  other.addEventListener("click", () => {
    writePending(null);
    problem = null;
    codeDraft = "";
    draft = email;
    refresh();
  });

  parts.push(again, other);

  if (codeFocusPending) {
    codeFocusPending = false;
    // אחרי ההצמדה ל-DOM, לא לפניה. `preventScroll` מאותה סיבה שבגללה
    // `restoreFocus` ב-app.js משתמש בו: בלעדיו הדף קופץ אל הפקד.
    queueMicrotask(() => input.focus({ preventScroll: true }));
  }

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

/**
 * מנקה את ההמתנה שכבר הסתיימה.
 *
 * שני קוראים, ובכוונה: `app.js` אחרי קליטת קישור קסם (המסלול שעובר
 * דרך טעינת דף), ו-`submitCode` אחרי אימות מוצלח (המסלול שאינו).
 */
export function clearPendingEmail() {
  writePending(null);
  draft = "";
  codeDraft = "";
  problem = null;
}
