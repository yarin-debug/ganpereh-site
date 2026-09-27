// חוקים שמשווים את השינוי מול main, באותה ריצה ובאותה סביבה.
//  חוק 8  · לא נוספו מילים בודדות בשורה (חוסם) — הכרעת ירין 5.9.2026.
//  חוק 13 · נגישות (מתריע) — axe-core; מסומן מה חדש ומה קיים כבר ב-main.
//  חוק 14 · צילומי לפני/אחרי (לידיעה) — רק האזור שהשתנה, כדי שהבדיקה של ירין
//           תהיה "להסתכל על השינוי" ולא "לחפש אותו".
//  חוק 15 · משקל העמוד (מתריע) — נולד ממקצה הביצועים (#82, בית 75→96).
//           בכוונה לא Lighthouse: ציון מול שרת מקומי, בלי הדחיסה וה-CDN של
//           האתר החי, אינו מייצג ומשתנה בין ריצות. קילובייטים הם מספר מדויק.
//
// למה מול main ולא מול קובץ שמור: GitHub מצייר פונטים מעט אחרת מהמק (אותו
// אתר — 9 יתומים שם, 8 כאן), ולכן "מצב בסיס" שנשמר במחשב אחד שגוי באחר.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { TEMPLATE_PAGES } from "../config.mjs";
import { animationsDone, openPage, pool, settle } from "../lib/browser-kit.mjs";
import { startServer } from "../lib/server.mjs";
import { ROOT } from "../lib/site.mjs";
import { orphanLines } from "./display.mjs";

const PAGES = TEMPLATE_PAGES.filter((f) => !f.startsWith("quiz/"));
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];
const SHOT_WIDTHS = [390, 1280];
const OUT = path.join(ROOT, "checks/out/screens");
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

// צילום יציב ומלא: בלי אנימציות, בלי סמן מהבהב, בלי פריים משתנה של וידאו —
// ותוכן "חשיפה בגלילה" גלוי כולו. בלי זה חצי מהעמוד יוצא לבן בצילום, כי
// החשיפה תלויה בגלילה ולא בזמן.
const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
video{visibility:hidden!important}
.reveal,.reveal-stagger>*,.lp-grid-item{opacity:1!important;transform:none!important}`;

function checkoutMain() {
  const dir = mkdtempSync(path.join(tmpdir(), "shaar-main-"));
  const git = (...a) => String(execFileSync("git", a, { cwd: ROOT, stdio: "pipe" }));
  git("fetch", "-q", "--depth=1", "origin", "main");
  git("worktree", "add", "-q", "--detach", dir, "FETCH_HEAD");
  const changed = [...git("diff", "--name-only", "FETCH_HEAD").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean);
  return { dir, changed, remove: () => (git("worktree", "remove", "--force", dir), rmSync(dir, { recursive: true, force: true })) };
}

// עמוד אחד, גודל אחד: כל מה ששלושת החוקים צריכים — בטעינה אחת.
async function measure(browser, origin, file, vp, shotsDir) {
  const { page, context } = await openPage(browser, origin, file, vp);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await animationsDone(page);
  const r = { orphans: await page.evaluate(orphanLines) };
  if (vp.width === 390) {
    r.weight = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const res = performance.getEntriesByType("resource").filter((e) => e.name.startsWith(location.origin));
      return { bytes: (nav?.encodedBodySize || 0) + res.reduce((s, e) => s + (e.encodedBodySize || 0), 0), requests: res.length + 1 };
    });
    await page.addScriptTag({ content: AXE });
    r.axe = await page.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, resultTypes: ["violations"] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }));
    });
  }
  if (SHOT_WIDTHS.includes(vp.width)) {
    await page.addStyleTag({ content: FREEZE });
    await page.evaluate(() => scrollTo(0, 0));
    r.shot = path.join(shotsDir, `${file.replace(/\W+/g, "_")}-${vp.width}.png`);
    await page.screenshot({ path: r.shot, fullPage: true });
  }
  await context.close();
  return r;
}

async function measureAll(browser, origin, pages, shotsDir) {
  const jobs = pages.flatMap((file) => WIDTHS.map((vp) => ({ file, vp })));
  const res = await pool(jobs, 4, ({ file, vp }) => measure(browser, origin, file, vp, shotsDir));
  const by = new Map();
  jobs.forEach(({ file, vp }, i) => by.set(`${file}|${vp.width}`, res[i]));
  return by;
}

// ── חוק 14: השוואת פיקסלים, בדפדפן עצמו (canvas) — בלי תלות בספריית תמונות.
// מחזיר תמונה אחת: לפני מימין, אחרי משמאל (סדר קריאה בעברית), חתוכה לאזור
// שהשתנה, עם פס אדום לצד השורות שזזו.
async function diffImages(browser, beforePath, afterPath, width) {
  const page = await browser.newPage();
  const src = (p) => (p && existsSync(p) ? "data:image/png;base64," + readFileSync(p).toString("base64") : null);
  const cap = width > 800 ? 1100 : 1500;
  const scale = width > 800 ? 0.5 : 1;
  const out = await page.evaluate(
    async ([a, b, cap, scale]) => {
      const load = (s) => new Promise((ok, err) => Object.assign(new Image(), { onload: (e) => ok(e.target), onerror: err, src: s }));
      const pixels = (img) => {
        const c = new OffscreenCanvas(img.width, img.height).getContext("2d");
        c.drawImage(img, 0, 0);
        return c.getImageData(0, 0, img.width, img.height).data;
      };
      const B = await load(b);
      const A = a ? await load(a) : null;
      const W = B.width;
      const changed = new Set();
      let first = -1;
      let last = -1;
      if (A) {
        const pa = pixels(A);
        const pb = pixels(B);
        const H = Math.min(A.height, B.height);
        for (let y = 0; y < H; y++) {
          let n = 0;
          for (let x = 0; x < W && n < 3; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 60) n++;
          }
          if (n >= 3) {
            changed.add(y);
            if (first < 0) first = y;
            last = y;
          }
        }
        if (A.height !== B.height) {
          if (first < 0) first = H;
          last = Math.max(A.height, B.height) - 1;
        }
        if (first < 0) return null;
      } else {
        first = 0;
        last = B.height - 1;
      }
      // הקשר סביב השינוי: שוליים של 150px וגובה מינימלי, אחרת שינוי של שורה
      // אחת יוצא כפס דק שאי אפשר להבין מה הוא.
      const minH = scale < 1 ? 520 : 720;
      const top = Math.max(0, first - 150);
      const full = Math.max(A ? A.height : 0, B.height);
      const bottom = Math.min(full, Math.max(last + 150, top + minH), top + cap);
      const h = bottom - top;
      const head = 34;
      const gap = 20;
      const cols = A ? 2 : 1;
      const cv = new OffscreenCanvas(Math.round((W * cols + gap * (cols - 1)) * scale), Math.round((h + head) * scale));
      const ctx = cv.getContext("2d");
      ctx.scale(scale, scale);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W * cols + gap, h + head);
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "#222";
      ctx.direction = "rtl";
      const panel = (img, x, label) => {
        ctx.fillText(label, x + W - 12, 24);
        if (img) ctx.drawImage(img, 0, top, W, Math.min(h, img.height - top), x, head, W, Math.min(h, img.height - top));
        ctx.strokeStyle = "#bbb";
        ctx.strokeRect(x + 0.5, head + 0.5, W - 1, h - 1);
      };
      if (A) {
        panel(A, W + gap, "לפני");
        panel(B, 0, "אחרי");
        ctx.fillStyle = "#e5322d";
        for (const y of changed) if (y >= top && y < bottom) ctx.fillRect(W + gap / 2 - 3, head + y - top, 6, 1);
      } else panel(B, 0, "עמוד חדש");
      const blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.72 });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { jpeg: btoa(bin), first, truncated: last + 150 > bottom };
    },
    [src(beforePath), src(afterPath), cap, scale],
  );
  await page.close();
  return out;
}

const kb = (n) => `${Math.round(n / 1024)}KB`;

export async function runCompareRules(browser, origin) {
  const orphans = { id: 8, title: "לא נוספו מילים בודדות בשורה", severity: "block", failures: [] };
  const a11y = { id: 13, title: "נגישות (axe)", severity: "warn", failures: [] };
  const shots = { id: 14, title: "צילומי לפני/אחרי", severity: "info", failures: [] };
  const weight = { id: 15, title: "משקל העמוד", severity: "warn", failures: [] };
  const all = [orphans, a11y, shots, weight];

  let main;
  const tmp = mkdtempSync(path.join(tmpdir(), "shaar-shots-"));
  try {
    main = checkoutMain();
    // נמדד רק היכן שהשינוי יכול להשפיע: עמודים ששונו, וכל התבניות כששונה
    // משהו משותף (CSS, JS, פונטים, partials). SHAAR_ALL=1 מודד הכול.
    const shared =
      process.env.SHAAR_ALL === "1" || main.changed.some((f) => !/^(checks|app|docs)\//.test(f) && /(\.(css|js)$|^fonts\/|^partials\/)/.test(f));
    const changedPages = main.changed.filter((f) => /^[^/]+\.html$/.test(f) && existsSync(path.join(ROOT, f)));
    const pages = [...new Set([...(shared ? PAGES : []), ...changedPages])];
    if (!pages.length) {
      for (const r of all) r.checked = "השינוי לא נוגע בעמודים, ב-CSS או בפונטים — אין מה להשוות";
      return all;
    }

    mkdirSync(path.join(tmp, "head"));
    mkdirSync(path.join(tmp, "base"));
    const head = await measureAll(browser, origin, pages, path.join(tmp, "head"));
    const server = await startServer(main.dir);
    let base;
    try {
      base = await measureAll(browser, server.origin, pages.filter((f) => existsSync(path.join(main.dir, f))), path.join(tmp, "base"));
    } finally {
      server.close();
    }

    // 8 — יתומים חדשים
    let orphanTotal = 0;
    for (const [key, h] of head) {
      const [file, w] = key.split("|");
      const was = new Set(base.get(key)?.orphans || []);
      orphanTotal += h.orphans.length;
      for (const o of h.orphans) if (!was.has(o)) orphans.failures.push({ where: `${file} · ${w}`, msg: o });
    }

    // 13 — נגישות: הפרה חדשה (כלל + אלמנט שלא הופיעו ב-main) מדווחת; קיימות נספרות
    let existing = 0;
    for (const file of pages) {
      const h = head.get(`${file}|390`)?.axe || [];
      const b = new Set((base.get(`${file}|390`)?.axe || []).flatMap((v) => v.targets.map((t) => v.id + "|" + t)));
      for (const v of h) {
        const fresh = v.targets.filter((t) => !b.has(v.id + "|" + t));
        existing += v.targets.length - fresh.length;
        if (fresh.length) a11y.failures.push({ where: `${file} · 390`, msg: `${v.help} (${v.id}, ${v.impact}) — ${fresh.length} חדשים · \`${fresh[0]}\`` });
      }
    }

    // 14 — צילומים
    mkdirSync(OUT, { recursive: true });
    const same = [];
    for (const file of pages)
      for (const w of SHOT_WIDTHS) {
        const after = head.get(`${file}|${w}`)?.shot;
        const before = base.get(`${file}|${w}`)?.shot;
        const d = await diffImages(browser, before, after, w);
        if (!d) {
          same.push(`${file} · ${w}`);
          continue;
        }
        const name = `${file.replace(/\W+/g, "_")}-${w}.jpg`;
        writeFileSync(path.join(OUT, name), Buffer.from(d.jpeg, "base64"));
        shots.failures.push({
          where: `${file} · ${w}`,
          msg: before ? `השתנה החל מ-${d.first}px מראש העמוד${d.truncated ? " · השינוי נמשך מעבר לחיתוך" : ""}` : "עמוד חדש",
          img: `screens/${name}`,
        });
      }

    // 15 — משקל: מתריע על +15% וגם +100KB, או 5 בקשות נוספות
    for (const file of pages) {
      const h = head.get(`${file}|390`)?.weight;
      const b = base.get(`${file}|390`)?.weight;
      if (!h || !b) continue;
      const grew = h.bytes > b.bytes * 1.15 && h.bytes - b.bytes > 100 * 1024;
      if (grew || h.requests - b.requests >= 5)
        weight.failures.push({ where: file, msg: `${kb(b.bytes)} ← ${kb(h.bytes)} · ${b.requests} ← ${h.requests} בקשות` });
    }

    const n = `${pages.length} עמודים שהשינוי נוגע בהם`;
    orphans.checked = `${n} × ${WIDTHS.length} גדלים · ${orphanTotal} קיימות`;
    a11y.checked = `${n} · ${existing} הפרות קיימות גם ב-main`;
    shots.checked = `${n} × ${SHOT_WIDTHS.length} גדלים${same.length ? ` · ${same.length} בלי שום שינוי חזותי` : ""}`;
    weight.checked = n;
    return all;
  } catch (e) {
    orphans.failures.push({ where: "השער עצמו", msg: `לא הצליח להשוות מול main: ${e.message.split("\n")[0]}` });
    return all;
  } finally {
    main?.remove();
    rmSync(tmp, { recursive: true, force: true });
  }
}
