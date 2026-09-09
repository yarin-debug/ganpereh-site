/* ═══════════════════════════════════════════════════════════════
   הסכמה לכלי מדידה — באנר, זיכרון, והדלקת פיקסל מטא
   ───────────────────────────────────────────────────────────────
   למה הקובץ הזה קיים: עד 9.9.2026 פיקסל מטא ו-GA4 נורו בטעינת הדף
   בכל 40 העמודים, בלי שהמבקר ראה הודעה. בישראל אין חובת באנר מפורשת
   כמו באירופה, אבל עמדת הרשות להגנת הפרטיות על כלי מעקב מדברת על
   הסכמה מדעת, ותנאי Meta מטילים את חובת ההסכמה על המפרסם.

   🔑 החלוקה המכוונת בין שני הכלים:
   ▸ GA4 (מדידת אתר) — ממשיך לרוץ. הוא נחוץ לתפעול האתר, והוא נולד
     מעכשיו עם ad_storage/ad_user_data/ad_personalization במצב denied
     דרך Consent Mode, כלומר בלי הרכיב הפרסומי.
   ▸ פיקסל מטא (פרסום ורימרקטינג) — לא נטען בכלל עד הסכמה מפורשת.
   זו העמדה הפרופורציונלית: מגבילים את מה שבאמת דורש הסכמה, ולא
   משביתים את המדידה של האתר עצמו. אם תרצו לגדר גם את GA4 — לשנות
   ל-'denied' את analytics_storage בבלוק ה-default שבכל עמוד, ולהוסיף
   אותו כאן ל-GRANT.

   🔑 ומה שאסור לשבור: ה-shim של fbq והתור שלו נשארים אינליין בכל
   עמוד ורצים תמיד, גם בלי הסכמה. הסיבה מתועדת מ-20.8 ב-index.html —
   `track.js` יורה fbq("track","Lead") מאחורי `if (window.fbq)`, ובלי
   ה-shim ליד שנסגר מוקדם היה נופל בשקט. עם הגייט זה דווקא מסתדר
   יפה: האירועים נכנסים לתור המקומי, ו-fbevents.js נטען רק אם ניתנה
   הסכמה — כלומר שום דבר לא יוצא למטא לפני שהמבקר אמר כן. מי שסירב,
   התור פשוט נזרק עם הדף.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  var KEY = "gp_consent_v1";
  var ACCEPT = "granted";
  var DECLINE = "denied";

  /* localStorage זורק בחלון פרטי ובדפדפנים שחוסמים נתוני אתר, ולא
     מחזיר ערך ריק. כל נגיעה עטופה, וכשלון נקרא כ"לא הוכרע" — כלומר
     הבאנר יופיע שוב, וזו ההתנהגות הבטוחה יותר מבחינת הסכמה. */
  function read() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }
  function write(v) {
    try {
      window.localStorage.setItem(KEY, v);
    } catch (e) {
      /* אין מה לעשות — הבחירה תקפה לדף הזה בלבד */
    }
  }

  function grantTools() {
    /* מטא — ההדלקה היחידה. הפונקציה מוגדרת ב-shim האינליין שבכל עמוד;
       היא עשויה לא להתקיים בעמוד שאין בו פיקסל, ולכן הבדיקה. */
    if (typeof window.__gpPixelBoot === "function") window.__gpPixelBoot();
    /* גוגל — שחרור הרכיב הפרסומי בלבד. analytics_storage כבר granted. */
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      });
    }
  }

  /* ── הבאנר ──
     ה-CSS מוזרק מכאן ולא מגיליון משותף בכוונה: הבאנר רץ על שלוש
     מערכות עיצוב שונות (האתר, דף הנחיתה, השאלון), ואף אחת מהן לא
     חולקת טוקנים עם השתיים האחרות. קובץ אחד עצמאי הוא מה שמבטיח
     שהוא נראה זהה בשלושתן. */
  var CSS = [
    ".gp-consent{position:fixed;inset-inline:0;bottom:0;z-index:2147483000;",
    "background:#1b3024;color:rgba(255,255,255,.86);",
    "box-shadow:0 -8px 36px rgba(0,0,0,.28);",
    "font-family:inherit;direction:rtl;text-align:right;",
    "transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.7,.3,1)}",
    ".gp-consent.is-in{transform:none}",
    "@media (prefers-reduced-motion:reduce){.gp-consent{transition:none}}",
    ".gp-consent-in{max-width:1100px;margin:0 auto;padding:18px 24px;",
    "display:flex;align-items:center;gap:18px 28px;flex-wrap:wrap}",
    ".gp-consent-txt{flex:1 1 380px;font-size:.86rem;line-height:1.7;margin:0}",
    ".gp-consent-txt a{color:#fff;text-decoration:underline;text-underline-offset:3px}",
    ".gp-consent-btns{display:flex;gap:10px;flex-wrap:wrap}",
    /* שני הכפתורים באותו גודל ובאותו משקל בכוונה. הסכמה שנקנתה בכך
       שכפתור הסירוב קטן או חיוור אינה הסכמה חופשית. */
    ".gp-consent-btn{min-height:44px;min-width:112px;padding:0 20px;",
    "font:inherit;font-size:.85rem;font-weight:700;border-radius:10px;",
    "cursor:pointer;border:1.5px solid transparent;",
    "display:inline-flex;align-items:center;justify-content:center}",
    ".gp-consent-yes{background:#f9f9f7;color:#1b3024}",
    ".gp-consent-no{background:transparent;color:#fff;border-color:rgba(255,255,255,.5)}",
    ".gp-consent-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}",
    "@media (hover:hover) and (pointer:fine){",
    ".gp-consent-yes:hover{background:#fff}",
    ".gp-consent-no:hover{border-color:#fff;background:rgba(255,255,255,.08)}}",
    "@media (max-width:560px){.gp-consent-in{padding:16px}",
    ".gp-consent-btns{width:100%}.gp-consent-btn{flex:1 1 0}}",
  ].join("");

  var el = null;

  function close(choice) {
    write(choice);
    if (choice === ACCEPT) grantTools();
    if (el) {
      el.classList.remove("is-in");
      var node = el;
      el = null;
      window.setTimeout(function () {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }, 350);
    }
  }

  function show() {
    if (el) return;

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    el = document.createElement("div");
    el.className = "gp-consent";
    /* region ולא dialog: זו הודעה שאפשר להתעלם ממנה ולהמשיך לגלוש,
       ולא חלון שחוסם. dialog היה כולא את המיקוד בתוכה. */
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "הודעה על שימוש בעוגיות");
    el.innerHTML =
      '<div class="gp-consent-in">' +
      '<p class="gp-consent-txt">אנחנו משתמשים בעוגיות למדידת ביצועי האתר, ובכלי פרסום של Meta ' +
      "כדי למדוד את המודעות שלנו. כלי הפרסום נטענים רק אם תאשרו. " +
      '<a href="/privacy.html">מדיניות הפרטיות</a></p>' +
      '<div class="gp-consent-btns">' +
      '<button type="button" class="gp-consent-btn gp-consent-yes">אישור</button>' +
      '<button type="button" class="gp-consent-btn gp-consent-no">בלי כלי פרסום</button>' +
      "</div></div>";

    document.body.appendChild(el);
    el.querySelector(".gp-consent-yes").addEventListener("click", function () {
      close(ACCEPT);
    });
    el.querySelector(".gp-consent-no").addEventListener("click", function () {
      close(DECLINE);
    });

    /* פריים אחד לפני ההנפשה, אחרת הדפדפן מחיל את מצב הסיום מיד */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (el) el.classList.add("is-in");
      });
    });
  }

  /* פתיחה מחדש של הבחירה — מקושר ממדיניות הפרטיות */
  window.gpCookieSettings = function () {
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) {}
    show();
  };

  function start() {
    var choice = read();
    if (choice === ACCEPT) {
      grantTools();
      return;
    }
    if (choice === DECLINE) return;
    show();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
