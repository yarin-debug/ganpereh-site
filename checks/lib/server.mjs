// checks/lib/server.mjs — שרת סטטי שמגיש את המאגר כמו GitHub Pages:
// תיקייה ← index.html, כתובת בלי סיומת ← .html, לא נמצא ← 404.html בסטטוס 404.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./site.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".webmanifest": "application/manifest+json",
};

// כתובות אמיתיות שהאתר שולח אליהן לידים מוחלפות בזמן ההגשה בדומיין .invalid,
// שלעולם אינו מגיע לשום שרת. זו השכבה השנייה מעל יירוט הרשת בדפדפן: גם
// beacon ביציאה מהעמוד או יירוט שנכשל לא יכולים לייצר ליד אמיתי בדשבורד.
export const SANDBOX = {
  "ganpereh-dashboard.vercel.app": "dashboard.gate.invalid",
  "formspree.io": "formspree.gate.invalid",
};
const REWRITE = /\.(html|js|mjs)$/;
function sandbox(buf) {
  let t = buf.toString("utf8");
  for (const [real, fake] of Object.entries(SANDBOX)) t = t.split(real).join(fake);
  return t;
}

function resolve(urlPath, root) {
  const rel = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const abs = path.join(root, rel);
  if (!abs.startsWith(root)) return null;
  const candidates = [abs, path.join(abs, "index.html"), abs + ".html"];
  return candidates.find((p) => existsSync(p) && statSync(p).isFile()) || null;
}

// root: ברירת המחדל היא המאגר; חוק 8 מגיש גם עותק של main כדי להשוות מולו.
export function startServer(root = ROOT) {
  const server = createServer((req, res) => {
    const file = resolve(req.url, root);
    if (!file) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      return res.end(sandbox(readFileSync(path.join(root, "404.html"))));
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(REWRITE.test(file) ? sandbox(readFileSync(file)) : readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () => ok({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })),
  );
}
