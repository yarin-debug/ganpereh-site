// מנוע רמות ההשקעה. כל המספרים כאן — כיול = עריכת האובייקט הזה בלבד.
// הבסיס מסונכרן עם valueConfig בדשבורד (lead-score.ts) — שינוי שם מחייב עדכון גם כאן.

export const BAND_CONFIG = {
  // ₪ לפני מע"מ: estimate = clamp(base + sqm×perSqm, min, max) + תוספות scope רצוי
  value: {
    balcony: { base: 8000, perSqm: 900, min: 12000, max: 80000 },
    roof_garden: { base: 12000, perSqm: 1100, min: 20000, max: 160000 },
    ground_garden: { base: 10000, perSqm: 700, min: 15000, max: 220000 },
    penthouse: { base: 15000, perSqm: 1200, min: 30000, max: 220000 },
    villa: { base: 20000, perSqm: 800, min: 35000, max: 320000 },
    office: { base: 10000, perSqm: 700, min: 12000, max: 130000 },
    business: { base: 10000, perSqm: 700, min: 12000, max: 130000 },
    other: { base: 10000, perSqm: 800, min: 12000, max: 150000 },
  },
  // תוספת ₪ לכל פריט scope רצוי (חד-פעמית, לא לפי כמות)
  additions: {
    pergola: 8000,
    deck: 7000,
    water: 5000,
    outdoor_kitchen: 10000, // ממופה ל-scope "other" עם הערת מטבח חוץ
    trees: 4000,
    paving: 5000,
    lawn: 3000,
    shading: 4000,
    lighting: 2500,
    furniture: 3000,
    irrigation: 2000,
  },
  bands: [
    {
      key: "first_touches",
      label: "נגיעות ראשונות",
      min: 12000,
      max: 30000,
      display: "‏12–30 אלף ₪",
    },
    { key: "full_upgrade", label: "שדרוג מלא", min: 30000, max: 60000, display: "‏30–60 אלף ₪" },
    {
      key: "transformation",
      label: "טרנספורמציה",
      min: 60000,
      max: 120000,
      display: "‏60–120 אלף ₪",
    },
    {
      key: "flagship",
      label: "פרויקט דגל",
      min: 120000,
      max: Infinity,
      display: "‏120 אלף ₪ ומעלה",
    },
  ],
};

// scopeKeys: מערך מפתחות scope רצויים (+"outdoor_kitchen" וירטואלי כשנבחר מטבח חוץ)
export function estimate(propertyType, sizeSqm, scopeKeys = []) {
  const c = BAND_CONFIG.value[propertyType] || BAND_CONFIG.value.other;
  const raw = c.base + (sizeSqm && sizeSqm > 0 ? sizeSqm * c.perSqm : 0);
  let est = Math.min(Math.max(raw, c.min), c.max);
  for (const k of new Set(scopeKeys)) est += BAND_CONFIG.additions[k] || 0;
  return Math.round(est / 1000) * 1000;
}

export function bandFor(est) {
  const b =
    BAND_CONFIG.bands.find((x) => est >= x.min && est < x.max) ||
    BAND_CONFIG.bands[BAND_CONFIG.bands.length - 1];
  return {
    key: b.key,
    label: b.label,
    min: b.min,
    max: b.max === Infinity ? null : b.max,
    display: b.display,
  };
}
