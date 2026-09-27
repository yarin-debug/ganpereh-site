// חוק 11 · תוצרי הבנייה מסונכרנים — אף עמוד שנוצר מסקריפט לא נערך ביד,
// ואף שינוי במקור (partials, CSS, build_*.py) לא נשכח בלי בנייה.
// נולד מ: פיקסל מטא שהוחלף ידנית ב-37 עמודים וחזר ל-13 מהם בבנייה הבאה (19.8).
//
// איך: מעתיקים את המאגר לתיקייה זמנית, מריצים שם את כל המחוללים, ומשווים.
// המאגר עצמו לא נוגע. sitemap.xml מוחרג — ה-lastmod שלו תלוי בהיסטוריית git.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ROOT } from "../lib/site.mjs";

const GENERATORS = [
  ["build.py", "--write"],
  ["build_assets.py", "--write"],
  ["build_service_projects.py", "--write"],
  ["build_projects.py"],
];
const LINKED = ["images", "node_modules", "videos"]; // נקראים בלבד — קישור, לא העתקה

const outputs = (dir) => readdirSync(dir).filter((f) => /\.html$|^bundle-.*\.min\.css$/.test(f));

export default {
  id: 11,
  title: "תוצרי הבנייה מסונכרנים",
  severity: "block",
  async run() {
    const tmp = mkdtempSync(path.join(tmpdir(), "shaar-build-"));
    try {
      for (const f of readdirSync(ROOT)) {
        const src = path.join(ROOT, f);
        if (LINKED.includes(f)) symlinkSync(src, path.join(tmp, f));
        else if (statSync(src).isFile() || f === "partials") cpSync(src, path.join(tmp, f), { recursive: true });
      }
      for (const [script, ...args] of GENERATORS)
        execFileSync("python3", [script, ...args], { cwd: tmp, stdio: "pipe" });

      const failures = [];
      for (const f of outputs(tmp)) {
        const before = path.join(ROOT, f);
        if (!existsSync(before)) failures.push({ where: f, msg: "המחולל יוצר עמוד שלא נמצא במאגר — לא הורץ או לא נוסף לקומיט" });
        else if (readFileSync(before, "utf8") !== readFileSync(path.join(tmp, f), "utf8"))
          failures.push({ where: f, msg: "לא תואם את מה שהמחוללים מייצרים — תיקון ידני שייִדרס, או מקור שהשתנה בלי בנייה" });
      }
      return {
        checked: `${GENERATORS.length} מחוללים · ${outputs(tmp).length} קבצים`,
        failures,
        fix: failures.length
          ? "אם התיקון ידני — להעביר אותו למקור (partials/ או build_*.py). ואז: `npm run build:all` וקומיט של התוצאה."
          : undefined,
      };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};
