// חוקים שבודקים שהאתר *עובד*, לא רק נטען.
//  חוק 3 · כל כפתור מקבל את הלחיצה — נולד מפס לבן מעל התפריט שבלע קליקים (#74).
//  חוק 4 · האינטראקציות עובדות — נולד מאקורדיון FAQ שלא נפתח ב-14 עמודים חיים.
//  חוק 5 · טפסים מגיעים ליעד — נולד מ-honeypot בשם company שבלע לידים שלמים
//          והציג "נשלח" (2.9.2026).
//
// כל "עובד" נמדד במה שהגולש רואה (מיקום, גובה, שקיפות) ולא במחלקת CSS:
// מחלקה יכולה להתחלף בזמן שהתוכן נשאר מוסתר.
import { TEMPLATE_PAGES } from "../config.mjs";
import { guard, isShown, openPage } from "../lib/browser-kit.mjs";
import { read, siteFiles } from "../lib/site.mjs";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
const TEST_NAME = "בדיקה אוטומטית";
const TEST_PHONE = "0500000000"; // ה-placeholder של הטפסים — לעולם לא מספר אמיתי

// ── חוק 3 ──────────────────────────────────────────────────────────────
// לכל פקד גלוי: גוללים אליו, ובודקים שהנקודה שבמרכזו מחזירה אותו (או צאצא
// שלו). אם מחזירה משהו אחר — שכבה יושבת מעליו, והלחיצה הולכת לאיבוד.
function coveredControls() {
  const out = [];
  const name = (el) => {
    const sel = el.tagName.toLowerCase() + [...el.classList].slice(0, 2).map((c) => "." + c).join("");
    const t = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28);
    return t ? `${sel} «${t}»` : sel;
  };
  const shown = (el) => {
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) return false;
      if (a.getAttribute("aria-hidden") === "true" || a.inert) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], summary')) {
    if (!shown(el) || el.closest(".nav-mobile, .nav-dropdown, .gp-consent")) continue;
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    // קישור בתוך פסקה נשבר על פני כמה שורות, ומרכז ה"קופסה" שלו נופל בין
    // השורות — על הפסקה. בודקים את מרכז קטע השורה הרחב ביותר שלו.
    const r = [...el.getClientRects()].sort((a, b) => b.width * b.height - a.width * a.height)[0] || el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue; // בתוך מסגרת גלילה פנימית
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit === el || el.contains(hit) || hit.closest("label")?.control === el) continue;
    const key = name(el) + "|" + name(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${name(el)} מכוסה ע"י ${name(hit)}`);
  }
  return out;
}

// ── חוק 4 ──────────────────────────────────────────────────────────────
const waitShown = (page, sel, want) =>
  page
    .waitForFunction(([s, w, fn]) => new Function(`return (${fn})`)()(s) === w, [sel, want, isShown.toString()], { timeout: 2000 })
    .then(() => true)
    .catch(() => false);

async function mobileMenu(page) {
  if (!(await page.locator("#nav-hamburger").isVisible().catch(() => false))) return [];
  const bad = [];
  if (!(await waitShown(page, "#nav-mobile", false))) bad.push("תפריט המובייל גלוי לפני שנפתח");
  await page.click("#nav-hamburger");
  if (!(await waitShown(page, "#nav-mobile", true))) return [...bad, "לחיצה על ההמבורגר לא פותחת את התפריט"];
  const cat = page.locator(".nav-mobile-cat").first();
  if (await cat.count()) {
    await cat.click();
    const opened = await page
      .waitForFunction(() => (document.querySelector(".nav-mobile-links")?.getBoundingClientRect().height || 0) > 20, null, { timeout: 2000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) bad.push('"שירותים" בתפריט המובייל לא נפתח');
  }
  await page.click("#nav-hamburger");
  if (!(await waitShown(page, "#nav-mobile", false))) bad.push("לחיצה שנייה על ההמבורגר לא סוגרת את התפריט");
  return bad;
}

async function desktopMenu(page) {
  const btn = page.locator(".nav-item-btn").first();
  if (!(await btn.isVisible().catch(() => false))) return [];
  await btn.click();
  if (!(await waitShown(page, ".nav-dropdown", true))) return ['תפריט "שירותים" בדסקטופ לא נפתח בלחיצה'];
  await page.keyboard.press("Escape");
  return (await waitShown(page, ".nav-dropdown", false)) ? [] : ['תפריט "שירותים" לא נסגר ב-Escape'];
}

async function faq(page) {
  const q = page.locator(".faq-q").first();
  if (!(await q.count())) return [];
  const height = () => page.evaluate(() => document.querySelector(".faq-a")?.getBoundingClientRect().height || 0);
  await q.scrollIntoViewIfNeeded();
  const h0 = await height();
  await q.click();
  await page.waitForTimeout(500);
  const h1 = await height();
  if (Math.abs(h1 - h0) < 20) return ["לחיצה על שאלה ב-FAQ לא פותחת ולא סוגרת את התשובה"];
  await q.click();
  await page.waitForTimeout(500);
  return Math.abs((await height()) - h0) < 20 ? [] : ["לחיצה שנייה על שאלה ב-FAQ לא מחזירה את המצב"];
}

// ── חוק 5 ──────────────────────────────────────────────────────────────
function checkLead(sent, where) {
  const leads = sent.filter((s) => s.method === "POST" && s.path === "/api/leads/inbound");
  if (leads.length !== 1) return [`${where}: ${leads.length} פניות לדשבורד — צריכה להיות אחת`];
  const b = leads[0].body || {};
  const bad = [];
  if (b.name !== TEST_NAME) bad.push(`שם שהגיע: ${JSON.stringify(b.name)}`);
  if (b.phone !== TEST_PHONE) bad.push(`טלפון שהגיע: ${JSON.stringify(b.phone)}`);
  if (b.platform !== "website") bad.push(`platform: ${JSON.stringify(b.platform)}`);
  if (!b.externalId) bad.push("חסר externalId (מונע כרטיס כפול בלחיצה כפולה)");
  return bad.map((m) => `${where}: ${m}`);
}

async function landingForms(browser, origin) {
  const bad = [];
  for (const loc of ["hero", "end"]) {
    const where = `landing-misradim · טופס ${loc}`;
    const { page, context, sent, problems } = await openPage(browser, origin, "landing-misradim.html", PHONE);
    const form = page.locator(`form.lp-form[data-loc="${loc}"]`);
    await form.scrollIntoViewIfNeeded();
    await form.locator("button[type=submit]").click();
    await page.waitForTimeout(300);
    if (sent.length) bad.push(`${where}: טופס ריק נשלח`);
    if ((await form.locator('[name=name][aria-invalid="true"]').count()) === 0) bad.push(`${where}: טופס ריק לא מסמן שגיאה`);
    await form.locator("[name=name]").fill(TEST_NAME);
    await form.locator("[name=phone]").fill(TEST_PHONE);
    await form.locator("button[type=submit]").click();
    const done = await page.locator(".lp-form-done").first().waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
    if (!done) bad.push(`${where}: אחרי שליחה לא מופיע "קיבלנו, תודה"`);
    bad.push(...checkLead(sent, where));
    if (!sent.some((s) => s.host.startsWith("formspree"))) bad.push(`${where}: לא נשלח ל-Formspree (גיבוי המייל)`);
    for (const p of new Set(problems)) if (p.startsWith("🚨")) bad.push(`${where}: ${p}`);
    await context.close();
  }
  return bad;
}

async function homeForm(browser, origin) {
  const where = "index · טופס הבית";
  const { page, context, sent, problems } = await openPage(browser, origin, "index.html", PHONE);
  const form = page.locator("#lead-form");
  if (!(await form.count())) return [`${where}: הטופס לא נמצא`];
  await form.scrollIntoViewIfNeeded();
  await page.fill("#name", TEST_NAME);
  await page.fill("#phone", TEST_PHONE);
  await form.locator("button[type=submit], button:not([type])").last().click();
  const done = await page.waitForFunction(() => document.querySelector("#form-success")?.classList.contains("is-shown"), null, { timeout: 4000 }).then(() => true).catch(() => false);
  const bad = done ? [] : [`${where}: אחרי שליחה לא מופיעה הודעת ההצלחה`];
  bad.push(...checkLead(sent, where));
  for (const p of new Set(problems)) if (p.startsWith("🚨")) bad.push(`${where}: ${p}`);
  await context.close();
  return bad;
}

// השאלון: נוסעים מההתחלה ועד השליחה בכל אחד מששת המסלולים של המסך הראשון.
// בכל מסך — בחירה ראשונה ו"המשך". מסך שלא מתקדם = מסלול תקוע.
const QUIZ_BRANCHES = 6;
async function quizBranch(browser, origin, k) {
  const { page, context, sent, problems } = await openPage(browser, origin, "quiz/index.html", PHONE);
  const scr = page.locator("#screen");
  const title = () => page.locator("h1.q-title").first().textContent({ timeout: 3000 }).then((t) => t.trim()).catch(() => "?");
  const path = [];
  let result = null;
  let last = "";
  for (let i = 0; i < 30 && !result; i++) {
    const t = await title();
    if (t === last) {
      await page.waitForTimeout(600); // מעבר מונפש או טעינה
      if ((await title()) === last) {
        result = `נתקע במסך "${t}" (אחרי: ${path.slice(-2).join(" ← ")})`;
        break;
      }
    }
    last = t;
    path.push(t.slice(0, 24));
    if (await scr.locator("#q-phone").count()) {
      await page.fill("#q-name", TEST_NAME);
      await page.fill("#q-phone", TEST_PHONE);
      if (await scr.locator("#q-extra").count()) await page.fill("#q-extra", "בדיקה");
      await scr.locator(".btn-primary").last().click();
      await page.waitForTimeout(1500);
      const end = await title();
      if (/השתבש|שגיאה|לא עבר|נסו שוב/.test(end)) result = `אחרי השליחה: "${end}"`;
      else result = "ok";
      break;
    }
    const chip = scr.locator(".chip:visible").filter({ hasNotText: /משהו|אחר/ }).first();
    if (await chip.count()) await chip.click();
    const opts = scr.locator(".opt-card:visible");
    if (await opts.count()) await opts.nth(path.length === 2 ? k : 0).click();
    for (const inp of await scr.locator("input[type=text]:visible, textarea:visible").all()) if (!(await inp.inputValue())) await inp.fill("בדיקה");
    const next = scr.locator(".btn-primary:visible:enabled").first();
    if (await next.count()) await next.click().catch(() => {});
    else {
      // מסך רשות (העלאת תמונות) — הגולש מדלג
      const skip = scr.locator(".q-skip:visible, button:has-text('דלג'):visible").first();
      if (await skip.count()) await skip.click().catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  const where = `שאלון · מסלול ${k + 1} (${path[2] || "?"})`;
  const bad = [];
  if (!result) bad.push(`${where}: לא הגיע למסך יצירת קשר אחרי 30 מסכים`);
  else if (result !== "ok") bad.push(`${where}: ${result}`);
  else bad.push(...checkLead(sent, where));
  for (const p of new Set(problems)) if (p.startsWith("שגיאת JS") || p.startsWith("🚨")) bad.push(`${where}: ${p}`);
  await context.close();
  return bad;
}

// שדה בשם company נמלא אוטומטית בכרום — ככה בלע ה-honeypot לידים.
function noAutofillTraps() {
  const bad = [];
  for (const f of siteFiles(/\.(html|js)$/))
    if (/name=["']company["']|name:\s*["']company["']/.test(read(f))) bad.push(`${f}: שדה בשם company — כרום ממלא אותו אוטומטית`);
  return bad;
}

export async function runInteractionRules(browser, origin) {
  const clickable = { id: 3, title: "כל כפתור מקבל את הלחיצה", severity: "block", failures: [] };
  const interact = { id: 4, title: "האינטראקציות עובדות", severity: "block", failures: [] };
  const forms = { id: 5, title: "טפסים מגיעים ליעד", severity: "block", failures: [] };

  for (const file of TEMPLATE_PAGES.filter((f) => !f.startsWith("quiz/")))
    for (const vp of [PHONE, DESKTOP]) {
      const { page, context } = await openPage(browser, origin, file, vp);
      const where = `${file} · ${vp.width}`;
      for (const m of await page.evaluate(coveredControls)) clickable.failures.push({ where, msg: m });
      const checks = vp === PHONE ? [mobileMenu, faq] : [desktopMenu];
      for (const check of checks) {
        await page.evaluate(() => scrollTo(0, 0));
        for (const m of await guard(() => check(page))) interact.failures.push({ where, msg: m });
      }
      await context.close();
    }

  const formFailures = [
    ...noAutofillTraps(),
    ...(await guard(() => landingForms(browser, origin))).map((m) => (m.includes(":") ? m : `landing-misradim: ${m}`)),
    ...(await guard(() => homeForm(browser, origin))).map((m) => (m.includes(":") ? m : `index · טופס הבית: ${m}`)),
  ];
  for (let k = 0; k < QUIZ_BRANCHES; k++)
    formFailures.push(...(await guard(() => quizBranch(browser, origin, k))).map((m) => (m.includes(":") ? m : `שאלון · מסלול ${k + 1}: ${m}`)));
  forms.failures = formFailures.map((m) => ({ where: m.split(":")[0], msg: m.split(":").slice(1).join(":").trim() }));

  const n = TEMPLATE_PAGES.length - 1;
  clickable.checked = `${n} תבניות × 2 גדלים`;
  interact.checked = "תפריט מובייל · תפריט דסקטופ · FAQ";
  forms.checked = `2 טפסי נחיתה · טופס הבית · ${QUIZ_BRANCHES} מסלולי שאלון — בלי ליד אמיתי`;
  return [clickable, interact, forms];
}
