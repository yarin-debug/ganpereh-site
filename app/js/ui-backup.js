/* גיבוי — הורדת קובץ וטעינה ממנו.

   ── למה זה יושב במסך המאקרו ─────────────────────────────────────────
   מאותו נימוק שבגללו עורך הפרופיל יושב שם: לאפליקציה אין מסך הגדרות
   בכוונה, כי מסך הגדרות הוא מקום שצריך לזכור שהוא קיים. מסך המאקרו
   הוא כבר המסך שבו מנהלים "מי אנחנו", והגיבוי הוא "מה שלנו".

   נקודת הכניסה השנייה היא מסך הפתיחה, ושם היא חשובה יותר: מכשיר חדש
   הוא בדיוק הרגע שבו מחפשים את הכפתור הזה, וזה גם המסך היחיד שרואים
   בו. */

import { getStore, isoLocal, SCHEMA_VERSION } from "./store.js";
import { buildBackup, backupFileName, backupSummary, readBackup } from "./backup.js";
import { openOverlay, errorLine } from "./ui-overlay.js";
import { signedIn } from "./sync/auth.js";

const COUNT_ROWS = [
  { key: "profiles", label: "אנשים" },
  { key: "slots", label: "ארוחות מתוכננות" },
  { key: "dishes", label: "מנות משלך" },
  { key: "ingredients", label: "מצרכים משלך" },
  { key: "pantry", label: "שורות במזווה" },
];

/* ---------- ייצוא ---------- */

function downloadBackup(store) {
  const todayIso = isoLocal(new Date());
  const blob = new Blob([JSON.stringify(buildBackup(store.state, todayIso), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(todayIso);
  document.body.append(link);
  link.click();
  link.remove();

  // בלי השחרור הבלוב נשאר בזיכרון עד לרענון הדף. הדחייה היא כי חלק
  // מהדפדפנים עדיין קוראים מה-URL אחרי שה-click חזר.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- ייבוא ---------- */

/**
 * @param {object|null} current  null כשאין מה להחליף — אז אין עמודת "עכשיו"
 */
function countsTable(current, incoming) {
  const table = document.createElement("table");
  table.className = "cmp";

  const head = document.createElement("tr");
  const headings = current ? ["", "עכשיו", "בקובץ"] : ["", "בקובץ"];
  for (const text of headings) {
    const th = document.createElement("th");
    th.textContent = text;
    if (!text) th.setAttribute("aria-hidden", "true");
    head.append(th);
  }
  table.append(head);

  for (const row of COUNT_ROWS) {
    const tr = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = row.label;
    tr.append(name);

    if (current) {
      const now = document.createElement("td");
      now.textContent = String(current[row.key]);
      tr.append(now);
    }

    const next = document.createElement("td");
    next.textContent = String(incoming[row.key]);
    tr.append(next);

    table.append(tr);
  }

  return table;
}

/**
 * מה שמצטמצם, במילים.
 *
 * ── למה לא לצבוע את המספר ───────────────────────────────────────────
 * הגרסה הראשונה צבעה בחרס כל תא שקטן מהקיים. שתי בעיות: חרס כטקסט על
 * משטח לבן נמדד 4.26 ואינו עובר את הסף, וצבע לבדו ממילא אינו סימן —
 * קורא מסך ומי שאינו מבחין בגוונים היו מקבלים טבלה של מספרים שווי
 * משקל. משפט אחד אומר את זה לכולם, ואומר יותר: לא רק *ש*משהו קטן,
 * אלא *מה*.
 */
function shrinkNote(current, incoming) {
  if (!current) return null;
  const shrunk = COUNT_ROWS.filter((row) => incoming[row.key] < current[row.key]).map(
    (row) => row.label,
  );
  if (!shrunk.length) return null;

  const list =
    shrunk.length === 1
      ? shrunk[0]
      : `${shrunk.slice(0, -1).join(", ")} ו${shrunk[shrunk.length - 1]}`;

  const p = document.createElement("p");
  p.className = "cmp-note";
  p.textContent = `בקובץ יש פחות ${list} ממה שיש עכשיו במכשיר.`;
  return p;
}

/**
 * אישור לפני החלפה.
 *
 * המספרים מוצגים ולא רק מתוארים: "הנתונים יוחלפו" הוא משפט שאי אפשר
 * להעריך, ו"עכשיו 12 ארוחות, בקובץ 3" הוא משפט שאפשר להחליט לפיו.
 */
function confirmImport(store, incomingState, onDone) {
  /* מכשיר שעוד לא הוגדר מקבל טבלה בעמודה אחת.
     עמודת "עכשיו" שם הייתה מציגה "2 אנשים" — פרופילי הזרע הבלתי נראים
     שאיש לא הזין — וכך מבטיחה למשתמש שהוא עומד לאבד משהו שאין לו. */
  const fresh = store.needsOnboarding();
  const current = fresh ? null : backupSummary(store.state);
  const incoming = backupSummary(incomingState);

  return openOverlay({
    label: "אישור טעינת גיבוי",
    variant: "editor",
    build: (panel, handle) => {
      const heading = document.createElement("h2");
      heading.className = "sheet-title";
      heading.textContent = "לטעון את הגיבוי?";

      const sub = document.createElement("p");
      sub.className = "sheet-sub";
      sub.textContent = fresh
        ? "זה מה שיש בקובץ. אין כרגע נתונים במכשיר שיוחלפו."
        : "מה שיש עכשיו במכשיר יוחלף במה שבקובץ. עותק של המצב הנוכחי נשמר במכשיר לפני ההחלפה.";

      const error = errorLine("");
      error.hidden = true;

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "act act-wide act-primary";
      confirm.dataset.autofocus = "true";
      // הכפתור נקרא על שם מה שהוא באמת עושה. "להחליף" כשאין מה להחליף
      // הוא אזהרה מומצאת, והיא שוחקת את האזהרה האמיתית.
      confirm.textContent = fresh ? "לטעון את הנתונים" : "להחליף את הנתונים";
      confirm.addEventListener("click", () => {
        const result = store.importState(incomingState);
        if (result.ok) {
          handle.close();
          if (onDone) onDone();
          return;
        }
        error.textContent =
          result.reason === "backup_failed"
            ? "לא הצלחנו לשמור עותק של הנתונים הקיימים, ולכן לא החלפנו אותם. ייתכן שאין מקום פנוי במכשיר."
            : result.reason === "locked"
              ? "הנתונים במכשיר נשמרו בגרסה חדשה יותר של האפליקציה, ולכן איננו כותבים עליהם."
              : "השמירה נכשלה והנתונים הקיימים נשארו כמו שהם. ייתכן שאין מקום פנוי במכשיר.";
        error.hidden = false;
      });

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sheet-close";
      cancel.textContent = "ביטול";
      cancel.addEventListener("click", () => handle.close());

      panel.append(heading, sub, countsTable(current, incoming));
      const shrink = shrinkNote(current, incoming);
      if (shrink) panel.append(shrink);
      panel.append(error, confirm, cancel);
    },
  });
}

/**
 * בוחר קובץ, מאמת, ומבקש אישור.
 * @param {(text:string)=>void} onProblem הודעה למי שקרא לנו, כשהקובץ נפסל
 */
function pickBackupFile(store, onProblem, onDone) {
  const input = document.createElement("input");
  input.type = "file";
  // accept הוא רמז ולא אכיפה — יש מערכות שמגישות JSON בלי סיומת, ולכן
  // האימות האמיתי הוא על התוכן ולא על השם.
  input.accept = "application/json,.json";
  input.hidden = true;

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;

    let text;
    try {
      text = await file.text();
    } catch {
      onProblem("לא הצלחנו לקרוא את הקובץ. נסה לבחור אותו שוב.");
      return;
    }

    const result = readBackup(text, SCHEMA_VERSION);
    if (!result.ok) {
      onProblem(result.error);
      return;
    }
    confirmImport(store, result.state, onDone);
  });

  document.body.append(input);
  input.click();
}

/* ---------- החלק שנתלה במסך ---------- */

/**
 * מקטע הגיבוי למסך המאקרו.
 *
 * שני הכפתורים הם `.act` רגיל ולא `act-primary`: במסך הזה המילוי המלא
 * כבר שייך ל"הוספת אדם", ושני מילויים במסך אחד הם בדיוק מה שמערכת
 * העיצוב אוסרת. גיבוי גם אינו הפעולה שצריך לעשות עכשיו — הוא הפעולה
 * שרוצים שתהיה כבר עשויה.
 */
export function buildBackupSection() {
  const store = getStore();

  const wrap = document.createElement("section");
  wrap.className = "backup";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "גיבוי";

  const note = document.createElement("p");
  note.className = "field-note";
  /* התמונות נאמרות כאן במפורש. הן יושבות ב-IndexedDB ולא בקובץ הגיבוי
     (קידוד base64 של עשר תמונות היה קובץ במגהבייטים שאי אפשר לשלוח
     בהודעה), וגיבוי שמבטיח "הכל" ומחזיר תוכנית בלי תמונות הוא בדיוק
     סוג ההפתעה שהמנגנון הזה נבנה כדי למנוע.

     ── למה המשפט הראשון מתפצל ────────────────────────────────────────
     "אין שרת שישחזר" היה נכון כל עוד לא היה סנכרון, ומרגע שהמכשיר
     מחובר הוא פשוט שקר. אזהרה שהמשתמש יודע שאינה נכונה היא גרועה
     משתיקה: היא מלמדת אותו להתעלם גם מהאזהרות שכן נכונות. */
  const contents = "הקובץ כולל את התוכנית, משק הבית, המנות והמזווה — תמונות מנה לא נכנסות אליו.";
  note.textContent = signedIn()
    ? `המכשיר מסונכרן, אבל הקובץ הוא העותק היחיד שנשאר אצלך גם בלי חשבון. ${contents}`
    : `הנתונים יושבים רק בדפדפן הזה. ניקוי נתוני גלישה, פינוי אחסון או מעבר למכשיר חדש מוחקים אותם, ואין שרת שישחזר. ${contents}`;

  const error = errorLine("");
  error.hidden = true;
  const showProblem = (text) => {
    error.textContent = text;
    error.hidden = false;
  };

  const save = document.createElement("button");
  save.type = "button";
  save.className = "act act-wide";
  save.dataset.focusKey = "backup:save";
  save.textContent = "הורדת קובץ גיבוי";
  save.addEventListener("click", () => {
    error.hidden = true;
    downloadBackup(store);
  });

  const load = document.createElement("button");
  load.type = "button";
  load.className = "act act-wide";
  load.dataset.focusKey = "backup:load";
  load.textContent = "טעינה מקובץ גיבוי";
  load.addEventListener("click", () => {
    error.hidden = true;
    pickBackupFile(store, showProblem);
  });

  const rows = document.createElement("div");
  rows.className = "backup-actions";
  rows.append(save, load);

  wrap.append(title, note, rows, error);
  return wrap;
}

/** פותח בורר קובץ ישירות. משמש את מסך הפתיחה. */
export function openBackupImport({ onProblem, onDone }) {
  pickBackupFile(getStore(), onProblem, onDone);
}
