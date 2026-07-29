/* קליינט Supabase מינימלי — התחברות גוגל (PKCE) ו-REST, על fetch בלבד.

   ── למה לא ה-SDK הרשמי ──────────────────────────────────────────────
   `@supabase/supabase-js` הוא חבילת npm. באפליקציה בלי build ובלי
   תלויות, השימוש בו פירושו אחת משתיים: קריאת רשת ל-CDN בכל טעינה
   (שמפילה את האפליקציה כשה-CDN לא זמין, ומדליפה את הביקור לצד שלישי),
   או הדבקת ~120KB מוקטנים ובלתי-קריאים לתוך המאגר.

   מה שבאמת נחוץ כאן הוא ארבע קריאות HTTP. הן כתובות למטה במלואן,
   בערך במאתיים שורות שאפשר לקרוא ולתקן. זה גם מה ששומר על הכלל
   שבראש הפרויקט: אפס תלויות חיצוניות.

   ── PKCE ולא הזרימה המשתמעת ─────────────────────────────────────────
   הזרימה המשתמעת מחזירה את הטוקן ב-fragment של הכתובת, ומשם הוא נכנס
   להיסטוריית הדפדפן ולכל הרחבה שקוראת אותה. PKCE מחזיר קוד חד-פעמי
   שחסר ערך בלי ה-verifier שנשאר במכשיר. */

import { SUPABASE, redirectUrl } from "./config.js";

const SESSION_KEY = "gp_meals_session";
const VERIFIER_KEY = "gp_meals_pkce_verifier";

/* טוקן מתרענן דקה לפני שהוא באמת פג. בלי המרווח, בקשה שיצאה שנייה
   לפני הפקיעה חוזרת 401 בדיוק כשהמשתמש לוחץ. */
const EXPIRY_MARGIN_MS = 60000;

/* ---------- אחסון הסשן ---------- */

/* אותה הגנה כמו ב-store: גישה ל-localStorage משליכה כשחסימת אחסון
   פעילה, ואסור שזה יפיל את האפליקציה. בלי אחסון פשוט אין סשן שנשמר. */
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadSession() {
  const raw = read(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session?.refresh_token || !session?.user?.email) return null;
    return session;
  } catch {
    return null;
  }
}

function saveSession(session) {
  write(SESSION_KEY, session ? JSON.stringify(session) : null);
}

/**
 * התשובה מ-GoTrue → הצורה שאנחנו שומרים.
 * שומרים `expires_at` מוחלט ולא `expires_in` יחסי, כי הסשן שורד רענון
 * של הדף וגם סגירה של הטלפון לשבוע — "בעוד שעה" מאבד משמעות ברגע
 * שנכתב לדיסק.
 */
function sessionFromToken(payload) {
  if (!payload?.access_token || !payload?.refresh_token) return null;
  const ttl = Number(payload.expires_in);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + (Number.isFinite(ttl) ? ttl : 3600) * 1000,
    user: {
      id: payload.user?.id || null,
      email: (payload.user?.email || "").toLowerCase(),
      name: payload.user?.user_metadata?.full_name || payload.user?.user_metadata?.name || "",
      avatar: payload.user?.user_metadata?.avatar_url || "",
    },
  };
}

/* ---------- PKCE ---------- */

const VERIFIER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let out = "";
  for (const byte of bytes) out += VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length];
  return out;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/* ---------- HTTP ---------- */

function authHeaders(token) {
  return {
    apikey: SUPABASE.ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE.ANON_KEY}`,
  };
}

async function postJson(path, body, token) {
  const response = await fetch(`${SUPABASE.URL}${path}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* גוף שאינו JSON — נטפל בו לפי הסטטוס בלבד */
  }
  if (!response.ok) {
    const error = new Error(
      payload?.error_description || payload?.msg || `HTTP ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ---------- הקליינט ---------- */

export function createAuth() {
  let session = loadSession();
  let refreshing = null; // בקשת רענון בתעופה — כדי לא לשגר שתיים במקביל

  const auth = {
    get user() {
      return session?.user || null;
    },

    get signedIn() {
      return !!session;
    },

    /**
     * מתחיל את זרימת ההתחברות. הדף עוזב לגוגל ולא חוזר מכאן, ולכן
     * ה-verifier נכתב לפני ההפניה — ולא אחריה.
     */
    async signIn() {
      const verifier = randomVerifier();
      const challenge = await challengeFor(verifier);
      if (!write(VERIFIER_KEY, verifier)) {
        throw new Error("הדפדפן חוסם שמירה מקומית, ולכן אי אפשר להתחבר במכשיר הזה.");
      }
      const params = new URLSearchParams({
        provider: "google",
        redirect_to: redirectUrl(),
        code_challenge: challenge,
        code_challenge_method: "s256",
      });
      location.assign(`${SUPABASE.URL}/auth/v1/authorize?${params}`);
    },

    /**
     * קולט את החזרה מגוגל. מחזיר true אם התחברנו עכשיו.
     *
     * הכתובת מנוקה מהקוד בכל מקרה — גם בכישלון — כדי שרענון לא ינסה
     * לממש שוב קוד שכבר נשרף, וכדי שהקוד לא יישאר בהיסטוריה.
     */
    async completeSignIn() {
      const params = new URLSearchParams(location.search);
      const code = params.get("code");
      const failed = params.get("error") || params.get("error_description");
      if (!code && !failed) return false;

      const verifier = read(VERIFIER_KEY);
      write(VERIFIER_KEY, null);
      history.replaceState(null, "", redirectUrl());

      if (failed) throw new Error("ההתחברות בוטלה או נכשלה.");
      if (!verifier) throw new Error("ההתחברות התחילה בדפדפן אחר. נסה שוב מכאן.");

      const payload = await postJson("/auth/v1/token?grant_type=pkce", {
        auth_code: code,
        code_verifier: verifier,
      });
      session = sessionFromToken(payload);
      if (!session) throw new Error("ההתחברות נכשלה.");
      saveSession(session);
      return true;
    },

    /**
     * טוקן גישה תקף, או null כשאין סשן ואי אפשר לרענן.
     *
     * כישלון רשת אינו מנתק: מחזירים את הטוקן הקיים גם כשפג, והקריאה
     * שתיכשל ב-401 היא זו שתחליט. הניתוק שמור לתשובה מפורשת מהשרת
     * שה-refresh token אינו תקף — אחרת יציאה מהבית עם קליטה גרועה
     * הייתה מוחקת את הסשן ומחזירה את המשתמש למסך התחברות בלי רשת. */
    async token() {
      if (!session) return null;
      if (Date.now() < session.expires_at - EXPIRY_MARGIN_MS) return session.access_token;

      if (!refreshing) {
        refreshing = postJson("/auth/v1/token?grant_type=refresh_token", {
          refresh_token: session.refresh_token,
        })
          .then((payload) => {
            const next = sessionFromToken(payload);
            if (next) {
              session = next;
              saveSession(session);
            }
            return session?.access_token || null;
          })
          .catch((error) => {
            // 400/401 = ה-refresh token נשרף או נשלל. כל השאר — רשת.
            if (error.status === 400 || error.status === 401) {
              session = null;
              saveSession(null);
              return null;
            }
            return session?.access_token || null;
          })
          .finally(() => {
            refreshing = null;
          });
      }
      return refreshing;
    },

    async signOut() {
      const token = session?.access_token;
      session = null;
      saveSession(null);
      // ניתוק מקומי קורה תמיד. הודעה לשרת היא ניקיון, לא תנאי.
      if (token) {
        try {
          await postJson("/auth/v1/logout", {}, token);
        } catch {
          /* אין רשת — הסשן כבר נמחק מהמכשיר */
        }
      }
    },

    /**
     * קריאת REST מאומתת. `rest` לא מרענן לבד ולא מתנתק לבד — הוא רק
     * מדווח, וההחלטה נשארת אצל הקורא (`sync.js`).
     */
    async rest(path, { method = "GET", body, headers } = {}) {
      const token = await auth.token();
      if (!token) {
        const error = new Error("לא מחובר");
        error.status = 401;
        throw error;
      }
      const response = await fetch(`${SUPABASE.URL}/rest/v1${path}`, {
        method,
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        /* כנ"ל */
      }
      if (!response.ok) {
        const error = new Error(payload?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.details = payload;
        throw error;
      }
      return payload;
    },
  };

  return auth;
}
