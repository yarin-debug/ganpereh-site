/* פרופילים — לוגיקה טהורה, בלי DOM ובלי גישה ל-store.

   ── למה ארכיון ולא מחיקה ────────────────────────────────────────────
   אותו נימוק כמו במנות: משבצות מחזיקות מזהי אוכלים ב-slot.eaters,
   וחישוב המאקרו מחלק את המנות במספר האוכלים. מחיקת פרופיל הייתה
   משאירה מזהה יתום בתוך eaters, והמחלק היה ממשיך לספור אדם שכבר לא
   קיים — כלומר להציג לכל השאר פחות ממה שהם באמת אכלו.

   ── ולמה בכל זאת מנקים משבצות ───────────────────────────────────────
   מהשבוע הנוכחי והלאה בלבד. שבועות שעברו נשארים כמו שהם, כי המאקרו
   שלהם היה נכון כשהוא נאכל. תכנון קדימה שכולל אדם שכבר לא במשק הבית
   הוא פשוט שגוי, ולכן הוא מתנקה. */

const MACRO_FIELDS = ["kcal", "protein_g", "fat_g", "carbs_g"];

/** הפרופילים שמשתתפים בפועל — מה שהממשק מציג ומה שמשבצת חדשה מקבלת. */
export function activeProfiles(profiles) {
  return (profiles || []).filter((profile) => profile && !profile.archived);
}

/** יעדים ריקים לפרופיל חדש. אפס פירושו "אין יעד", ולא "יעד אפס". */
export function blankTargets() {
  return { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
}

/**
 * המזהה הפנוי הבא. נגזר מהמזהים הקיימים ולא משעון או מאקראי, כדי
 * שאותו רצף פעולות ייתן תמיד את אותה תוצאה — גם בבדיקות.
 */
export function nextProfileId(profiles) {
  let max = 0;
  for (const profile of profiles || []) {
    const match = /^p(\d+)$/.exec(profile?.id || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `p${max + 1}`;
}

/**
 * מסיר אוכל מהמשבצות של השבוע הנוכחי והלאה.
 *
 * משבצת שהאדם הזה היה האוכל היחיד בה נמחקת: ארוחה שתוכננה עבור מי
 * שכבר לא במשק הבית אינה ארוחה. משאירים אותה עם eaters ריק היה גרוע
 * יותר — coerceSlots ממלא רשימה ריקה בכל הפרופילים, וכך המנה הייתה
 * מוקצית בשקט לאנשים אחרים.
 *
 * @returns {object} אובייקט משבצות חדש. הקלט לא משתנה.
 */
export function removeEaterFromSlots(slots, profileId, fromDate) {
  const out = {};

  for (const [key, slot] of Object.entries(slots || {})) {
    const date = key.split(".")[0];
    const eaters = Array.isArray(slot?.eaters) ? slot.eaters : [];

    // שבועות שעברו נשארים כמו שהם — המאקרו שלהם כבר נאכל.
    if (date < fromDate || !eaters.includes(profileId)) {
      out[key] = slot;
      continue;
    }

    const remaining = eaters.filter((id) => id !== profileId);
    if (!remaining.length) continue; // הוא היה האוכל היחיד — המשבצת יורדת

    out[key] = {
      ...slot,
      eaters: remaining,
      // מספר המנות לא יורד לבד: אולי בישלו לשניים ואוכל אחד פרש.
      // מה שכן נאכף הוא שלא יהיו פחות מנות מאוכלים.
      servings: Math.max(remaining.length, Number(slot.servings) || remaining.length),
    };
  }

  return out;
}

/** יעד תקין הוא מספר אי-שלילי. כל דבר אחר נקרא "אין יעד". */
export function coerceTargets(raw) {
  const out = blankTargets();
  if (!raw || typeof raw !== "object") return out;
  for (const field of MACRO_FIELDS) {
    const value = Number(raw[field]);
    if (Number.isFinite(value) && value >= 0) out[field] = value;
  }
  return out;
}

export { MACRO_FIELDS };
