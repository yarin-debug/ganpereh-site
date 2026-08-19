/* מצב השליחה של הליד, משותף בין שער הפרטים למסך התוצאה.
   מסך התוצאה לא צריך את השרת — computeBand רץ מקומית — ולכן ההמתנה
   לתשובה הייתה המתנה על לא כלום בדיוק ברגע השיא. עכשיו התוצאה מוצגת
   מיד והשליחה נמשכת ברקע; מה שנשאר לתאם הוא הכשל, ורק אותו. */

let promise = null;
let outcome = null; // null = בדרך · true = נשלח · false = נכשל
const listeners = new Set();
let beacon = null;
let beaconArmed = false;

export function beginSend(p) {
  promise = p;
  outcome = null;
  p.then(
    (res) => settle(!!(res && res.ok)),
    () => settle(false),
  );
  return p;
}

function settle(ok) {
  outcome = ok;
  if (ok) beacon = null;
  listeners.forEach((fn) => fn(ok));
  listeners.clear();
}

/* רשת ביטחון לרגע שנפתח עם הרינדור האופטימי: המשתמש רואה את הפרופיל
   מיד, ולכן הוא יכול לסגור את הלשונית בזמן שהשליחה עוד באוויר. בעזיבה
   נשלח beacon — בקשה שהדפדפן מתחייב לשלוח גם אחרי שהדף מת.
   שני תנאים שהופכים את זה לבטוח: `text/plain` הוא Content-Type
   מסוג simple ולכן אין preflight (ל-beacon אין דרך לעבור אחד),
   והשרת קורא `req.text()` ומפרסר בעצמו; והקליטה מדדפת לפי
   `external_id`, כך שגם אם ה-fetch המקורי כן הצליח לא ייווצר ליד כפול. */
export function armBeacon(url, payload) {
  beacon = { url, payload };
  if (beaconArmed) return;
  beaconArmed = true;
  addEventListener("pagehide", flushBeacon);
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });
}

function flushBeacon() {
  if (!beacon || outcome !== null || !navigator.sendBeacon) return;
  const body = new Blob([JSON.stringify(beacon.payload)], { type: "text/plain" });
  if (navigator.sendBeacon(beacon.url, body)) beacon = null;
}

export function isSending() {
  return !!promise && outcome === null;
}

/** נקרא מיד עם התוצאה אם היא כבר ידועה, אחרת כשהיא תיוודע. */
export function onSettled(fn) {
  if (outcome !== null) fn(outcome);
  else if (promise) listeners.add(fn);
}

export function reset() {
  promise = null;
  outcome = null;
  beacon = null;
  listeners.clear();
}
