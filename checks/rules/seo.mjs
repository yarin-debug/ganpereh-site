// חוק 12 · SEO בסיס — כותרת ראשית אחת, title ו-description, canonical,
// כל עמוד ב-sitemap, ואפס קישורים פנימיים שבורים.
// נולד מ: #81 (היררכיית כותרות ב-8 עמודי שירות) · 5 עמודי פרויקטים שחסרו
// ב-sitemap לגמרי (5a3d336).
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { htmlPages, isNoindex, isRedirect, read, ROOT } from "../lib/site.mjs";

const SITE = "https://ganpereh.co.il/";

// כתובת ← מפתח אחיד: בלי דומיין, בלי .html, index = "".
const key = (u) =>
  u.replace(SITE, "").replace(/^\//, "").split(/[?#]/)[0].replace(/\.html$/, "").replace(/(^|\/)index$/, "$1");

// קובץ מקומי שכתובת פנימית מצביעה עליו (כמו שהשרת של Pages פותר אותה).
function exists(fromPage, href) {
  const clean = decodeURIComponent(href.split(/[?#]/)[0]);
  if (!clean) return true;
  const abs = clean.startsWith("/") ? path.join(ROOT, clean) : path.join(ROOT, path.dirname(fromPage), clean);
  return [abs, abs + ".html", path.join(abs, "index.html")].some((p) => existsSync(p) && statSync(p).isFile());
}

export default {
  id: 12,
  title: "SEO בסיס",
  severity: "block",
  async run() {
    const failures = [];
    const sitemap = read("sitemap.xml");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const inSitemap = new Set(locs.map(key));
    let indexable = 0;
    let links = 0;

    for (const f of htmlPages()) {
      const s = read(f);
      if (isRedirect(s)) continue;

      // קישורים שבורים — בכל עמוד, גם בעמודי noindex.
      // קישורים שנבנים בתוך <script> (template literals) אינם קישורים ב-HTML.
      const markup = s.replace(/<script[\s\S]*?<\/script>/gi, "");
      for (const m of markup.matchAll(/href="([^"]+)"/g)) {
        let href = m[1];
        if (href.startsWith(SITE)) href = "/" + href.slice(SITE.length);
        if (/^([a-z]+:|#|\/\/)/i.test(href)) continue;
        links++;
        if (!exists(f, href)) failures.push({ where: f, msg: `קישור שבור: ${m[1]}` });
      }

      if (isNoindex(s) || f === "404.html") continue;
      indexable++;
      const h1 = (s.match(/<h1\b/g) || []).length;
      if (h1 !== 1) failures.push({ where: f, msg: `${h1} כותרות h1 — צריכה להיות אחת` });
      if (!/<title>[^<\s][^<]*<\/title>/.test(s)) failures.push({ where: f, msg: "חסר <title>" });
      if (!/<meta[^>]+name="description"[^>]+content="[^"\s]/.test(s)) failures.push({ where: f, msg: "חסר meta description" });
      const canon = s.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
      if (!canon) failures.push({ where: f, msg: "חסר canonical" });
      else if (!inSitemap.has(key(canon[1]))) failures.push({ where: f, msg: `לא מופיע ב-sitemap.xml (${canon[1]})` });
    }

    for (const loc of locs) if (!exists("", "/" + key(loc))) failures.push({ where: "sitemap.xml", msg: `מצביע על עמוד שלא קיים: ${loc}` });

    return { checked: `${indexable} עמודים לאינדוקס · ${links} קישורים פנימיים · ${locs.length} כתובות ב-sitemap`, failures };
  },
};
