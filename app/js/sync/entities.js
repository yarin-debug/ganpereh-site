/* פירוק המצב לשורות והרכבתו בחזרה — לוגיקה טהורה, בלי DOM ובלי רשת.

   ── למה בכלל מפרקים ────────────────────────────────────────────────
   באחסון המקומי המצב הוא מחרוזת JSON אחת, וזה נכון שם: כותב אחד,
   כתיבה אטומית. מול שרת עם שני כותבים זה נשבר — שניים בבית עורכים
   במקביל, כל אחד שולח את הבלוב השלם שלו, והשני מוחק את מה שהראשון
   הרגע עשה. גם כשהם נגעו בדברים שונים לגמרי.

   הפירוק הופך את זה להתנגשות שלא קיימת: כל צד שולח רק את המפתחות
   שהוא שינה. "אחרון כותב מנצח" נשאר, אבל ברמת המשבצת הבודדת — לא
   ברמת התוכנית כולה.

   הקובץ הזה לא יודע דבר על רשת, על Supabase או על אחסון. הוא ממיר
   בין שתי צורות, וזה כל תפקידו. */

/* מזהי הישויות. הערך הוא מה שנכתב לעמודת entity, ולכן שינוי שם כאן
   מנתק את כל המכשירים הקיימים מהנתונים שלהם — אלה מפתחות בשרת, לא
   קבועים פנימיים. */
export const ENTITY = {
  SLOT: "slot",
  CHECKED: "checked",
  PANTRY: "pantry",
  DISH: "dish",
  INGREDIENT: "ingredient",
  PROFILE: "profile",
  META: "meta",
};

/* מפתחות ה-meta — ערכים בודדים שאינם אוסף. */
export const META = {
  WEEK_START: "week_start",
  ONBOARDED: "onboarded",
  PREFS: "prefs",
  SCHEMA: "schema_version",
};

/**
 * סריאליזציה קנונית — מפתחות ממוינים, בכל עומק.
 *
 * ── לא קישוט. בלי זה נוצרת לולאת דחיפה אינסופית ──────────────────
 * Postgres מאחסן jsonb עם סדר מפתחות משלו, ומחזיר אותו כך. אובייקט
 * שנדחף כ-`{qty, unit}` חוזר כ-`{unit, qty}` — זהה לחלוטין בערכו,
 * שונה לחלוטין תחת JSON.stringify.
 *
 * השוואה נאיבית הייתה מסמנת כל שורה שנמשכה זה עתה כ"השתנתה מקומית",
 * דוחפת אותה בחזרה, מקבלת אותה שוב, ושוב — סנכרון שלא נרגע לעולם
 * ושורף מכסה. המיון הוא מה שמונע את זה.
 */
export function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

/** מפתח מורכב לשימוש פנימי במפות. המפריד הוא בייט NUL, שלא מופיע במפתחות אמיתיים. */
export function rowKey(entity, key) {
  return `${entity}\u0000${key}`;
}

export function splitRowKey(composite) {
  const at = composite.indexOf("\u0000");
  return { entity: composite.slice(0, at), key: composite.slice(at + 1) };
}

/**
 * המצב → מפה שטוחה של `rowKey → value`.
 *
 * מה שלא מופיע כאן לא מסונכרן, וזו רשימה מכוונת:
 * `schema_version` נשלח כ-meta (הוא שומר הסף של הגרסאות), אבל שום
 * שדה שנגזר בזמן ריצה אינו נשלח — אין כאן מה שאפשר לחשב מחדש.
 */
export function flattenState(state) {
  const out = new Map();
  if (!state || typeof state !== "object") return out;

  const plan = state.plan && typeof state.plan === "object" ? state.plan : {};

  for (const [key, slot] of Object.entries(plan.slots || {})) {
    if (slot && typeof slot === "object") out.set(rowKey(ENTITY.SLOT, key), slot);
  }

  // רק true נשמר, בדיוק כמו באחסון המקומי: מפתח כבוי נמחק ולא נשמר
  // כ-false, אחרת הטבלה תופחת עם כל פריט שאי פעם נראה ברשימה.
  for (const [key, on] of Object.entries(plan.checked || {})) {
    if (on === true) out.set(rowKey(ENTITY.CHECKED, key), true);
  }

  for (const [id, entry] of Object.entries(state.pantry || {})) {
    if (entry != null) out.set(rowKey(ENTITY.PANTRY, id), entry);
  }
  for (const [id, dish] of Object.entries(state.dishes || {})) {
    if (dish && typeof dish === "object") out.set(rowKey(ENTITY.DISH, id), dish);
  }
  for (const [id, ing] of Object.entries(state.ingredients || {})) {
    if (ing && typeof ing === "object") out.set(rowKey(ENTITY.INGREDIENT, id), ing);
  }

  /* הפרופילים הם מערך, וכל השאר מפתח→ערך. הסדר הוא מידע אמיתי —
     הוא סדר הצ'יפים במסך — ולכן הוא נוסע כשדה ולא כמיקום. שני
     מכשירים שמוסיפים אדם בו-זמנית היו נלחמים על אינדקס במערך; על
     מפתח לפי מזהה הם פשוט לא נפגשים. */
  const profiles = Array.isArray(state.profiles) ? state.profiles : [];
  profiles.forEach((profile, index) => {
    if (!profile || typeof profile !== "object" || !profile.id) return;
    out.set(rowKey(ENTITY.PROFILE, profile.id), { ...profile, _order: index });
  });

  out.set(rowKey(ENTITY.META, META.WEEK_START), plan.week_start ?? null);
  out.set(rowKey(ENTITY.META, META.ONBOARDED), state.onboarded === true);
  out.set(rowKey(ENTITY.META, META.PREFS), state.prefs ?? null);
  out.set(rowKey(ENTITY.META, META.SCHEMA), state.schema_version ?? null);

  return out;
}

/**
 * טביעה של ערך — לזיהוי שינוי בלי לשמור את הערך עצמו.
 *
 * ── למה טביעה ולא עותק ─────────────────────────────────────────────
 * כדי לדעת מה השתנה מקומית צריך לזכור איך המצב נראה בסנכרון האחרון.
 * הדרך הישירה — עותק מלא — הייתה מכפילה את נפח האחסון המקומי.
 * באפליקציה שכבר הוציאה את התמונות ל-IndexedDB בגלל מכסת 5MB, עותק
 * שני של כל המנות והמצרכים הוא בדיוק הכיוון הלא נכון.
 *
 * שתי פונקציות גיבוב עם קבועים שונים, משורשרות. אין צורך לשחזר את
 * הערך הישן — רק לדעת שהוא שונה — וטווח כפול הופך התנגשות מקרית,
 * שמשמעותה שינוי שלא ייסנכרן, לבלתי מעשית.
 */
export function fingerprint(value) {
  const text = canonical(value);
  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(36)}.${b.toString(36)}`;
}

/** טביעות לכל מפה שטוחה. */
export function fingerprintAll(flat) {
  const out = new Map();
  for (const [composite, value] of flat) out.set(composite, fingerprint(value));
  return out;
}

/**
 * מה השתנה מקומית מאז הסנכרון האחרון.
 *
 * @param {Map} marks   טביעות מהסנכרון המוצלח האחרון (rowKey → טביעה)
 * @param {Map} flat    המצב עכשיו (rowKey → ערך)
 * @returns {Array<{entity, entity_key, value}>} value === null הוא מצבה
 *
 * מפתח שנעלם מ-flat מוחזר כמצבה ולא מושמט. השמטה הייתה אומרת שמחיקה
 * לא מסתנכרנת בכלל: המכשיר השני לא היה שומע עליה, והיה מחזיר את
 * השורה בסנכרון הבא — כלומר כל מחיקה הייתה מתבטלת מעצמה.
 */
export function diffAgainst(marks, flat) {
  const changes = [];

  for (const [composite, value] of flat) {
    if (marks.get(composite) === fingerprint(value)) continue;
    const { entity, key } = splitRowKey(composite);
    changes.push({ entity, entity_key: key, value });
  }

  for (const composite of marks.keys()) {
    if (flat.has(composite)) continue;
    const { entity, key } = splitRowKey(composite);
    changes.push({ entity, entity_key: key, value: null });
  }

  return changes;
}

/** מבנה ריק שכל ההחלה נשענת עליו — כדי שמצב חלקי לא יפיל גישה לשדה. */
function ensureShape(state) {
  const next = state && typeof state === "object" ? { ...state } : {};
  const plan = next.plan && typeof next.plan === "object" ? { ...next.plan } : {};
  next.plan = {
    ...plan,
    slots: { ...(plan.slots || {}) },
    checked: { ...(plan.checked || {}) },
  };
  next.pantry = { ...(next.pantry || {}) };
  next.dishes = { ...(next.dishes || {}) };
  next.ingredients = { ...(next.ingredients || {}) };
  next.profiles = Array.isArray(next.profiles) ? [...next.profiles] : [];
  return next;
}

/**
 * מחיל שורות שנמשכו מהשרת על מצב מקומי, ומחזיר מצב חדש.
 *
 * @param {object} state מצב מקומי
 * @param {Array<{entity, entity_key, value}>} rows שורות מהשרת
 * @param {Set<string>} [skip] rowKey-ים שלא לגעת בהם
 *
 * ── skip הוא מה שהופך את המיזוג לנכון ──────────────────────────────
 * שם נכנסים המפתחות שהמשתמש שינה מקומית וטרם נדחפו. בלי זה משיכה
 * שקדמה לדחיפה הייתה מבטלת את העריכה שהרגע נעשתה — היא הייתה נדרסת
 * בערך הישן מהשרת, ואז נדחפת בחזרה כאילו כלום לא קרה. עם skip
 * העריכה המקומית שורדת ונדחפת, ומנצחת כי היא הגיעה אחרונה.
 *
 * ההפסד היחיד שנשאר הוא התנגשות אמיתית — שניים ששינו את *אותה*
 * משבצת בין שני סנכרונים. שם אחרון מנצח, וזה נאמר למשתמש במפורש.
 */
export function applyRows(state, rows, skip = new Set()) {
  const next = ensureShape(state);
  // הפרופילים נבנים מחדש רק אם באמת הגיעו שורות פרופיל, אחרת משיכה
  // שלא נגעה בהם הייתה מוחקת את כולם.
  const profileById = new Map();
  next.profiles.forEach((profile, index) => {
    if (!profile || !profile.id) return;
    // הפרופילים במצב המקומי נטענו מהאחסון, ושם _order כבר הוסר — הוא
    // פרט תחבורה ולא שדה של המודל. בלי השתלה מחדש מהמיקום כולם היו
    // נופלים לאותה דרגה, וכל פרופיל שנמשך היה נדחס לראש הרשימה.
    profileById.set(profile.id, { ...profile, _order: profile._order ?? index });
  });
  let profilesTouched = false;

  for (const row of rows || []) {
    if (!row || typeof row !== "object") continue;
    const { entity, entity_key: key } = row;
    if (typeof entity !== "string" || typeof key !== "string") continue;
    if (skip.has(rowKey(entity, key))) continue;

    const value = row.value;
    const dead = value === null || value === undefined;

    switch (entity) {
      case ENTITY.SLOT:
        if (dead) delete next.plan.slots[key];
        else next.plan.slots[key] = value;
        break;

      case ENTITY.CHECKED:
        // כיבוי סימון מגיע כמצבה, כי false לא נשמר מלכתחילה.
        if (dead || value !== true) delete next.plan.checked[key];
        else next.plan.checked[key] = true;
        break;

      case ENTITY.PANTRY:
        if (dead) delete next.pantry[key];
        else next.pantry[key] = value;
        break;

      case ENTITY.DISH:
        if (dead) delete next.dishes[key];
        else next.dishes[key] = value;
        break;

      case ENTITY.INGREDIENT:
        if (dead) delete next.ingredients[key];
        else next.ingredients[key] = value;
        break;

      case ENTITY.PROFILE:
        profilesTouched = true;
        if (dead) profileById.delete(key);
        else profileById.set(key, { ...value, id: key });
        break;

      case ENTITY.META:
        if (key === META.WEEK_START && typeof value === "string") {
          next.plan.week_start = value;
        } else if (key === META.ONBOARDED) {
          // רק true נקלט. מכשיר שסיים הגדרה מעביר את המסקנה הלאה,
          // אבל מכשיר שטרם סיים אותה לא מחזיר אף אחד למסך הפתיחה.
          if (value === true) next.onboarded = true;
        } else if (key === META.PREFS && value && typeof value === "object") {
          next.prefs = value;
        }
        // META.SCHEMA לא מוחל על המצב. הוא נבדק לפני המיזוג (ר'
        // remoteSchemaVersion) ותפקידו לעצור סנכרון, לא לשנות נתונים.
        break;

      default:
        // ישות שהגרסה הזו לא מכירה — גרסה חדשה יותר כתבה אותה.
        // מתעלמים בשקט במקום להיכשל; שומר הסף של הסכמה כבר עצר את
        // המקרה שבו זה באמת מסוכן.
        break;
    }
  }

  if (profilesTouched) {
    next.profiles = [...profileById.values()]
      .sort((a, b) => (a._order ?? 0) - (b._order ?? 0))
      .map((profile) => {
        // _order הוא פרט תחבורה. שמירתו במצב הייתה מדליפה אותו לקובץ
        // הגיבוי ולכל מסך שקורא פרופיל.
        const { _order, ...clean } = profile;
        return clean;
      });
  }

  return next;
}

/**
 * גרסת הסכמה שנמצאת בשרת, או null אם לא נשלחה.
 *
 * נקרא לפני המיזוג. מכשיר שרץ על גרסה ישנה יותר מזו שכתבה לשרת חייב
 * לעצור — בדיוק כמו נעילת הכתיבה ב-store.js, ומאותו נימוק: הוא לא
 * מכיר את השדות החדשים, וכל דחיפה שלו הייתה חותכת אותם בשקט מהמכשיר
 * של האדם השני.
 */
export function remoteSchemaVersion(rows) {
  for (const row of rows || []) {
    if (row && row.entity === ENTITY.META && row.entity_key === META.SCHEMA) {
      return typeof row.value === "number" ? row.value : null;
    }
  }
  return null;
}
