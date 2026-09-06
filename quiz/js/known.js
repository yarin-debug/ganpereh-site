// ════════════════════════════════════════
// מה השאלון כבר לא צריך לשאול.
//
// 🔴 **הבעיה, במספרים מהפרודקשן (5.9.2026):** מתוך 136 הלידים שהגיעו
// מטופס מטא, **136 נושאים גודל, מועד וסוג נכס**. הקישור מהמייל ומהוואטסאפ
// (`?lid=`) פתח עד היום את השאלון בדיוק בשלוש השאלות האלה — כלומר ביקש
// מהאדם למלא שוב את מה שמילא דקה קודם. זו הסיבה המדודה שכמעט אף ליד
// מטופס לא הגיע לסוף השאלון.
//
// המודל: **שכבות, לא תנאים.** שכבה 1 (סוג · גודל · מועד) כבר ממולאת אצל
// רוב הלידים ממטא; מה שהשאלון עוד יכול לתרום הוא שכבה 2 — היקף, רצונות,
// תמונות ותוכנית. אז מדלגים על הראשונה ופותחים בשנייה.
//
// 📌 **ומה שלא נכנס לכאן, כי נמדד: קוד ה-P.** `projectType` קיים ב-3
// לידים מתוך 196, ולכן "מה כבר יש לכם ביד" **נשאר** בשאלון. דילוג עליו
// היה מוחק את הסיווג שקובע איזה שירות מוצע, על סמך שדה שכמעט תמיד ריק.
//
// ⚠️ הנתיב מחזיר סוג, גודל ומועד בלבד — בלי שם, טלפון או כתובת. שער
// הפרטים בשאלון נשאר כפי שהוא: הוא מאמת את הטלפון והוא נדרש להגשה.
// ════════════════════════════════════════
import { CONFIG } from "./config.js";
import { TYPE_MAP } from "./flows.js";

/* מזהי המסכים שכל ידיעה מייתרת, לפי מסלול.
   ⚠️ המפתחות הם מזהי מסכים ב-`flows.js`. מסך שיתווסף שם ולא כאן פשוט
   ייענה כרגיל — התנהגות תקינה, לא כשל. */
const SKIP = {
  // סוג החלל: מסך הפתיחה של כל השאלון, ובמסלול הגינה גם תת-הסוג
  // (בית/דירת גן מול וילה) — שניהם ידועים מ-`propertyType`.
  type: ["S1", "B_subtype"],
  // הגודל. ⚠️ `A_fallback_size` מוצג רק כשמדלגים על הדיזיינר, ויש לו
  // `showIf` משלו — הדילוג כאן מצטרף אליו ולא מחליף אותו.
  sizeSqm: ["A_fallback_size", "B_size", "C_size", "D_size"],
  // המועד. מסלולי המרפסת והבניין לא שואלים אותו בכלל.
  timeline: ["B_timeline", "C_timeline"],
};

/**
 * מושך מהדשבורד את מה שכבר ידוע על הליד.
 * מחזיר `{}` בכל תקלה — שאלון מלא הוא הנפילה-לאחור הנכונה.
 */
export async function fetchKnown(leadId) {
  if (!leadId) return {};
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), CONFIG.LEAD_KNOWN_TIMEOUT_MS);
    const res = await fetch(
      CONFIG.LEAD_KNOWN_URL + "?lid=" + encodeURIComponent(leadId),
      { signal: ctl.signal },
    );
    clearTimeout(t);
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    /* אין רשת, הדשבורד איטי, או מזהה שאינו קיים — ממשיכים בשאלון המלא */
    return {};
  }
}

/**
 * מחיל את הידוע על ה-state: קובע מסלול, ממלא תשובות, ומסמן מסכים לדילוג.
 *
 * 🔑 **ממלא ולא רק מדלג.** מסך שמסומן לדילוג אינו רץ, ולכן ה-`apply` שלו
 * אינו רץ — והערך היה נופל מה-payload. המילוי שומר על ההגשה שלמה בדיוק
 * כמו שאלון רגיל, ובפרט על הגודל, שממנו נגזרת רמת ההשקעה במסך התוצאה.
 *
 * מחזיר את רשימת המסכים שדולגו — לאנליטיקה ולבדיקה.
 */
export function applyKnown(state, known) {
  const skipped = [];
  const mark = (field) => {
    for (const id of SKIP[field] || []) {
      state.skip[id] = true;
      skipped.push(id);
    }
  };

  if (known.type && TYPE_MAP[known.type]) {
    const t = TYPE_MAP[known.type];
    state.flow = t.flow;
    // ⚠️ `propertyType` מהכרטיס ולא מ-`TYPE_MAP`: וילה וגינת קרקע חולקות
    // מסלול, ורק הכרטיס יודע איזו מהן זו.
    state.propertyType = known.propertyType || t.propertyType;
    state.answers.S1 = known.type;
    if (state.flow === "garden") state.answers.B_subtype = state.propertyType;
    mark("type");
  }

  if (known.sizeSqm) {
    for (const id of SKIP.sizeSqm) state.answers[id] = known.sizeSqm;
    mark("sizeSqm");
  }

  if (known.timeline) {
    for (const id of SKIP.timeline) state.answers[id] = known.timeline;
    mark("timeline");
  }

  return skipped;
}
