// חוקים בדפדפן אמיתי.
//  חוק 1 · אין גלישה אופקית — נולד מ-honeypot ב-RTL שניפח את הדף ל-10,350px (19.8).
//  חוק 2 · אין משאב שבור ואין שגיאות — נולד מחבילת CSS ששברה 15 פונטים בלי שום
//          שינוי נראה בפריסה (8.2026).
//
// הרשת מבודדת — ר' lib/browser-kit.mjs.
import { TEMPLATE_PAGES, VIEWPORTS } from "../config.mjs";
import { openPage, settle } from "../lib/browser-kit.mjs";
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
  const report = (file, vp, o) =>
    overflow.failures.push({
      where: `${file} · ${vp.width}×${vp.height}`,
      msg: `גולש ${o.extra}px · ${o.culprits.join(" · ") || "?"}`,
    });

  const pages = htmlPages().filter((f) => !isRedirect(read(f)));

    // עשן: כל העמודים, ברוחב טלפון. בדרך — גם גלישה ברוחב הזה.
    for (const file of pages) {
      const { page, context, problems } = await openPage(browser, origin, file, SMOKE_VIEWPORT);
      await settle(page);
      const broken = await page.evaluate(() =>
        [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc),
      );
      for (const src of broken) problems.push(`תמונה שבורה ${decodeURIComponent(new URL(src).pathname)}`);
      for (const p of new Set(problems)) smoke.failures.push({ where: file, msg: p });
      const o = await page.evaluate(measureOverflow);
      if (o && !TEMPLATE_PAGES.includes(file)) report(file, SMOKE_VIEWPORT, o);
      await context.close();
    }

    // גלישה: עמודי התבנית בכל חמשת הגדלים.
    for (const file of TEMPLATE_PAGES)
      for (const vp of VIEWPORTS) {
        const { page, context } = await openPage(browser, origin, file, vp);
        await settle(page);
        const o = await page.evaluate(measureOverflow);
        if (o) report(file, vp, o);
        await context.close();
      }

    overflow.checked = `${TEMPLATE_PAGES.length} תבניות × ${VIEWPORTS.length} גדלים + ${pages.length} עמודים ב-390`;
    smoke.checked = `${pages.length} עמודים`;
    return [overflow, smoke];
}
