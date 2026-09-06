// הגדרות השאלון. DRY_RUN=true: לא שולחים ל-API — מדפיסים payload למסך ולקונסול.
export const CONFIG = {
  DRY_RUN: false,
  INBOUND_URL: "https://ganpereh-dashboard.vercel.app/api/leads/inbound",
  CALL_WINDOW_URL: "https://ganpereh-dashboard.vercel.app/api/leads/call-window",
  // המועדים הפנויים שהדשבורד מציע. ⚠️ ברבים — נתיב אחר לגמרי מזה שמעליו.
  CALL_SLOTS_URL: "https://ganpereh-dashboard.vercel.app/api/leads/call-windows",
  // מה השאלון כבר לא צריך לשאול על ליד שהגיע מקישור עם ?lid= — סוג,
  // גודל ומועד. קריאה בלבד, בלי שום פרט מזהה (ר' `api/leads/known`).
  LEAD_KNOWN_URL: "https://ganpereh-dashboard.vercel.app/api/leads/known",
  // תקרה לקריאה הזו. אם הדשבורד איטי או נופל — השאלון המלא נפתח כרגיל.
  // ⚠️ הקריאה חוסמת את המסך הראשון, ולכן הערך נמוך בכוונה: שאלון שנפתח
  // באיחור גרוע משאלון ששואל שאלה מיותרת אחת.
  LEAD_KNOWN_TIMEOUT_MS: 2000,
  UPLOAD_URL: "https://ganpereh-dashboard.vercel.app/api/leads/upload-url",
  WA_NUMBER: "972545525124",
  MAX_FILE_MB: 10,
  IMG_MAX_EDGE: 1600,
  IMG_QUALITY: 0.8,
  KONVA_URL: "https://unpkg.com/konva@9/konva.min.js",
  KONVA_TIMEOUT_MS: 8000,
  CAMPAIGN: "quiz-v2",
};
