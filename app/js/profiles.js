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

/* ---------- העדפות אישיות ---------- */

/**
 * מי במשק הבית לא אוהב את המנה.
 *
 * פעילים בלבד: מי שיצא ממשק הבית כבר לא אוכל מהתפריט, והסימון שלו לא
 * אמור להשפיע על מה שרואים בבורר. ההעדפה עצמה נשארת שמורה עליו —
 * הוצאה ממשק הבית היא ארכיון ולא מחיקה, וגם כאן.
 */
export function dislikedBy(profiles, dishId) {
  if (!dishId) return [];
  return activeProfiles(profiles).filter(
    (profile) => Array.isArray(profile.dislikes) && profile.dislikes.includes(dishId),
  );
}

/** מזהי המנות שמישהו פעיל במשק הבית לא אוהב. */
export function dislikedDishIds(profiles) {
  const ids = new Set();
  for (const profile of activeProfiles(profiles)) {
    for (const id of profile.dislikes || []) ids.add(id);
  }
  return ids;
}

/**
 * קובע מי לא אוהב את המנה, לפי מה שסומן בטופס.
 *
 * ── למה פרופיל בארכיון לא נגע ────────────────────────────────────────
 * הטופס מציג רק את מי שנמצא במשק הבית, ולכן רשימת המסומנים שמגיעה
 * לכאן לעולם לא תכלול אדם בארכיון. לגזור ממנה "הוא לא סימן, אז למחוק"
 * היה מוחק בשקט נתון שהמשתמש מעולם לא ראה ולא בחר — וההעדפה הזו היא
 * בדיוק מה שצריך לשרוד עד שהוא יחזור.
 *
 * @returns {Array} מערך פרופילים חדש. הקלט לא משתנה.
 */
export function setDislikes(profiles, dishId, dislikingIds) {
  if (!dishId) return profiles || [];
  const disliking = new Set(dislikingIds || []);

  return (profiles || []).map((profile) => {
    if (!profile || profile.archived) return profile;

    const current = Array.isArray(profile.dislikes) ? profile.dislikes : [];
    const has = current.includes(dishId);
    const should = disliking.has(profile.id);
    if (has === should) return profile;

    return {
      ...profile,
      dislikes: should ? [...current, dishId] : current.filter((id) => id !== dishId),
    };
  });
}

/**
 * "לא אהובה על דנה" — התואר מסכים עם *המנה*, שהיא נקבה, ולכן המשפט
 * נכון לכל אדם. "דנה לא אוהבת" היה מנחש מגדר משם, וזה נתון שאין
 * לאפליקציה ושאין סיבה לבקש.
 */
export function dislikeLabel(profiles) {
  const names = (profiles || []).map((profile) => profile.name_he).filter(Boolean);
  if (!names.length) return null;
  if (names.length === 1) return `לא אהובה על ${names[0]}`;
  if (names.length === 2) return `לא אהובה על ${names[0]} ו${names[1]}`;
  return `לא אהובה על ${names[0]} ועוד ${names.length - 1}`;
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
