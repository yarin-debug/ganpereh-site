/* התחברות וניהול הסשן — קישור קסם למייל.

   ── למה fetch ולא ספריית Supabase ──────────────────────────────────
   לאפליקציה אין שלב build ואין תלויות, וזו לא צנע אלא מבנה: היא
   נפתחת מקובץ סטטי ומוגשת מ-GitHub Pages. הוספת ה-SDK הייתה גוררת
   באנדלר, package.json, ותהליך פריסה — כלומר משנה את כל אופי
   הפרויקט בשביל שלוש קריאות HTTP. Supabase חושף REST רגיל, ושלוש
   הקריאות האלה הן בדיוק מה שכתוב כאן.

   ── למה קישור קסם ולא סיסמה ────────────────────────────────────────
   סיסמה היא דבר שאפשר לאבד, לשכוח, ולעולם צריך איפוס. קישור קסם
   מעביר את זה למייל, שממילא קיים. אין מה לנהל ואין מה לדלוף. */

import { SUPABASE_URL, SUPABASE_ANON_KEY, SESSION_KEY, REQUEST_TIMEOUT_MS } from "./config.js";

/* פער הרענון. אסימון Supabase חי שעה; מרעננים דקה מראש כדי שבקשה
   שיצאה לדרך לא תגלה באמצע שהאסימון פג בדיוק עכשיו. */
const REFRESH_MARGIN_MS = 60_000;

let session = null;
let refreshInFlight = null;

/* ---------- אחסון הסשן ---------- */

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.access_token) return null;
    return parsed;
  } catch {
    // אחסון חסום או JSON פגום — מתנהגים כמנותקים. אין כאן מה להציל:
    // סשן הוא נתון מתחדש, לא נתוני משתמש.
    return null;
  }
}

function writeSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* אחסון חסום — הסשן יחיה בזיכרון עד סגירת הטאב */
  }
}

session = readStoredSession();

/* ---------- קריאות ---------- */

async function authFetch(path, { method = "POST", body, token } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        data?.error_description || data?.msg || data?.error || `שגיאה ${response.status}`;
      throw new Error(message);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function storeTokens(data) {
  if (!data?.access_token) return null;
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    // expires_in מגיע בשניות מעכשיו. שומרים רגע מוחלט כדי שהחישוב לא
    // יהיה תלוי במתי בדיוק קראנו את השדה.
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user: data.user ? { id: data.user.id, email: data.user.email } : session?.user || null,
  };
  writeSession(next);
  return next;
}

/* ---------- הממשק ---------- */

/**
 * בונה את נתיב שליחת הקישור, כולל היעד לחזרה.
 *
 * ── הבאג שהפונקציה הזו קיימת בשבילו ────────────────────────────────
 * הגרסה הראשונה שלחה את היעד בגוף הבקשה, בשדה
 * `options.email_redirect_to`. **זו הצורה של ה-SDK, לא של ה-REST.**
 * אנחנו מדברים עם Supabase ב-fetch ישיר ובלי SDK (הנימוק בראש
 * הקובץ), ונקודת הקצה `/auth/v1/otp` קוראת את היעד מ**פרמטר שאילתה**
 * בשם `redirect_to`. שדה בגוף אינו נתמך שם.
 *
 * מה שהפך את זה לקשה לאיתור: השרת לא מחזיר שגיאה. הוא מתעלם מהשדה
 * שאינו מוכר לו, שולח את המייל בהצלחה, ומייצר קישור שמצביע ל-Site
 * URL של הפרויקט. כלומר הכל "עובד" — עד שלוחצים על הקישור ונוחתים
 * בדף הבית של האתר במקום באפליקציה.
 *
 * ⚠️ תיקון הקוד לבדו אינו מספיק. Supabase מכבד רק יעדים שנמצאים
 * ברשימת ההיתר (Authentication → URL Configuration → Redirect URLs),
 * וכתובת שאינה שם נופלת חזרה ל-Site URL — בדיוק אותו סימפטום. שתי
 * הכתובות שחייבות להיות ברשימה מתועדות ב-`app/supabase/SETUP.md`.
 */
export function otpPath(redirectTo) {
  if (!redirectTo) return "otp";
  return `otp?redirect_to=${encodeURIComponent(redirectTo)}`;
}

/** שולח קישור התחברות למייל. */
export async function sendMagicLink(email, redirectTo) {
  const clean = String(email || "")
    .trim()
    .toLowerCase();
  if (!clean || !clean.includes("@")) throw new Error("כתובת המייל אינה תקינה.");
  await authFetch(otpPath(redirectTo), {
    body: { email: clean, create_user: true },
  });
  return clean;
}

/**
 * קולט אסימונים שחזרו מקישור הקסם.
 *
 * Supabase מחזיר אותם ב-**fragment** של הכתובת (`#access_token=…`),
 * שלא נשלח לשרת לעולם — ולכן הוא גם לא נכנס ללוגים של GitHub Pages
 * ולא ל-Referer של הבקשה הבאה. מיד אחרי הקליטה הוא נמחק מהכתובת,
 * כדי שרענון או שיתוף הקישור לא ישאו אסימון חי.
 *
 * @returns {boolean} האם באמת נקלט סשן
 */
export function consumeAuthRedirect() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  if (!accessToken) return false;

  storeTokens({
    access_token: accessToken,
    refresh_token: params.get("refresh_token"),
    expires_in: params.get("expires_in"),
  });

  history.replaceState(null, "", location.pathname + location.search);
  return true;
}

export function currentSession() {
  return session;
}

export function signedIn() {
  return Boolean(session?.access_token);
}

export function currentUser() {
  return session?.user || null;
}

/**
 * אסימון תקף, מרענן אם צריך.
 *
 * refreshInFlight מונע עדר: כמה קריאות מקבילות שכולן מגלות שהאסימון
 * פג היו שולחות כל אחת בקשת רענון, וכל אחת הייתה פוסלת את האסימון
 * של קודמתה — כלומר מנתקת את המשתמש בדיוק כשהוא הכי פעיל.
 */
export async function accessToken() {
  if (!session?.access_token) return null;
  if (Date.now() < session.expires_at - REFRESH_MARGIN_MS) return session.access_token;
  if (!session.refresh_token) return session.access_token;

  if (!refreshInFlight) {
    refreshInFlight = authFetch("token?grant_type=refresh_token", {
      body: { refresh_token: session.refresh_token },
    })
      .then((data) => storeTokens(data)?.access_token || null)
      .catch(() => {
        // רענון שנכשל מנתק. להשאיר סשן מת היה מייצר כישלון חוזר בכל
        // סנכרון בלי שהמשתמש יבין שהוא פשוט צריך להתחבר שוב.
        writeSession(null);
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** מנתק מקומית. הנתונים במכשיר נשארים — הם היו כאן לפני החשבון. */
export async function signOut() {
  const token = session?.access_token;
  writeSession(null);
  if (!token) return;
  try {
    await authFetch("logout", { token });
  } catch {
    /* ביטול האסימון בשרת הוא ניקיון, לא תנאי לניתוק המקומי */
  }
}
