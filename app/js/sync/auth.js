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
import { normalizeEmail } from "./present.js";

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
      /* הודעת השרת נשמרת ב-`detail` ולא ב-`message`.

         כל מחרוזת שהמשתמש רואה באפליקציה הזו היא בעברית, והודעות
         Supabase אנגליות ("Email rate limit exceeded"). גרסה קודמת
         העבירה אותן כמו שהן אל המסך, כלומר שברה את הכלל בדיוק במסלול
         שהכי סביר להיכשל בו. הקורא מנסח בעברית לפי `status`, ומי
         שמנפה תקלה עדיין מוצא את המקור.

         429 מופרד משאר הכשלים כי הוא דורש פעולה אחרת: לא "נסה שוב"
         אלא "חכה דקה" — וניסיון חוזר מיידי רק מאריך את החסימה. */
      const error = new Error(`שגיאת שרת ${response.status}`);
      error.status = response.status;
      error.detail = data?.error_description || data?.msg || data?.error || null;
      throw error;
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

/* שולח קישור התחברות למייל.

   הנרמול מיובא מ-present.js ולא נכתב כאן שוב: הממשק חייב לפסול כתובת
   פגומה לפני שהוא מוציא בקשה, והבדיקה כאן חייבת להישאר בכל מקרה. שני
   עותקים של אותו כלל נפרדים זה מזה בסיבוב הבא. */
export async function sendMagicLink(email, redirectTo) {
  const clean = normalizeEmail(email);
  if (!clean.ok) throw new Error(clean.error);
  await authFetch("otp", {
    body: { email: clean.email, create_user: true, options: { email_redirect_to: redirectTo } },
  });
  return clean.email;
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
