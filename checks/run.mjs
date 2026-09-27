// checks/run.mjs — שער הבדיקות של האתר. מריץ את כל החוקים ומפיק דוח.
//
//   npm run check                 הכול
//   npm run check -- --fast       בלי דפדפן (חוקי הטקסט בלבד, שניות)
//   npm run check -- --only=9,12  רק החוקים האלה
//
// הדוח נכתב ל-checks/out/report.md (ה-workflow מפרסם אותו כתגובה ב-PR).
// קוד יציאה 1 כשחוק חוסם נכשל.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { WARN_UNTIL } from "./config.mjs";
import { startServer } from "./lib/server.mjs";
import { ROOT } from "./lib/site.mjs";
import buildSync from "./rules/build-sync.mjs";
import facts from "./rules/facts.mjs";
import { articles, commercial } from "./rules/prices.mjs";
import seo from "./rules/seo.mjs";

const args = process.argv.slice(2);
const fast = args.includes("--fast");
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",")
  .map(Number);
const wanted = (id) => !only || only.includes(id);

const MAX_LINES = 15; // לכל חוק בדוח — מעבר לזה זה רעש, והמספר המלא מופיע בכותרת

async function main() {
  const started = Date.now();
  const results = [];

  for (const rule of [facts, commercial, buildSync, seo, articles]) {
    if (!wanted(rule.id)) continue;
    try {
      results.push({ ...rule, ...(await rule.run()) });
    } catch (e) {
      results.push({
        ...rule,
        failures: [{ where: "השער עצמו", msg: `החוק קרס: ${e.message.split("\n")[0]}` }],
      });
    }
  }

  const browserRules = [1, 2, 3, 4, 5];
  if (!fast && browserRules.some(wanted)) {
    const server = await startServer();
    const { launch } = await import("./lib/browser-kit.mjs");
    const browser = await launch();
    try {
      if (wanted(1) || wanted(2)) {
        const { runBrowserRules } = await import("./rules/browser.mjs");
        results.push(...(await runBrowserRules(browser, server.origin)).filter((r) => wanted(r.id)));
      }
      if (wanted(3) || wanted(4) || wanted(5)) {
        const { runInteractionRules } = await import("./rules/interactions.mjs");
        results.push(...(await runInteractionRules(browser, server.origin)).filter((r) => wanted(r.id)));
      }
    } catch (e) {
      results.push({ id: 0, title: "חוקי הדפדפן", severity: "block", failures: [{ where: "השער עצמו", msg: `לא רץ: ${e.message.split("\n")[0]}` }] });
    } finally {
      await browser.close();
      server.close();
    }
  }

  results.sort((a, b) => a.id - b.id);
  const seconds = Math.round((Date.now() - started) / 1000);
  const md = render(results, seconds);
  mkdirSync(path.join(ROOT, "checks/out"), { recursive: true });
  writeFileSync(path.join(ROOT, "checks/out/report.md"), md);
  console.log(md);
  process.exit(results.some((r) => r.severity === "block" && r.failures.length) ? 1 : 0);
}

function render(results, seconds) {
  const failedBlock = results.filter((r) => r.severity === "block" && r.failures.length);
  const warned = results.filter((r) => r.severity === "warn" && r.failures.length);
  const head = failedBlock.length
    ? `❌ ${failedBlock.length} חוקים חוסמים נכשלו`
    : `✅ כל ${results.filter((r) => r.severity === "block").length} החוקים החוסמים עברו`;
  const icon = (r) => (!r.failures.length ? "✅" : r.severity === "block" ? "❌" : "🟡");

  const out = [
    "<!-- shaar-bdikot -->",
    `## שער בדיקות · ${head}${warned.length ? ` · ${warned.length} התרעות 🟡` : ""}`,
    "",
    `> **מצב התרעה עד ${WARN_UNTIL}** — השער מדווח ולא חוסם מיזוג. אחרי התאריך, ❌ יחסום.`,
    "",
    "| | חוק | מה נבדק | תוצאה |",
    "|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${icon(r)} | ${r.id} · ${r.title} | ${r.checked || "—"} | ${r.failures.length ? `${r.failures.length} ממצאים` : "תקין"} |`,
    ),
  ];

  for (const r of results.filter((r) => r.failures.length)) {
    out.push("", `### ${icon(r)} ${r.id} · ${r.title}`, "");
    for (const f of r.failures.slice(0, MAX_LINES)) out.push(`- \`${f.where}\` — ${f.msg}`);
    if (r.failures.length > MAX_LINES) out.push(`- …ועוד ${r.failures.length - MAX_LINES}`);
    if (r.fix) out.push("", `**תיקון:** ${r.fix}`);
  }

  out.push(
    "",
    `<sub>${seconds} שניות · כל חוק נולד מתקלה אמיתית — הרקע ב-\`docs/תוכנית-שער-בדיקות.md\`</sub>`,
  );
  return out.join("\n");
}

main();
