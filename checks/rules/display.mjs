// חוקי תצוגה.
//  חוק 6 · תמונות לא מעוותות (רץ בלולאות של browser.mjs) — נולד מ-66 תמונות שנמתחו פי 3.2 בגלריות הפרויקטים,
//          כי נוספה תכונת height בלי height:auto ב-CSS (30.8.2026).
//  חוק 7 · תוכן גלוי בלי JS — נולד מחשיפה-בגלילה שהסתירה עמודי שירות שלמים
//          ואת ארכיון הפרויקטים כשה-JS לא רץ (18.8.2026).
//  חוק 8 רץ ב-compare.mjs; orphanLines שמוגדרת כאן משמשת אותו.
import { TEMPLATE_PAGES } from "../config.mjs";
import { animationsDone, openPage, pool, settle } from "../lib/browser-kit.mjs";

const PHONE = { width: 390, height: 844 };
const PAGES = TEMPLATE_PAGES.filter((f) => !f.startsWith("quiz/")); // השאלון הוא אפליקציית JS מעצם הגדרתו

// ── חוק 6 ──────────────────────────────────────────────────────────────
// מושווה יחס תיבת התוכן על המסך ליחס הקובץ. object-fit: cover חותך ו-contain
// ממסגר — אף אחד מהם לא מעוות, ולכן הם מחוץ לבדיקה.
export function distortedImages() {
  const out = [];
  for (const img of document.images) {
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) continue;
    if (/\.svg($|\?)/i.test(img.currentSrc)) continue;
    const cs = getComputedStyle(img);
    if (["cover", "contain", "scale-down"].includes(cs.objectFit)) continue;
    const r = img.getBoundingClientRect();
    const px = (p) => parseFloat(cs[p]) || 0;
    const w = r.width - px("paddingLeft") - px("paddingRight") - px("borderLeftWidth") - px("borderRightWidth");
    const h = r.height - px("paddingTop") - px("paddingBottom") - px("borderTopWidth") - px("borderBottomWidth");
    if (w < 24 || h < 24) continue;
    const natural = img.naturalWidth / img.naturalHeight;
    const shown = w / h;
    if (Math.abs(shown / natural - 1) > 0.03 && Math.abs(w - h * natural) > 2)
      out.push(`${decodeURIComponent(new URL(img.currentSrc).pathname)} — מוצג ${shown.toFixed(2)} מול ${natural.toFixed(2)} (×${(natural / shown).toFixed(2)})`);
  }
  return out;
}

// ── חוק 7 ──────────────────────────────────────────────────────────────
// אלמנטי תוכן שבלתי נראים (שקיפות או visibility). משווים בין שני מצבים: מה
// שמוסתר גם כשה-JS רץ הוא מוסתר בכוונה (תשובת FAQ, הודעת הצלחה); מה שמוסתר
// *רק* בלי JS — זה התוכן שנעלם לגולש.
export function invisibleContent() {
  const hidden = (el) => {
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (parseFloat(cs.opacity) < 0.05 || cs.visibility === "hidden") return true;
    }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll("h1, h2, h3, p, li, img, blockquote")) {
    if (el.closest("nav, .nav-mobile, .nav-dropdown, .gp-consent, [hidden], noscript, template, dialog")) continue;
    const text = el.tagName === "IMG" ? "img " + (el.getAttribute("src") || "") : (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3) continue;
    if (hidden(el)) out.push(`${el.tagName.toLowerCase()} «${text.slice(0, 40)}»`);
  }
  return out;
}

async function hiddenSet(browser, origin, file, opts) {
  const { page, context } = await openPage(browser, origin, file, PHONE, opts);
  if (opts.js !== false) await settle(page);
  await animationsDone(page);
  const list = await page.evaluate(invisibleContent);
  await context.close();
  return new Set(list);
}

// ── חוק 8 ──────────────────────────────────────────────────────────────
// שורה אחרונה שיש בה מילה אחת: המילה האחרונה יושבת בשורה נמוכה מזו של המילה
// שלפניה. נבדקים בלוקי טקסט בלבד (בלי ילדים שהם בלוק), כולל כפתורים וקישורים
// שאינם inline.
export function orphanLines() {
  const out = [];
  const range = document.createRange();
  const lastRect = (node, s, e) => {
    range.setStart(node, s);
    range.setEnd(node, e);
    const rs = range.getClientRects();
    return rs[rs.length - 1];
  };
  for (const el of document.querySelectorAll("h1, h2, h3, h4, p, li, figcaption, blockquote, dt, dd, a, button, label, summary")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.visibility === "hidden") continue;
    if (el.closest(".nav-mobile, .nav-dropdown, [hidden], [aria-hidden='true']")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if ([...el.querySelectorAll("*")].some((c) => !["inline", "none", "contents"].includes(getComputedStyle(c).display) && c.tagName !== "BR")) continue;
    const words = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); )
      for (const m of n.data.matchAll(/\S+/g)) if (/[\p{L}\p{N}]/u.test(m[0])) words.push([n, m.index, m.index + m[0].length]);
    if (words.length < 2) continue;
    const last = lastRect(...words.at(-1));
    const prev = lastRect(...words.at(-2));
    if (!last || !prev) continue;
    if (last.top > prev.top + prev.height * 0.5) {
      const text = el.textContent.replace(/\s+/g, " ").trim();
      out.push(`${el.tagName.toLowerCase()} «…${text.slice(-45)}»`);
    }
  }
  return out;
}

export async function runDisplayRules(browser, origin) {
  const noJs = { id: 7, title: "תוכן גלוי בלי JS", severity: "block", failures: [] };

  const modes = [
    ["JS כבוי", { js: false }],
    ["בלי IntersectionObserver", { initScript: "delete window.IntersectionObserver" }],
  ];
  const gone = await pool(PAGES, 3, async (file) => {
    const normal = await hiddenSet(browser, origin, file, {});
    const out = [];
    for (const [mode, opts] of modes) {
      const lost = [...(await hiddenSet(browser, origin, file, opts))].filter((k) => !normal.has(k));
      if (lost.length) out.push({ where: `${file} · ${mode}`, msg: `${lost.length} אלמנטים נעלמים — ${lost.slice(0, 3).join(" · ")}` });
    }
    return out;
  });
  noJs.failures.push(...gone.flat());

  noJs.checked = `${PAGES.length} תבניות × (JS כבוי · בלי IntersectionObserver)`;
  return [noJs];
}
