// טעינת Konva עצלה מ-CDN עם timeout — כשל מפעיל את מסלול השאלות.
import { CONFIG } from "../config.js";

let promise = null;

export function loadKonva() {
  if (window.Konva) return Promise.resolve(window.Konva);
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("konva timeout")), CONFIG.KONVA_TIMEOUT_MS);
    const s = document.createElement("script");
    s.src = CONFIG.KONVA_URL;
    s.onload = () => {
      clearTimeout(timer);
      window.Konva ? resolve(window.Konva) : reject(new Error("konva missing"));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error("konva load failed"));
    };
    document.head.append(s);
  });
  promise.catch(() => {
    promise = null; // ניסיון חוזר אפשרי בביקור הבא
  });
  return promise;
}
