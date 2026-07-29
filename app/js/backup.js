/* גיבוי וייבוא — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   ── למה זה קיים ─────────────────────────────────────────────────────
   כל החוזה של store.js הוא שנתוני משתמש לא נדרסים לעולם: JSON פגום
   מגובה לפני שנטען מצב התחלתי, סכמה עתידית נועלת את הכתיבה, ואחסון
   חסום נופל לזיכרון עם אזהרה. כל המנגנון הזה מגן מפני *האפליקציה*.

   שום דבר בו לא מגן מפני הדפדפן. ניקוי נתוני גלישה, פינוי אחסון
   בספארי, או מכשיר חדש — וכל התוכנית, המזווה והמנות נעלמים. אין שרת
   בכוונה, ולכן קובץ הוא הדרך היחידה להוציא את הנתונים מהמכשיר.

   ── הכיוון המסוכן הוא הייבוא ────────────────────────────────────────
   ייצוא לא יכול להזיק. ייבוא הוא הפעולה היחידה באפליקציה שמוחקת נתוני
   משתמש בכוונה, ולכן היא עוברת כאן אימות מלא לפני שהיא נוגעת במשהו,
   ומוצגת למשתמש כהשוואת מספרים לפני האישור. */

export const BACKUP_APP = "gp-meals";

/**
 * העטיפה שנשמרת לקובץ.
 *
 * המצב יושב תחת `state` ולא בשורש כדי שיהיה מקום ל-`app` ול-`exported_at`:
 * מי שיפתח את הקובץ בעוד שנה צריך לדעת מה זה ומתי זה נוצר, בלי לנחש
 * לפי שמות שדות.
 */
export function buildBackup(state, todayIso) {
  return {
    app: BACKUP_APP,
    exported_at: todayIso,
    schema_version: state?.schema_version ?? null,
    state,
  };
}

/**
 * שם הקובץ.
 *
 * באנגלית ולא בעברית, וזו לא רשלנות: הקובץ הזה נשלח בוואטסאפ ובמייל
 * ועובר בין מערכות קבצים, ושם קידוד עברי חוזר מדי פעם כג'יבריש או
 * נחתך. תוכן הקובץ הוא מה שנקרא, לא שמו.
 */
export function backupFileName(todayIso) {
  return `gp-meals-backup-${todayIso}.json`;
}

/**
 * ספירה קצרה של מה שיש במצב. משמשת להשוואה שמוצגת לפני ייבוא —
 * "זה מה שיש לך עכשיו, וזה מה שבקובץ".
 */
export function backupSummary(state) {
  const slots = Object.values(state?.plan?.slots || {}).filter((slot) => slot && slot.dish_id);
  return {
    profiles: (state?.profiles || []).filter((p) => p && !p.archived).length,
    slots: slots.length,
    dishes: Object.keys(state?.dishes || {}).length,
    ingredients: Object.keys(state?.ingredients || {}).length,
    pantry: Object.keys(state?.pantry || {}).length,
  };
}

/**
 * קורא קובץ גיבוי ומאמת אותו.
 *
 * @param {string} raw            תוכן הקובץ
 * @param {number} currentSchema  SCHEMA_VERSION של הגרסה הרצה
 * @returns {{ok: boolean, state?: object, error?: string}}
 *
 * ── שתי צורות קלט מתקבלות ───────────────────────────────────────────
 * העטיפה שהאפליקציה כותבת (`{app, state}`), וגם בלוב מצב חשוף — מי
 * שהעתיק את הערך היישר מ-localStorage כדי להציל נתונים מדפדפן שנתקע
 * מחזיק ביד בדיוק את הצורה השנייה, ולדחות אותו היה לדחות אותו בדיוק
 * ברגע שהוא הכי צריך את זה.
 *
 * ההודעות כאן נועדו לאדם שמנסה לשחזר את הנתונים שלו, ולכן כל אחת
 * אומרת מה לעשות ולא רק מה נכשל.
 */
export function readBackup(raw, currentSchema) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "הקובץ אינו קובץ גיבוי תקין. ודא שבחרת את קובץ ה-JSON שיוצא מכאן." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "הקובץ אינו קובץ גיבוי של מתכנן הארוחות." };
  }

  const state =
    parsed.state && typeof parsed.state === "object" && !Array.isArray(parsed.state)
      ? parsed.state
      : parsed;

  if (typeof state.schema_version !== "number") {
    return { ok: false, error: "הקובץ אינו קובץ גיבוי של מתכנן הארוחות." };
  }

  // אותו כלל כמו נעילת הכתיבה ב-store: גרסה חדשה יותר עלולה להחזיק
  // שדות שהגרסה הזו לא יודעת לקרוא, וטעינה שלהם כאן הייתה חותכת אותם
  // בכתיבה הבאה. עדיף לסרב מאשר לקצץ בשקט.
  if (state.schema_version > currentSchema) {
    return {
      ok: false,
      error:
        "הגיבוי נוצר בגרסה חדשה יותר של האפליקציה. פתח אותו במכשיר או בדפדפן שבו הגרסה החדשה מותקנת, כדי לא לאבד שדות שהגרסה כאן לא מכירה.",
    };
  }

  return { ok: true, state };
}
