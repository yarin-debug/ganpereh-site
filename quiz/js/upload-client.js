// העלאות: דחיסה בצד לקוח → signed URL → PUT ישיר ל-Supabase Storage.
// רצות ברקע; submit ממתין להן אבל כשל לא חוסם ליד.
import { CONFIG } from "./config.js";
import { state, save } from "./state.js";
import { track } from "./analytics.js";

const inflight = new Map(); // id → Promise

export function waitForPending() {
  return Promise.allSettled([...inflight.values()]);
}

let idSeq = 0;
const newId = () => "u" + Date.now().toString(36) + idSeq++;

// דחיסת תמונה: צלע ארוכה ≤1600, JPEG q0.8. פותר גם HEIC (הדפדפן מפענח, אנחנו מקודדים JPEG).
async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, CONFIG.IMG_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", CONFIG.IMG_QUALITY));
    if (!blob) throw new Error("encode");
    const preview =
      canvas.width > 480 ? await makePreview(img) : canvas.toDataURL("image/jpeg", 0.6);
    return { blob, contentType: "image/jpeg", ext: "jpg", preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makePreview(img) {
  const canvas = document.createElement("canvas");
  const scale = 480 / Math.max(img.naturalWidth, img.naturalHeight);
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

async function uploadBlob(blob, contentType, fileName) {
  if (CONFIG.DRY_RUN) {
    await new Promise((r) => setTimeout(r, 500));
    return (
      "https://example.supabase.co/storage/v1/object/public/lead-media/quiz/dry-run/" + fileName
    );
  }
  const res = await fetch(CONFIG.UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, contentType, sizeBytes: blob.size }),
  });
  if (!res.ok) throw new Error("upload-url " + res.status);
  const { signedUrl, publicUrl } = await res.json();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const put = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    }).catch(() => null);
    if (put && put.ok) return publicUrl;
    await new Promise((r) => setTimeout(r, 700));
  }
  throw new Error("put failed");
}

// blob מוכן (למשל snapshot מהדיזיינר) → מעלה ומחזיר URL ציבורי (או זורק).
export async function uploadReadyBlob(blob, fileName, contentType = "image/png") {
  return uploadBlob(blob, contentType, fileName);
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// קבצים מהמשתמש → רשומות ב-state.uploads + העלאת רקע. onUpdate נקרא בכל שינוי.
export function addFiles(files, onUpdate, maxFiles = 8) {
  const current = state.uploads.filter((u) => u.status !== "failed").length;
  const room = Math.max(0, maxFiles - current);
  const list = [...files].slice(0, room);
  const rejected = [];

  for (const file of list) {
    if (file.size > CONFIG.MAX_FILE_MB * 1024 * 1024) {
      rejected.push(file.name + " (גדול מ-10MB)");
      continue;
    }
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      rejected.push(file.name);
      continue;
    }
    const entry = {
      id: newId(),
      name: file.name,
      kind: isPdf ? "pdf" : "image",
      status: "pending",
      url: null,
      previewUrl: null,
    };
    state.uploads.push(entry);
    save();

    const job = (async () => {
      try {
        let blob = file;
        let contentType = file.type;
        let ext = isPdf ? "pdf" : "jpg";
        if (isImage) {
          try {
            const c = await compressImage(file);
            blob = c.blob;
            contentType = c.contentType;
            ext = c.ext;
            entry.previewUrl = c.preview;
            onUpdate && onUpdate(entry);
          } catch (e) {
            // פענוח נכשל (פורמט חריג) — מעלים מקור רק אם ה-MIME מותר בשרת
            if (!ALLOWED.includes(file.type)) throw new Error("format");
          }
        }
        entry.url = await uploadBlob(blob, contentType, "photo." + ext);
        entry.status = "done";
      } catch (e) {
        entry.status = "failed";
        track("quiz_error", { stage: "upload", code: String(e && e.message) });
      }
      save();
      onUpdate && onUpdate(entry);
    })();
    inflight.set(entry.id, job);
    job.finally(() => inflight.delete(entry.id));
  }
  return { added: list.length, rejected };
}

export function removeUpload(id) {
  const i = state.uploads.findIndex((u) => u.id === id);
  if (i >= 0) state.uploads.splice(i, 1);
  inflight.delete(id);
  save();
}
