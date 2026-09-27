// חוקים בדפדפן אמיתי.
//  חוק 1 · אין גלישה אופקית — נולד מ-honeypot ב-RTL שניפח את הדף ל-10,350px (19.8).
//  חוק 2 · אין משאב שבור ואין שגיאות — נולד מחבילת CSS ששברה 15 פונטים בלי שום
//          שינוי נראה בפריסה (8.2026).
//
// הרשת מבודדת — ר' lib/browser-kit.mjs.
import { TEMPLATE_PAGES, VIEWPORTS } from "../config.mjs";
import { openPage, pool, settle } from "../lib/browser-kit.mjs";
import { distortedImages } from "./display.mjs";
import { htmlPages, isRedirect, read } from "../lib/site.mjs";

const SMOKE_VIEWPORT = { width: 390, height: 844 };

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

export async function runBrowserRules(browser, origin) {
  const overflow = { id: 1, title: "אין גלישה אופקית", severity: "block", failures: [] };
  const smoke = { id: 2, title: "אין משאב שבור ואין שגיאות", severity: "block", failures: [] };
  const images = { id: 6, title: "תמונות לא מעוותות", severity: "block", failures: [] };
  const seenImg = new Set();
  const addImages = (file, vp, list) => {
    for (const m of list) {
      const key = file + m.split(" — ")[0];
      if (seenImg.has(key)) continue;
      seenImg.add(key);
      images.failures.push({ where: `${file} · ${vp.width}`, msg: m });
    }
  };
  const report = (file, vp, o) =>
    overflow.failures.push({
      where: `${file} · ${vp.width}×${vp.height}`,
      msg: `גולש ${o.extra}px · ${o.culprits.join(" · ") || "?"}`,
    });

  const pages = htmlPages().filter((f) => !isRedirect(read(f)));

    // עשן: כל העמודים, ברוחב טלפון. בדרך — גם גלישה ותמונות ברוחב הזה.
    // 4 עמודים במקביל; התוצאות נאספות לפי הסדר, כך שהדוח יציב.
    const smokeRuns = await pool(pages, 4, async (file) => {
      const { page, context, problems } = await openPage(browser, origin, file, SMOKE_VIEWPORT);
      await settle(page);
      const broken = await page.evaluate(() =>
        [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
      );
      for (const src of broken) problems.push(`תמונה שבורה ${decodeURIComponent(new URL(src).pathname)}`);
      const o = await page.evaluate(measureOverflow);
      const imgs = await page.evaluate(distortedImages);
      await context.close();
      return { file, problems, o, imgs };
    });
    for (const { file, problems, o, imgs } of smokeRuns) {
      for (const p of new Set(problems)) smoke.failures.push({ where: file, msg: p });
      if (o && !TEMPLATE_PAGES.includes(file)) report(file, SMOKE_VIEWPORT, o);
      addImages(file, SMOKE_VIEWPORT, imgs);
    }

    // גלישה ותמונות: עמודי התבנית בכל חמשת הגדלים.
    const jobs = TEMPLATE_PAGES.flatMap((file) => VIEWPORTS.map((vp) => ({ file, vp })));
    const runs = await pool(jobs, 4, async ({ file, vp }) => {
      const { page, context } = await openPage(browser, origin, file, vp);
      await settle(page);
      const o = await page.evaluate(measureOverflow);
      const imgs = await page.evaluate(distortedImages);
      await context.close();
      return { file, vp, o, imgs };
    });
    for (const { file, vp, o, imgs } of runs) {
      if (o) report(file, vp, o);
      addImages(file, vp, imgs);
    }

    overflow.checked = `${TEMPLATE_PAGES.length} תבניות × ${VIEWPORTS.length} גדלים + ${pages.length} עמודים ב-390`;
    smoke.checked = `${pages.length} עמודים`;
    images.checked = `${pages.length} עמודים ב-390 + ${TEMPLATE_PAGES.length} תבניות × ${VIEWPORTS.length} גדלים`;
    return [overflow, smoke, images];
}
