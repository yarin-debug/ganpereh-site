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
import { buildImageBundle, imageBundleFileName, readImageBundle } from "./images-transfer.js";
import { imageCount, exportImageEntries, importImageEntries } from "./images.js";
import { openOverlay, errorLine } from "./ui-overlay.js";

const COUNT_ROWS = [
  { key: "profiles", label: "אנשים" },
  { key: "slots", label: "ארוחות מתוכננות" },
  { key: "dishes", label: "מנות משלך" },
  { key: "ingredients", label: "מצרכים משלך" },
  { key: "pantry", label: "שורות במזווה" },
];

/* ---------- ייצוא ---------- */

/**
 * מוריד אובייקט כקובץ JSON.
 *
 * משותף לגיבוי ולתמונות. קובץ התמונות נכתב בלי הזחה (`null` במקום 2):
 * מחרוזות ה-base64 ארוכות ממילא, והרווחים היו מוסיפים לקובץ בלי
 * שאיש יקרא אותו בעין.
 */
function downloadJson(data, fileName, indent = 2) {
  const blob = new Blob([JSON.stringify(data, null, indent)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();

  // בלי השחרור הבלוב נשאר בזיכרון עד לרענון הדף. הדחייה היא כי חלק
  // מהדפדפנים עדיין קוראים מה-URL אחרי שה-click חזר.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadBackup(store) {
  const todayIso = isoLocal(new Date());
  downloadJson(buildBackup(store.state, todayIso), backupFileName(todayIso));
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

/* ---------- תמונות מנה ---------- */

/** "תמונה אחת" / "3 תמונות" — נקרא כמו משפט ולא כמו שדה עם מספר. */
function imagesPhrase(n) {
  return n === 1 ? "תמונה אחת" : `${n} תמונות`;
}

async function downloadImages(setStatus, setProblem) {
  setStatus("מכינים את הקובץ…");
  const entries = await exportImageEntries();
  if (!entries.length) {
    setProblem("לא הצלחנו לקרוא את התמונות מהמכשיר.");
    return;
  }
  const todayIso = isoLocal(new Date());
  downloadJson(buildImageBundle(entries, todayIso), imageBundleFileName(todayIso), null);
  setStatus(`הורדו ${imagesPhrase(entries.length)}.`);
}

function pickImagesFile(setStatus, setProblem) {
  const input = document.createElement("input");
  input.type = "file";
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
      setProblem("לא הצלחנו לקרוא את הקובץ. נסה לבחור אותו שוב.");
      return;
    }

    const result = readImageBundle(text);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }

    setStatus("טוענים…");
    const saved = await importImageEntries(result.images);
    if (!saved) {
      setProblem("לא הצלחנו לשמור את התמונות. ייתכן שאין מקום פנוי במכשיר.");
      return;
    }
    // חלקי נאמר כחלקי. "נטענו 3 תמונות" כשבקובץ היו שמונה הוא בדיוק
    // סוג הדיווח ששולח מישהו למחוק את הקובץ המקורי בלי לדעת מה איבד.
    setStatus(
      saved < result.images.length
        ? `נטענו ${imagesPhrase(saved)} מתוך ${result.images.length}. ייתכן שאין מקום פנוי במכשיר.`
        : `נטענו ${imagesPhrase(saved)}.`,
    );
  });

  document.body.append(input);
  input.click();
}

/**
 * מקטע התמונות, נתלה מתחת לגיבוי.
 *
 * ── למה כאן ולא במקטע נפרד במסך ─────────────────────────────────────
 * המשפט שליד הגיבוי אומר "תמונות מנה לא נכנסות אליו", וזו שאלה
 * שנשאלת מיד אחריו. התשובה שיושבת בשורה הבאה היא התשובה במקום שבו
 * מחפשים אותה; מקטע נפרד במקום אחר במסך היה משאיר את השאלה פתוחה.
 */
function buildImagesBlock() {
  const wrap = document.createElement("section");
  wrap.className = "backup-images";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "תמונות מנה";

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent =
    "התמונות נשמרות במכשיר בנפרד מהגיבוי, ולכן יש להן קובץ משלהן. כדאי להוריד אותו לפני מעבר למכשיר חדש או לכתובת חדשה.";

  const status = document.createElement("p");
  status.className = "field-note";
  status.setAttribute("role", "status");
  status.hidden = true;

  const error = errorLine("");
  error.hidden = true;

  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = false;
    error.hidden = true;
  };
  const setProblem = (text) => {
    error.textContent = text;
    error.hidden = false;
    status.hidden = true;
  };

  const save = document.createElement("button");
  save.type = "button";
  save.className = "act act-wide";
  save.dataset.focusKey = "images:save";
  save.textContent = "הורדת קובץ תמונות";
  /* מוסתר עד שידוע שיש מה להוריד. `.act:disabled` אינו מעוצב, וכפתור
     כבוי שנראה בדיוק כמו פעיל גרוע מכפתור שאינו שם. */
  save.hidden = true;
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      await downloadImages(setStatus, setProblem);
    } finally {
      save.disabled = false;
    }
  });

  const load = document.createElement("button");
  load.type = "button";
  load.className = "act act-wide";
  load.dataset.focusKey = "images:load";
  load.textContent = "טעינת תמונות מקובץ";
  load.addEventListener("click", () => {
    error.hidden = true;
    status.hidden = true;
    pickImagesFile(setStatus, setProblem);
  });

  const rows = document.createElement("div");
  rows.className = "backup-actions";
  rows.append(save, load);

  wrap.append(title, note, rows, status, error);

  /* הספירה אסינכרונית והמקטע נבנה סינכרונית, ולכן מתחילים במשפט שנכון
     בכל מצב ומדייקים כשהמספר מגיע. הכפתור רק *מופיע* ואינו נעלם:
     אלמנט שנעלם מתחת ליד שכבר נשלחה אליו הוא הרבה יותר צורם. */
  imageCount().then((n) => {
    if (n > 0) {
      save.hidden = false;
      /* המשפט השני מנוסח בכלל ולא בגוף שלישי ("תמונות מנה נשמרות" ולא
         "הן נשמרות") כדי שיתאים גם ל"תמונה אחת" — התאמת מין ומספר
         לשני המקרים הייתה דורשת שני נוסחים שלמים בשביל מילה אחת. */
      note.textContent = `יש כאן ${imagesPhrase(n)}. תמונות מנה נשמרות בנפרד מקובץ הגיבוי, ולכן צריכות קובץ משלהן — כדאי להוריד אותו לפני מעבר למכשיר חדש או לכתובת חדשה.`;
    } else {
      note.textContent =
        "עדיין אין תמונות מנה במכשיר הזה. אם יש לך קובץ תמונות ממכשיר אחר, אפשר לטעון אותו כאן.";
    }
  });

  return wrap;
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
     סוג ההפתעה שהמנגנון הזה נבנה כדי למנוע. */
  note.textContent =
    "הנתונים יושבים רק בדפדפן הזה. ניקוי נתוני גלישה, פינוי אחסון או מעבר למכשיר חדש מוחקים אותם, ואין שרת שישחזר. הקובץ כולל את התוכנית, משק הבית, המנות והמזווה — תמונות מנה לא נכנסות אליו.";

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

  wrap.append(title, note, rows, error, buildImagesBlock());
  return wrap;
}

/** פותח בורר קובץ ישירות. משמש את מסך הפתיחה. */
export function openBackupImport({ onProblem, onDone }) {
  pickBackupFile(getStore(), onProblem, onDone);
}
