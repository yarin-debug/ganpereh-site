// עטיפת אנליטיקס אחידה: GA4 + Meta Pixel (trackCustom) + dataLayer.
export function track(name, props = {}) {
  try {
    if (typeof gtag === "function") gtag("event", name, props);
    if (window.fbq) fbq("trackCustom", name, props);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...props });
  } catch (e) {
    /* אנליטיקס לעולם לא מפיל את השאלון */
  }
}
