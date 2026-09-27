// חוק 9 · עובדות העסק — טלפון, וואטסאפ, שם, מזהים ישנים ומידע פרטי.
// נולד מ: #80 (החלפת מספר הוואטסאפ, 207 קישורים) · #75 (כתובת פרטית בפוטר)
// · פיקסל מטא ישן שחזר ל-13 עמודים בבנייה (19.8).
import { createHash } from "node:crypto";
import { ALLOWED_MOBILES, FORBIDDEN_HASHED, FORBIDDEN_TEXT, PHONE, WHATSAPP } from "../config.mjs";
import { lineOf, read, siteFiles } from "../lib/site.mjs";

const digits = (s) => s.replace(/\D/g, "");
const local = (n) => (n.startsWith("972") ? "0" + n.slice(3) : n);
const fmt = (n) => n.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");
const sha = (t) => createHash("sha256").update(t.normalize("NFC")).digest("hex");

export default {
  id: 9,
  title: "עובדות העסק",
  severity: "block",
  async run() {
    const files = siteFiles();
    const failures = [];
    const fail = (f, s, i, msg) => failures.push({ where: `${f}:${lineOf(s, i)}`, msg });
    const hashed = new Map(FORBIDDEN_HASHED.map((h) => [h.sha256, h.why]));

    for (const f of files) {
      const s = read(f);
      const page = f.split("/").pop();

      for (const m of s.matchAll(/href=["']tel:([^"']+)/g)) {
        // tel: הוא תמיד הטלפון העסקי — חוץ ממספר שהותר במפורש לעמוד הזה (רכז נגישות).
        const n = local(digits(m[1]));
        if (n !== PHONE && !ALLOWED_MOBILES[n]?.includes(page)) fail(f, s, m.index, `קישור טלפון ל-${m[1]} — צריך ${fmt(PHONE)}`);
      }

      for (const m of s.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)(\d+)/g))
        if (m[1] !== WHATSAPP) fail(f, s, m.index, `קישור וואטסאפ ל-${m[1]} — צריך ${WHATSAPP}`);

      for (const m of s.matchAll(/"telephone"\s*:\s*"([^"]+)"/g))
        if (local(digits(m[1])) !== PHONE) fail(f, s, m.index, `"telephone" בסכימה הוא ${m[1]} — צריך ${fmt(PHONE)}`);

      for (const m of s.matchAll(/(?<!\d)(?:\+?972|0)[-\s]?5\d(?:[-\s]?\d){7}(?!\d)/g)) {
        const n = local(digits(m[0]));
        const allowed = ALLOWED_MOBILES[n];
        if (allowed === undefined) fail(f, s, m.index, `מספר נייד לא מוכר ${fmt(n)}`);
        else if (allowed && !allowed.includes(page)) fail(f, s, m.index, `${fmt(n)} מותר רק ב-${allowed.join(", ")}`);
      }

      for (const { text, why } of FORBIDDEN_TEXT) {
        const i = s.indexOf(text);
        if (i >= 0) fail(f, s, i, `"${text}" — ${why}`);
      }

      for (const m of s.normalize("NFC").matchAll(/[\p{L}\p{N}]+/gu)) {
        const why = hashed.get(sha(m[0]));
        if (why) fail(f, s, m.index, why);
      }
    }
    return { checked: `${files.length} קבצים`, failures };
  },
};
