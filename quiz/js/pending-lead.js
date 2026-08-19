/* מצב השליחה של הליד, משותף בין שער הפרטים למסך התוצאה.
   מסך התוצאה לא צריך את השרת — computeBand רץ מקומית — ולכן ההמתנה
   לתשובה הייתה המתנה על לא כלום בדיוק ברגע השיא. עכשיו התוצאה מוצגת
   מיד והשליחה נמשכת ברקע; מה שנשאר לתאם הוא הכשל, ורק אותו. */

let promise = null;
let outcome = null; // null = בדרך · true = נשלח · false = נכשל
const listeners = new Set();

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
  listeners.forEach((fn) => fn(ok));
  listeners.clear();
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
  listeners.clear();
}
