// הגדרות השאלון. DRY_RUN=true: לא שולחים ל-API — מדפיסים payload למסך ולקונסול.
export const CONFIG = {
  DRY_RUN: true,
  INBOUND_URL: "https://ganpereh-dashboard.vercel.app/api/leads/inbound",
  UPLOAD_URL: "https://ganpereh-dashboard.vercel.app/api/leads/upload-url",
  WA_NUMBER: "972545525124",
  MAX_FILE_MB: 10,
  IMG_MAX_EDGE: 1600,
  IMG_QUALITY: 0.8,
  KONVA_URL: "https://unpkg.com/konva@9/konva.min.js",
  KONVA_TIMEOUT_MS: 8000,
  CAMPAIGN: "quiz-v2",
};
