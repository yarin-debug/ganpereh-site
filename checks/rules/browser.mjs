// חוקים בדפדפן אמיתי.
//  חוק 1 · אין גלישה אופקית — נולד מ-honeypot ב-RTL שניפח את הדף ל-10,350px (19.8).
//  חוק 2 · אין משאב שבור ואין שגיאות — נולד מחבילת CSS ששברה 15 פונטים בלי שום
//          שינוי נראה בפריסה (8.2026).
//
// כל פנייה מחוץ לשרת המקומי (GA4, פיקסל מטא, הדשבורד) נענית בתשובה ריקה:
// הבדיקה לא נרשמת כביקור, לא יוצרת ליד, ולא תלויה ברשת.
import { chromium } from "playwright";
import { TEMPLATE_PAGES, VIEWPORTS } from "../config.mjs";
import { htmlPages, isRedirect, read } from "../lib/site.mjs";

const SMOKE_VIEWPORT = { width: 390, height: 844 };

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" }); // מקומית: Chrome המותקן במק
  }
}

// גלילה עד הסוף ובחזרה, כדי שתמונות עצלות וחשיפות-בגלילה ייטענו.
async function settle(page) {
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

// הגלישה, ומי גורם לה: אלמנטים שחורגים מרוחב המסך ואינם נחתכים ע"י אב עם
// overflow (קרוסלה שגולשת בתוך מסגרת חתוכה אינה גורמת לגלילה).
function measureOverflow() {
  const doc = document.documentElement;
  const extra = doc.scrollWidth - doc.clientWidth;
  if (extra <= 1) return null;
  const W = doc.clientWidth;
  const clipped = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement)
      if (getComputedStyle(a).overflowX !== "visible") return true;
    return false;
  };
  const out = [...document.body.querySelectorAll("*")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > W + 1 || r.left < -1) && !clipped(el);
  });
  const roots = out.filter((el) => !out.includes(el.parentElement));
  const name = (el) => {
    const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30);
    return text ? `${sel} «${text}»` : sel;
  };
  return { extra, culprits: roots.slice(0, 3).map(name) };
}

async function openPage(browser, origin, file, viewport) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const problems = [];
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(origin) || u.startsWith("data:")) return route.continue();
    return route.fulfill({ status: 200, body: "" });
  });
  const self = origin + "/" + file;
  page.on("response", (r) => {
    if (
      r.status() >= 400 &&
      r.url().startsWith(origin) &&
      !(file === "404.html" && r.url() === self)
    )
      problems.push(`${r.status()} ${decodeURIComponent(r.url().slice(origin.length))}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith(origin))
      problems.push(`נכשל ${decodeURIComponent(r.url().slice(origin.length))}`);
  });
  page.on("console", (m) => {
    // שגיאת "Failed to load resource" היא כפילות של תגובת ה-4xx שכבר נרשמה.
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      problems.push(`קונסולה: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => problems.push(`שגיאת JS: ${e.message.slice(0, 160)}`));
  await page.goto(self, { waitUntil: "load" });
  await settle(page);
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc)
      .map((i) => i.currentSrc),
  );
  for (const src of broken)
    problems.push(`תמונה שבורה ${decodeURIComponent(new URL(src).pathname)}`);
  return { page, context, problems };
}

export async function runBrowserRules(origin) {
  const browser = await launch();
  const overflow = { id: 1, title: "אין גלישה אופקית", severity: "block", failures: [] };
  const smoke = { id: 2, title: "אין משאב שבור ואין שגיאות", severity: "block", failures: [] };
  const report = (file, vp, o) =>
    overflow.failures.push({
      where: `${file} · ${vp.width}×${vp.height}`,
      msg: `גולש ${o.extra}px · ${o.culprits.join(" · ") || "?"}`,
    });

  try {
    const pages = htmlPages().filter((f) => !isRedirect(read(f)));

    // עשן: כל העמודים, ברוחב טלפון. בדרך — גם גלישה ברוחב הזה.
    for (const file of pages) {
      const { page, context, problems } = await openPage(browser, origin, file, SMOKE_VIEWPORT);
      for (const p of new Set(problems)) smoke.failures.push({ where: file, msg: p });
      const o = await page.evaluate(measureOverflow);
      if (o && !TEMPLATE_PAGES.includes(file)) report(file, SMOKE_VIEWPORT, o);
      await context.close();
    }

    // גלישה: עמודי התבנית בכל חמשת הגדלים.
    for (const file of TEMPLATE_PAGES)
      for (const vp of VIEWPORTS) {
        const { page, context } = await openPage(browser, origin, file, vp);
        const o = await page.evaluate(measureOverflow);
        if (o) report(file, vp, o);
        await context.close();
      }

    overflow.checked = `${TEMPLATE_PAGES.length} תבניות × ${VIEWPORTS.length} גדלים + ${pages.length} עמודים ב-390`;
    smoke.checked = `${pages.length} עמודים`;
    return [overflow, smoke];
  } finally {
    await browser.close();
  }
}
