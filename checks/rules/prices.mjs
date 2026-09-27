// חוק 10 · אין מחירים בעמודים מסחריים (חוסם) · חוק 16 · מחירים במאמרים (מתריע).
// נולד מ: הכרעת ירין 30.8.2026 (הסרה מ-7 עמודים) · llms.txt שהמשיך לצטט
// "מרפסת מ-3,000 ₪" אחרי שהאתר תוקן (#72).
import { PRICE_ALLOWED_IN, PRICE_EXEMPT_PAGES } from "../config.mjs";
import { htmlPages, read, visibleText } from "../lib/site.mjs";

const PRICE = /(?<![\d,.])\d{1,3}(?:[,.]\d{3})*(?:\s*[-–]\s*\d{1,3}(?:[,.]\d{3})*)?\s*(?:₪|ש["״]ח|שקלים|שקל)|₪\s*\d[\d,]*/g;

function scan(files, allowedFor = () => []) {
  const failures = [];
  for (const f of files) {
    const raw = read(f);
    const text = f.endsWith(".html") ? visibleText(raw) : raw;
    for (const m of text.matchAll(PRICE)) {
      if (allowedFor(f).some((v) => m[0].includes(v))) continue;
      const ctx = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 10).trim();
      failures.push({ where: f, msg: `"…${ctx}…"` });
    }
  }
  return failures;
}

const isArticle = (f) => f.startsWith("blog-") && f !== "blog.html";

export const commercial = {
  id: 10,
  title: "אין מחירים בעמודים מסחריים",
  severity: "block",
  async run() {
    const files = htmlPages()
      .filter((f) => !isArticle(f) && !PRICE_EXEMPT_PAGES.includes(f))
      .concat(Object.keys(PRICE_ALLOWED_IN));
    return { checked: `${files.length} עמודים + llms`, failures: scan(files, (f) => PRICE_ALLOWED_IN[f] || []) };
  },
};

export const articles = {
  id: 16,
  title: "מחירים במאמרים",
  severity: "warn",
  async run() {
    const files = htmlPages().filter((f) => isArticle(f) && !PRICE_EXEMPT_PAGES.includes(f));
    return {
      checked: `${files.length} מאמרים · ההכרעה פתוחה אצל ירין`,
      failures: scan(files),
    };
  },
};
