// state יחיד לכל השאלון + התמדה ב-sessionStorage (המשך מאיפה שעצרת).
const KEY = "gp_quiz_v2";

function freshState() {
  return {
    flow: null, // balcony | garden | business | building
    propertyType: null, // balcony | roof_garden | penthouse | ground_garden | villa | office | business | other
    stepId: null, // המסך הנוכחי
    history: [], // מזהי מסכים שביקרנו בהם (ל-back)
    answers: {}, // תשובות גולמיות לפי id
    uploads: [], // {id, name, kind:"image"|"pdf", url, status:"pending"|"done"|"failed"}
    designer: null, // JSON מסוריאלז מהדיזיינר
    designerSnapshotUrl: null,
    zones: null, // טקסט פינים ממסלול B
    zonesSnapshotUrl: null,
    externalId:
      "quiz-" +
      (crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2)),
    startedAt: Date.now(),
    submitted: false,
  };
}

export const state = load() || freshState();

// ?lid=<מזהה ליד בדשבורד> — כשירין/עידו שולחים לליד קיים קישור לשאלון,
// ההגשה נוחתת על הכרטיס שכבר פתוח (inbound ממזג) במקום לפתוח כרטיס שני.
// נקרא בכל טעינה, גם על state שהוחזר מ-sessionStorage — הקישור גובר.
try {
  const lid = new URLSearchParams(location.search).get("lid");
  if (lid && /^[0-9a-fA-F-]{36}$/.test(lid)) state.linkLeadId = lid;
} catch (e) {
  /* אין URL תקין — ממשיכים בלי קישור */
}

export function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* מצב פרטי/מלא — ממשיכים בלי התמדה */
  }
}

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.submitted) return null;
    return s;
  } catch (e) {
    return null;
  }
}

export function hasProgress() {
  return !!(state.flow && state.history.length > 0);
}

export function resetState() {
  const f = freshState();
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, f);
  save();
}
