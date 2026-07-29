/* שכבת הסנכרון — מחברת את ה-store המקומי למשק הבית המשותף.

   ── מקומי קודם, תמיד ───────────────────────────────────────────────
   הסנכרון נבנה כשכבה *מעל* ה-store ולא במקומו, וזו ההחלטה שמחזיקה את
   כל השאר. כל המסכים ממשיכים לקרוא `store.state` באופן סינכרוני, וכל
   כתיבה נשמרת ל-localStorage מיד — לפני שנגענו ברשת ובלי קשר להצלחתה.

   הסיבה אינה אלגנטיות: רשימת הקניות נפתחת בסופר, במרתף, בלי קליטה.
   אפליקציה שממתינה לשרת לפני שהיא מציירת מסך היא אפליקציה שלא עובדת
   בדיוק ברגע שבשבילו היא נכתבה. הרשת כאן היא שיפור, לא תנאי.

   ── מחזור אחד ──────────────────────────────────────────────────────
   משיכה → מיזוג לפי מפתח (`merge.js`) → דחיפה עם בדיקת גרסה. הדחיפה
   מותנית ב-`rev` שממנו נגזרה המשיכה: אם מישהו כתב בינתיים, השרת מחזיר
   אפס שורות, ואנחנו חוזרים למשיכה במקום לדרוס אותו. */

import { syncConfigured, POLL_MS } from "./config.js";
import { createAuth } from "./supabase.js";
import { mergeDocs, hasLocalNews, pruneTombstones } from "./merge.js";

const PUSH_DEBOUNCE_MS = 800;
const MAX_CONFLICT_RETRIES = 4;
const HOUSEHOLD_COLS = "id,doc,meta,rev";

/**
 * @param {object} store ה-store של האפליקציה
 * @param {() => Date} [now] שעון. מוזרק בבדיקות.
 */
export function createSync(store, now = () => new Date()) {
  const auth = createAuth();
  const listeners = new Set();

  // off — אין תצורה כלל. signed_out — יש תצורה ואין סשן.
  let status = syncConfigured() ? (auth.signedIn ? "syncing" : "signed_out") : "off";
  let message = null;
  let lastSyncedAt = null;
  let profileId = null;
  let running = null; // מחזור בתעופה — שומר על מחזור יחיד בכל רגע
  let pending = false; // הגיעה בקשה בזמן שרצנו — לרוץ שוב בסיום
  let pushTimer = null;
  let pollTimer = null;

  function emit(next, text) {
    if (next) status = next;
    message = text || null;
    for (const fn of listeners) {
      try {
        fn(api.state());
      } catch (error) {
        console.error("מאזין סנכרון נכשל", error);
      }
    }
  }

  /* ---------- קריאות מול השרת ---------- */

  /**
   * מאתר את משק הבית של המשתמש, ויוצר אותו בהתחברות הראשונה.
   * הפונקציה יושבת בשרת (`meals_bootstrap`) ולא כאן, כי משתמש חדש
   * עדיין אינו חבר באף משק בית — ולכן RLS חוסם ממנו את היצירה. זו
   * בעיית ביצה ותרנגולת שרק `security definer` פותר.
   */
  async function bootstrap() {
    const rows = await auth.rest("/rpc/meals_bootstrap", { method: "POST", body: {} });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.household_id) throw new Error("no-household");
    profileId = row.profile_id || null;
    return row.household_id;
  }

  async function fetchHousehold(id) {
    const rows = await auth.rest(
      `/meals_households?select=${HOUSEHOLD_COLS}&id=eq.${encodeURIComponent(id)}`,
    );
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  /**
   * כתיבה מותנית בגרסה. `rev=eq.<base>` הוא כל מנגנון המניעה של
   * "כתיבה אחרונה מוחקת": אם מישהו כתב בין המשיכה לדחיפה, ה-rev כבר
   * אינו זה שראינו, אפס שורות מתעדכנות, וההחזרה הריקה מסמנת התנגשות.
   *
   * @returns {number|null} ה-rev החדש, או null בהתנגשות.
   */
  async function pushHousehold(id, doc, meta, baseRev) {
    const rows = await auth.rest(
      `/meals_households?id=eq.${encodeURIComponent(id)}&rev=eq.${baseRev}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: {
          doc,
          meta,
          rev: baseRev + 1,
          updated_at: new Date(now().getTime()).toISOString(),
          updated_by: auth.user?.email || null,
        },
      },
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? Number(row.rev) : null;
  }

  /* ---------- המחזור ---------- */

  async function cycle() {
    let householdId = store.syncSnapshot().household_id;
    if (!householdId) {
      householdId = await bootstrap();
      store.markSynced({ household_id: householdId, rev: 0 });
    }

    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
      const remote = await fetchHousehold(householdId);

      // מכאן ועד סוף הבלוק אין await בכוונה: הצילום, המיזוג וההחלה
      // חייבים לראות את אותו מצב מקומי בדיוק. await באמצע היה נותן
      // למשתמש לערוך בין הצילום להחלה, והעריכה הייתה נדרסת.
      const local = store.syncSnapshot();
      const remoteDoc = remote?.doc || {};
      const remoteMeta = remote?.meta || {};
      const remoteRev = Number(remote?.rev) || 0;

      const merged = mergeDocs(local.doc, local.meta, remoteDoc, remoteMeta);
      const meta = pruneTombstones(merged.doc, merged.meta, now().getTime());

      if (merged.changed) {
        store.applyRemote({ doc: merged.doc, meta, rev: remoteRev });
      } else {
        store.markSynced({ rev: remoteRev, meta });
      }

      if (!hasLocalNews(meta, remoteMeta)) return remoteRev;

      const newRev = await pushHousehold(householdId, merged.doc, meta, remoteRev);
      if (newRev !== null) {
        store.markSynced({ rev: newRev });
        return newRev;
      }
      // התנגשות — מישהו כתב בינתיים. חוזרים למשיכה וממזגים מחדש.
    }

    throw new Error("busy");
  }

  /** מתרגם כשל למצב שהממשק יודע להציג. */
  function classify(error) {
    if (error?.status === 401) {
      emit("signed_out", null);
      return;
    }
    // 403 מ-RLS או חריגה מה-RPC = המייל הזה אינו רשום במשק הבית.
    if (error?.status === 403 || error?.message === "no-household") {
      emit("denied", "החשבון הזה לא רשום למשק הבית. אפשר להוסיף אותו בקובץ ההרשאות ב-Supabase.");
      return;
    }
    if (error?.status === 409 || error?.message === "busy") {
      emit("error", "הסנכרון נדחה כמה פעמים ברציפות. ננסה שוב בעוד רגע.");
      return;
    }
    // כשל רשת אינו שגיאה שצריך להתנצל עליה — האפליקציה עובדת מקומית.
    emit("offline", null);
  }

  async function run() {
    if (!syncConfigured() || !auth.signedIn) return;
    if (running) {
      pending = true;
      return running;
    }
    emit("syncing", null);
    running = cycle()
      .then(() => {
        lastSyncedAt = now().getTime();
        emit("ok", null);
      })
      .catch(classify)
      .finally(() => {
        running = null;
        if (pending) {
          pending = false;
          run();
        }
      });
    return running;
  }

  /* ---------- תזמון ---------- */

  function schedulePush() {
    if (!syncConfigured() || !auth.signedIn) return;
    clearTimeout(pushTimer);
    // צובר לחיצות רצופות (מונה מנות, סימון פריטים) לדחיפה אחת.
    pushTimer = setTimeout(run, PUSH_DEBOUNCE_MS);
  }

  function startPolling() {
    stopPolling();
    // רק כשהאפליקציה מול העין. סקר ברקע מרוקן סוללה בשביל מסך
    // שאיש אינו רואה.
    if (typeof document !== "undefined" && document.hidden) return;
    pollTimer = setInterval(run, POLL_MS);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const api = {
    auth,

    state() {
      return {
        status,
        message,
        lastSyncedAt,
        user: auth.user,
        profileId,
        configured: syncConfigured(),
      };
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * נקרא פעם אחת בעליית האפליקציה. קולט חזרה מגוגל אם יש, ומתחיל
     * לסנכרן. אינו חוסם את הרינדור: המסך עולה מהנתונים המקומיים.
     */
    async start() {
      if (!syncConfigured()) return;
      try {
        if (await auth.completeSignIn()) emit("syncing", null);
      } catch (error) {
        emit("signed_out", error.message);
        return;
      }
      if (!auth.signedIn) {
        emit("signed_out", null);
        return;
      }
      startPolling();
      await run();
    },

    async signIn() {
      try {
        await auth.signIn();
      } catch (error) {
        emit("signed_out", error.message);
      }
    },

    /**
     * מתנתק. הנתונים המקומיים *נשארים* במכשיר — הם היו כאן לפני
     * הסנכרון וימשיכו לעבוד אחריו. מה שנמחק הוא השיוך למשק הבית, כדי
     * שהתחברות של אדם אחר במכשיר הזה לא תדחוף לתוכו את מה שנשאר.
     */
    async signOut() {
      stopPolling();
      clearTimeout(pushTimer);
      await auth.signOut();
      store.markSynced({ household_id: null, rev: 0 });
      profileId = null;
      emit("signed_out", null);
    },

    sync: run,
    schedulePush,
    startPolling,
    stopPolling,
  };

  return api;
}
