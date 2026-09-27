// חוקי תצוגה.
//  חוק 6 · תמונות לא מעוותות (רץ בלולאות של browser.mjs) — נולד מ-66 תמונות שנמתחו פי 3.2 בגלריות הפרויקטים,
//          כי נוספה תכונת height בלי height:auto ב-CSS (30.8.2026).
//  חוק 7 · תוכן גלוי בלי JS — נולד מחשיפה-בגלילה שהסתירה עמודי שירות שלמים
//          ואת ארכיון הפרויקטים כשה-JS לא רץ (18.8.2026).
//  חוק 8 · לא נוספו מילים בודדות בשורה אחרונה — הכרעת ירין 5.9.2026.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TEMPLATE_PAGES, VIEWPORTS } from "../config.mjs";
import { animationsDone, openPage, pool, settle } from "../lib/browser-kit.mjs";
import { startServer } from "../lib/server.mjs";
import { ROOT } from "../lib/site.mjs";

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

const ORPHAN_WIDTHS = VIEWPORTS.filter((v) => [390, 768, 1280].includes(v.width));

async function orphansOf(browser, origin, pages) {
  const jobs = pages.flatMap((file) => ORPHAN_WIDTHS.map((vp) => ({ file, vp })));
  const found = new Map(); // key → { file, vp, o }
  const lists = await pool(jobs, 4, async ({ file, vp }) => {
    const { page, context } = await openPage(browser, origin, file, vp);
    await page.evaluate(() => document.fonts.ready);
    await animationsDone(page);
    const list = await page.evaluate(orphanLines);
    await context.close();
    return list;
  });
  jobs.forEach(({ file, vp }, i) => {
    for (const o of lists[i]) found.set(`${file}|${vp.width}|${o}`, { file, vp, o });
  });
  return found;
}

// עותק של origin/main בתיקייה זמנית — כדי להשוות באותה סביבה ובאותה ריצה.
// קובץ "מצב בסיס" שמור היה נכשל: GitHub מצייר פונטים מעט אחרת מהמק.
function checkoutMain() {
  const dir = mkdtempSync(path.join(tmpdir(), "shaar-main-"));
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, stdio: "pipe" });
  git("fetch", "-q", "--depth=1", "origin", "main");
  git("worktree", "add", "-q", "--detach", dir, "FETCH_HEAD");
  const changed = [
    ...String(git("diff", "--name-only", "FETCH_HEAD")).split("\n"),
    ...String(git("ls-files", "--others", "--exclude-standard")).split("\n"),
  ].filter(Boolean);
  return { dir, changed, remove: () => (git("worktree", "remove", "--force", dir), rmSync(dir, { recursive: true, force: true })) };
}

export async function runDisplayRules(browser, origin) {
  const noJs = { id: 7, title: "תוכן גלוי בלי JS", severity: "block", failures: [] };
  const orphans = { id: 8, title: "לא נוספו מילים בודדות בשורה", severity: "block", failures: [] };

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

  // חוק 8 נמדד רק היכן שהשינוי יכול להזיז שורות: עמודים ששונו, וכל התבניות
  // כששונה משהו משותף (CSS, JS, פונטים, partials). בלי שינוי כזה — אין מה למדוד.
  let main;
  let pages = [];
  try {
    main = checkoutMain();
    const shared = main.changed.some((f) => !/^(checks|app|docs)\//.test(f) && /(\.(css|js)$|^fonts\/|^partials\/)/.test(f));
    const changedPages = main.changed.filter((f) => /^[^/]+\.html$/.test(f) && existsSync(path.join(ROOT, f)));
    pages = [...new Set([...(shared ? PAGES : []), ...changedPages])];
    if (pages.length) {
      const head = await orphansOf(browser, origin, pages);
      const server = await startServer(main.dir);
      let base;
      try {
        base = await orphansOf(browser, server.origin, pages.filter((f) => existsSync(path.join(main.dir, f))));
      } finally {
        server.close();
      }
      for (const [key, { file, vp, o }] of head) if (!base.has(key)) orphans.failures.push({ where: `${file} · ${vp.width}`, msg: o });
      orphans.checked = `${pages.length} עמודים שהשינוי נוגע בהם × ${ORPHAN_WIDTHS.length} גדלים · ${head.size} קיימות, ${base.size} ב-main`;
    } else orphans.checked = "השינוי לא נוגע בטקסט, ב-CSS או בפונטים — אין מה למדוד";
  } catch (e) {
    orphans.failures.push({ where: "השער עצמו", msg: `לא הצליח להשוות מול main: ${e.message.split("\n")[0]}` });
  } finally {
    main?.remove();
  }

  noJs.checked = `${PAGES.length} תבניות × (JS כבוי · בלי IntersectionObserver)`;
  return [noJs, orphans];
}
