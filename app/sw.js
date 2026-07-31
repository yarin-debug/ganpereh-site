/* Service worker — התקנה למסך הבית ועבודה בלי קליטה.

   רשימת הקניות נפתחת בסופר, ושם הקליטה גרועה בדיוק כשצריך אותה.
   זו הסיבה שהקובץ הזה קיים; שיפור הביצועים הוא תופעת לוואי.

   ── כלל אחד חשוב לפריסה ──────────────────────────────────────────
   המטמון הוא אטומי לפי VERSION: או שכל השלד מהגרסה החדשה נכנס, או
   שכלום לא נכנס והגרסה הישנה ממשיכה לשרת. זה מה שמונע את "מטמון
   מעורב" — index.html חדש לצד js/app.js ישן — שהוא בדיוק התקלה
   שרשת הביטחון ב-index.html נכתבה בשבילה.

   המחיר: חייבים להעלות את VERSION בכל פריסה שמשנה קובץ בשלד.
   בלי זה המשתמשים ימשיכו לקבל את הגרסה הישנה מהמטמון.
   ──────────────────────────────────────────────────────────────── */

const VERSION = "v16";
const CACHE = `gp-meals-${VERSION}`;

/* השלד המלא. כל נתיב כאן חייב להיות בר-הבאה — כתובת שבורה אחת מפילה
   את ההתקנה כולה, וזו התנהגות רצויה: עדיף להישאר על הגרסה הקודמת. */
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/store.js",
  "js/data.js",
  "js/normalize.js",
  "js/plan.js",
  "js/compose.js",
  "js/pantry.js",
  "js/profiles.js",
  "js/history.js",
  "js/catalog.js",
  "js/suggest.js",
  "js/extras.js",
  "js/ui-overlay.js",
  "js/ui-suggest.js",
  "js/ui-extras.js",
  "js/ui-dish-editor.js",
  "js/ui-ingredient-editor.js",
  "js/ui-today.js",
  "js/ui-week.js",
  "js/ui-list.js",
  "js/ui-pantry.js",
  "js/ui-profiles.js",
  "js/ui-score.js",
  "js/ui-strip.js",
  "js/ui-sheet.js",
  "js/ui-onboarding.js",
  "js/ui-tour.js",
  "js/backup.js",
  "js/share.js",
  "js/images.js",
  "js/ui-backup.js",
  "js/sync/config.js",
  "js/sync/entities.js",
  "js/sync/auth.js",
  "js/sync/rest.js",
  "js/sync/sync.js",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "../fonts/TelAviv-BrutalistRegular.woff2",
  "../fonts/TelAviv-BrutalistBold.woff2",
  "../fonts/Alef_Regular.woff2",
  "../fonts/Alef-Bold.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // ההתקנה הושלמה רק אחרי שכל השלד במטמון, ולכן ההחלפה המיידית
      // בטוחה: אין רגע שבו הגרסה החדשה משרתת שלד חלקי.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // רק GET ורק מקור זהה. כל השאר עובר ישירות לרשת בלי שהעובד יתערב.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // ניווט: תמיד מגישים את המעטפת מהמטמון. כך פתיחת האפליקציה בסופר,
  // בלי קליטה, עולה — במקום להציג את שגיאת הדפדפן.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("index.html", { cacheName: CACHE }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { cacheName: CACHE }).then((cached) => cached || fetch(request)),
  );
});
