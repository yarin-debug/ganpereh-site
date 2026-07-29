/* מיזוג מצב בין מכשירים — לוגיקה טהורה, בלי DOM, בלי רשת, בלי store.

   ── למה לא "הכתיבה האחרונה מנצחת" על הבלוב כולו ────────────────────
   הפיתוי מובן: לשמור את המצב כמסמך אחד ולתת לאחרון שכתב לנצח. המחיר
   מתגלה בדיוק בתרחיש שבשבילו נבנה השיתוף — גילי מסמנת חלב בסופר בזמן
   שירין מוסיף מנה בבית. שני המכשירים כתבו את המסמך *השלם* שלהם, והשני
   שהגיע מחק בשקט את מה שהראשון עשה.

   זה בדיוק מה שהחוזה של store.js אוסר: "נתוני משתמש לא נדרסים לעולם".
   לכן המיזוג הוא **לפי מפתח**: כל משבצת, כל סימון קנייה, כל שורת מזווה
   וכל מנה נושאים חותמת זמן משלהם, והמיזוג מכריע כל אחד בנפרד. סימון
   החלב וגם המנה החדשה שורדים, כי הם מעולם לא התחרו על אותו מפתח.

   ── מצבה, לא היעדרות ───────────────────────────────────────────────
   מחיקה חייבת להיות עובדה מתועדת ולא "אין ערך". בלי זה, מנה שירין מחק
   הייתה חוזרת מהמכשיר של גילי בסנכרון הבא, שם היא עדיין קיימת.

   הייצוג חוסך טבלת מצבות נפרדת: `meta` מחזיק חותמת לכל מפתח שאי פעם
   נגענו בו, ו-`doc` מחזיק רק את החיים. מפתח שיש לו חותמת ואין לו ערך
   *הוא* המצבה.

   ── שעונים ─────────────────────────────────────────────────────────
   שני טלפונים, שני שעונים. חותמת נקבעת כ-max(עכשיו, החותמת הקודמת+1),
   כך שמכשיר עם שעון מפגר עדיין מסוגל לגבור על ערך שהוא עצמו רואה —
   אחרת עריכה שלו הייתה נבלעת שוב ושוב בלי שום סימן. */

/** המקטעים שמסונכרנים. כל אחד הוא מפה של מפתח→ערך; `week` נושא סקלר. */
export const SECTIONS = ["slots", "checked", "pantry", "dishes", "ingredients", "profiles", "week"];

export function emptyDoc() {
  const doc = {};
  for (const section of SECTIONS) doc[section] = {};
  return doc;
}

/* ---------- תרגום בין מצב האפליקציה למסמך המסונכרן ---------- */

/**
 * המצב → מסמך שטוח לסנכרון.
 *
 * הפרופילים הופכים ממערך למפה לפי מזהה: מיזוג של מערך לפי מיקום היה
 * מצמיד את היעדים של אדם אחד לשם של אחר ברגע שמישהו הוסיף פרופיל.
 */
export function docFromState(state) {
  const doc = emptyDoc();
  const plan = state?.plan || {};

  doc.slots = { ...(plan.slots || {}) };
  doc.checked = { ...(plan.checked || {}) };
  doc.pantry = { ...(state?.pantry || {}) };
  doc.dishes = { ...(state?.dishes || {}) };
  doc.ingredients = { ...(state?.ingredients || {}) };

  for (const profile of state?.profiles || []) {
    if (profile && typeof profile.id === "string" && profile.id) doc.profiles[profile.id] = profile;
  }
  if (plan.week_start) doc.week = { start: plan.week_start };

  return doc;
}

/**
 * סדר הפרופילים אחרי מיזוג. המפה איבדה את סדר המערך, ולכן משחזרים
 * אותו מהמזהה עצמו — `nextProfileId` מנפיק p1, p2, p3, כך שמיון לפי
 * הסיפרה הוא סדר ההוספה. מזהה בצורה אחרת נופל לסוף לפי סדר אלפביתי,
 * ובלבד שהתוצאה תהיה זהה בשני המכשירים.
 */
function sortProfileIds(ids) {
  const rank = (id) => {
    const match = /^p(\d+)$/.exec(id);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  return ids.slice().sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * המסמך → שדות המצב. מחזיר אובייקט חדש; הקלט לא משתנה.
 *
 * `week_start` חסר במסמך נשאר כמו שהוא במצב המקומי: מסמך מרוחק ריק
 * (משק בית חדש) לא אמור לאפס את השבוע של מי שכבר עובד.
 */
export function stateFromDoc(state, doc) {
  const profiles = sortProfileIds(Object.keys(doc?.profiles || {})).map((id) => doc.profiles[id]);

  return {
    ...state,
    plan: {
      ...(state?.plan || {}),
      week_start: doc?.week?.start || state?.plan?.week_start,
      slots: { ...(doc?.slots || {}) },
      checked: { ...(doc?.checked || {}) },
    },
    // משק בית בלי אף פרופיל אינו מצב שהממשק יודע להציג — עדיף להיאחז
    // במה שיש מקומית מאשר להגיש מסך מאקרו בלי אף אדם.
    profiles: profiles.length ? profiles : state?.profiles || [],
    pantry: { ...(doc?.pantry || {}) },
    dishes: { ...(doc?.dishes || {}) },
    ingredients: { ...(doc?.ingredients || {}) },
  };
}

/* ---------- חותמות ---------- */

const flatKey = (section, key) => `${section}/${key}`;

function sameValue(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * מסמן במטא כל מפתח שהשתנה בין שני מסמכים — כולל מפתח שנמחק, שמקבל
 * חותמת בלי ערך (מצבה).
 *
 * @returns {object} מטא חדש. הקלט לא משתנה.
 */
export function stampChanges(beforeDoc, afterDoc, meta, nowMs) {
  const out = { ...(meta || {}) };

  for (const section of SECTIONS) {
    const before = beforeDoc?.[section] || {};
    const after = afterDoc?.[section] || {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (sameValue(before[key], after[key])) continue;
      const flat = flatKey(section, key);
      // מונוטוני לכל מפתח: שעון מפגר לא נועל מכשיר מחוץ למשחק.
      const previous = Number(out[flat]) || 0;
      out[flat] = Math.max(nowMs, previous + 1);
    }
  }

  return out;
}

/* ---------- המיזוג ---------- */

/**
 * החותמת של נתונים שקדמו לסנכרון.
 *
 * לא אפס — `hasLocalNews` לא היה מבחין בינה לבין "אין כאן כלום",
 * והתוכנית שירין בנה לפני שהתכונה הזו נכתבה לא הייתה נדחפת לעולם.
 * ולא `Date.now()` — אז היא הייתה גוברת על מה שגילי ערכה אתמול. ערך
 * מינימלי חיובי אומר בדיוק את האמת: "ידוע, וקדום מכל השאר".
 */
export const LEGACY_TS = 1;

/**
 * משלים חותמות לנתונים שקיימים בלי חותמת.
 *
 * מפתח שיש לו ערך ואין לו חותמת הוא נתון מלפני הסנכרון. מפתח שיש לו
 * חותמת ואין לו ערך הוא מצבה, ואסור לגעת בו — לכן ההשלמה עוברת על
 * המסמך ולא על המטא.
 *
 * @returns {object} מטא חדש. הקלט לא משתנה.
 */
export function backfillMeta(doc, meta) {
  const out = { ...(meta || {}) };
  for (const section of SECTIONS) {
    for (const key of Object.keys(doc?.[section] || {})) {
      const flat = flatKey(section, key);
      if (!Object.prototype.hasOwnProperty.call(out, flat)) out[flat] = LEGACY_TS;
    }
  }
  return out;
}

/**
 * מה אנחנו יודעים על מפתח בצד מסוים.
 * `ts === null` פירושו "הצד הזה מעולם לא שמע על המפתח" — שונה מהותית
 * מ"הצד הזה מחק אותו", ולכן הוא לעולם לא גובר על ידיעה של הצד השני.
 */
function sideOf(doc, meta, section, key) {
  const has = Object.prototype.hasOwnProperty.call(doc?.[section] || {}, key);
  const stamped = Object.prototype.hasOwnProperty.call(meta || {}, flatKey(section, key));
  if (!has && !stamped) return { ts: null, has: false, value: undefined };
  return {
    ts: Number(meta?.[flatKey(section, key)]) || 0,
    has,
    value: doc?.[section]?.[key],
  };
}

/**
 * ממזג שני מסמכים לפי מפתח.
 *
 * שוויון חותמות מוכרע לטובת הערך הקיים על פני המצבה, ואחריו לפי
 * השוואת מחרוזות — לא כדי ש"הנכון" ינצח (בתיקו אין נכון), אלא כדי
 * ששני המכשירים יגיעו לאותה תוצאה בלי לדבר ביניהם.
 *
 * @returns {{doc: object, meta: object, changed: boolean}}
 *   `changed` — האם התוצאה שונה מהצד המקומי, כלומר האם יש מה לרנדר.
 */
export function mergeDocs(localDoc, localMeta, remoteDoc, remoteMeta) {
  const doc = emptyDoc();
  const meta = {};
  let changed = false;

  for (const section of SECTIONS) {
    const keys = new Set([
      ...Object.keys(localDoc?.[section] || {}),
      ...Object.keys(remoteDoc?.[section] || {}),
    ]);
    for (const flat of [...Object.keys(localMeta || {}), ...Object.keys(remoteMeta || {})]) {
      const slash = flat.indexOf("/");
      if (slash > 0 && flat.slice(0, slash) === section) keys.add(flat.slice(slash + 1));
    }

    for (const key of keys) {
      const local = sideOf(localDoc, localMeta, section, key);
      const remote = sideOf(remoteDoc, remoteMeta, section, key);

      let winner;
      if (local.ts === null) winner = remote;
      else if (remote.ts === null) winner = local;
      else if (local.ts !== remote.ts) winner = local.ts > remote.ts ? local : remote;
      else if (local.has !== remote.has) winner = local.has ? local : remote;
      else winner = JSON.stringify(local.value) >= JSON.stringify(remote.value) ? local : remote;

      if (winner.ts !== null) meta[flatKey(section, key)] = winner.ts;
      if (winner.has) doc[section][key] = winner.value;

      if (winner.has !== local.has || !sameValue(winner.value, local.value)) changed = true;
    }
  }

  return { doc, meta, changed };
}

/**
 * האם למקומי יש משהו שהמרוחק לא מכיר — כלומר האם יש טעם לדחוף.
 * בלי הבדיקה הזו כל משיכה הייתה גוררת דחיפה מיותרת, ושני מכשירים
 * פתוחים היו מגלגלים ביניהם כתיבות בלי סוף.
 */
export function hasLocalNews(localMeta, remoteMeta) {
  for (const [key, ts] of Object.entries(localMeta || {})) {
    if ((Number(remoteMeta?.[key]) || 0) < (Number(ts) || 0)) return true;
  }
  return false;
}

/**
 * גוזם מצבות ישנות. בלי גיזום, `meta` תופח לנצח — כל משבצת של כל שבוע
 * שאי פעם נמחקה נשארת בו.
 *
 * הסף רחב בכוונה: מצבה שנגזמה מוקדם מדי היא ערך שקם לתחייה ממכשיר
 * שלא הסתנכרן. חודשיים הם הרבה מעבר לכל תרחיש סביר של טלפון שנשכח.
 */
export function pruneTombstones(doc, meta, nowMs, maxAgeMs = 60 * 24 * 60 * 60 * 1000) {
  const out = {};
  for (const [flat, ts] of Object.entries(meta || {})) {
    const slash = flat.indexOf("/");
    const section = slash > 0 ? flat.slice(0, slash) : "";
    const key = slash > 0 ? flat.slice(slash + 1) : "";
    const alive = Object.prototype.hasOwnProperty.call(doc?.[section] || {}, key);
    if (alive || nowMs - (Number(ts) || 0) < maxAgeMs) out[flat] = ts;
  }
  return out;
}
