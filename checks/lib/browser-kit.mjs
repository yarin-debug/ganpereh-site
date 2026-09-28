// checks/lib/browser-kit.mjs — פתיחת עמוד בדפדפן לבדיקה, עם רשת מבודדת.
//
// שתי שכבות הגנה מפני ליד אמיתי או ביקור שנרשם:
//  1. השרת המקומי מחליף את כתובות הדשבורד ו-Formspree בדומיין .invalid (server.mjs).
//  2. כל פנייה שיוצאת מהשרת המקומי מיורטת כאן: פניות ל-.invalid מקבלות
//     תשובת הצלחה מדומה ונרשמות ב-sent (כדי שחוקי הטפסים יבדקו מה נשלח),
//     וכל השאר (GA4, פיקסל מטא, CDN) מקבל תשובה ריקה.
import { chromium } from "playwright";

export async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" }); // מקומית: Chrome המותקן במק
  }
}

const MOCK = {
  "/api/leads/call-windows": { ok: true, slots: [] },
  default: { ok: true },
};

export async function openPage(browser, origin, file, viewport, { consent = true, js = true, initScript } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion: "reduce", serviceWorkers: "block", javaScriptEnabled: js });
  // באנר העוגיות: הבחירה נשמרת לפני שהעמוד נטען, כמו אצל גולש שכבר סירב —
  // "בלי כלי פרסום", הבחירה ששומרת על פרטיות. לחיצה על הבאנר לא נקלטה בזמן
  // תחת עומס, והבאנר נשאר בצילומים ועל כפתורים (28.9).
  if (consent) await context.addInitScript(() => {
    try {
      localStorage.setItem("gp_consent_v1", "denied");
    } catch {}
  });
  if (initScript) await context.addInitScript(initScript);
  const problems = [];
  const sent = [];
  const REAL = /ganpereh-dashboard\.vercel\.app|formspree\.io/;
  await context.route("**/*", (route) => {
    const req = route.request();
    const u = req.url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    if (u.includes(".gate.invalid")) {
      const { host, pathname } = new URL(u);
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch {}
      sent.push({ method: req.method(), host, path: pathname, body });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK[pathname] || MOCK.default) });
    }
    // פנייה לכתובת אמיתית אומרת שהשכתוב ב-server.mjs לא תפס נקודת שליחה חדשה.
    // היא נחסמת כאן — אבל מדווחת, כי בלי היירוט הזה זה היה ליד אמיתי.
    if (REAL.test(u)) problems.push(`🚨 פנייה לכתובת אמיתית נחסמה: ${new URL(u).host}${new URL(u).pathname} — להוסיף ל-SANDBOX`);
    return route.fulfill({ status: 200, body: "" });
  });
  const page = await context.newPage();
  // לחיצה על פקד מכוסה מחכה לנצח שהוא "יתפנה". 5 שניות מספיקות לכל מעבר מונפש.
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(30000);
  const self = origin + "/" + file;
  const rel = (u) => decodeURIComponent(u.slice(origin.length));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(origin) && !(file === "404.html" && r.url() === self))
      problems.push(`${r.status()} ${rel(r.url())}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(origin)) problems.push(`נכשל ${rel(r.url())}`);
  });
  page.on("console", (m) => {
    // "Failed to load resource" היא כפילות של תגובת ה-4xx שכבר נרשמה.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) problems.push(`קונסולה: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => problems.push(`שגיאת JS: ${e.message.slice(0, 160)}`));
  await page.goto(self, { waitUntil: "load" });
  return { page, context, problems, sent };
}

// גלילה עד הסוף ובחזרה, כדי שתמונות עצלות וחשיפות-בגלילה ייטענו.
export async function settle(page) {
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// "גלוי" במובן של גולש: בתוך המסך, לא שקוף ולא מוסתר.
export function isShown(selector) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 20 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== "hidden" && parseFloat(cs.opacity) > 0.1;
}

// בדיקה שזורקת (לחיצה שנחסמה, אלמנט שנעלם) היא ממצא — לא סיבה להפיל את השער.
export async function guard(fn) {
  try {
    return await fn();
  } catch (e) {
    const m = e.message.split("\n");
    const why = m.find((l) => /intercepts pointer events/.test(l));
    return [why ? `הלחיצה נחסמת — ${why.replace(/^.*?<(\w+)[^>]*?(class="[^"]*")?.*$/, "<$1 $2>").trim()}` : `הבדיקה נכשלה — ${m[0].slice(0, 140)}`];
  }
}

// אנימציות כניסה (fade-in) מתחילות בשקיפות 0. מדידה לפני שהסתיימו רואה תוכן
// "מוסתר" שיופיע עוד רגע. מחכים לכל אנימציה סופית; אינסופיות (מרקי) לא נגמרות.
export async function animationsDone(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((r) => setTimeout(r, 4000)),
    ]),
  );
}

// n עמודים במקביל; התוצאות חוזרות בסדר המקורי, כך שהדוח יציב בין ריצות.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
