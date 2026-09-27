// checks/lib/site.mjs — אילו קבצים הם "האתר", וכלי קריאה משותפים לחוקים.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// מחוץ לתחום: מתכנן הארוחות (בדיקות משלו), מסמכים פנימיים, והשער עצמו.
const OUT_OF_SCOPE = ["app/", "docs/", "checks/", "node_modules/"];

// מה שנמצא במאגר או ייכנס אליו (קבצים חדשים שלא הוחרגו ב-.gitignore) —
// בדיוק מה ש-GitHub Pages יגיש.
export function siteFiles(exts = /\.(html|js|txt|xml|json)$/) {
  const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
  const all = git("ls-files", "-z").split("\0").concat(git("ls-files", "-z", "--others", "--exclude-standard").split("\0"));
  return [...new Set(all)].filter((f) => f && exts.test(f) && !OUT_OF_SCOPE.some((p) => f.startsWith(p))).sort();
}

// עמודי HTML: כל העמודים בשורש + השאלון.
export function htmlPages() {
  return siteFiles(/\.html$/).filter((f) => !f.includes("/") || f === "quiz/index.html");
}

export const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

export const isNoindex = (html) => /<meta[^>]+name="robots"[^>]+noindex/i.test(html);
export const isRedirect = (html) => /http-equiv="refresh"/i.test(html);

// הטקסט שהגולש רואה: בלי הערות, סגנונות וסקריפטים (חוץ מ-JSON-LD, שגוגל
// ומודלי AI קוראים כתוכן), בלי תגיות.
export function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#8362;/g, "₪")
    .replace(/\s+/g, " ");
}

// מספר השורה של אינדקס בטקסט — כדי שהדוח יצביע למקום מדויק.
export const lineOf = (s, i) => s.slice(0, i).split("\n").length;
