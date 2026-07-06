// קטלוג האלמנטים של הדיזיינר. scope = מפתח בקטלוג העבודות של הדשבורד (work-catalog.ts).
// מידות במטרים. infra=true → ברירת הלשונית "מה קיים". round=true → מצויר כעיגול (קוטר=w).

export const PALETTE = [
  { type: "water_point", label: "נקודת מים", em: "🚰", w: 0.4, h: 0.4, scope: null, infra: true },
  {
    type: "electric_point",
    label: "נקודת חשמל",
    em: "⚡",
    w: 0.4,
    h: 0.4,
    scope: null,
    infra: true,
  },
  { type: "door", label: "דלת / יציאה", em: "🚪", w: 0.9, h: 0.3, scope: null, infra: true },
  { type: "planter", label: "אדנית", em: "🪴", w: 1.2, h: 0.4, scope: "pots" },
  { type: "pot", label: "עציץ עגול", em: "🏺", w: 0.6, h: 0.6, scope: "pots", round: true },
  {
    type: "shrub",
    label: "צמחייה / שיח",
    em: "🌿",
    w: 0.8,
    h: 0.8,
    scope: "planting",
    round: true,
  },
  { type: "tree", label: "עץ", em: "🌳", w: 1.2, h: 1.2, scope: "trees", round: true },
  { type: "pergola", label: "פרגולה", em: "⛱️", w: 3.0, h: 3.0, scope: "pergola", floor: true },
  {
    type: "shading",
    label: "הצללה / סוכך",
    em: "🌤️",
    w: 3.0,
    h: 2.0,
    scope: "shading",
    floor: true,
  },
  { type: "deck", label: "דק", em: "🟫", w: 3.0, h: 2.0, scope: "deck", floor: true, area: true },
  { type: "lawn", label: "דשא", em: "🟩", w: 2.0, h: 2.0, scope: "lawn", floor: true, area: true },
  { type: "seating", label: "פינת ישיבה", em: "🛋️", w: 2.0, h: 1.6, scope: "furniture" },
  { type: "table", label: "שולחן אוכל", em: "🍽️", w: 1.6, h: 0.9, scope: "furniture" },
  { type: "hammock", label: "ערסל / נדנדה", em: "🪢", w: 1.2, h: 1.2, scope: "furniture" },
  { type: "light", label: "תאורה", em: "💡", w: 0.3, h: 0.3, scope: "lighting" },
  { type: "water_elem", label: "אלמנט מים", em: "⛲", w: 1.0, h: 1.0, scope: "water", round: true },
  { type: "kitchen", label: "מטבח חוץ", em: "🍳", w: 2.0, h: 0.7, scope: "other", kitchen: true },
];

export const byType = (t) => PALETTE.find((p) => p.type === t);

// פריט מותאם אישית ("פריט חופשי") — האלמנט נושא label וצורה משלו
export function itemFor(el) {
  if (el.type === "custom") {
    return {
      type: "custom",
      label: el.customLabel || "פריט",
      em: "✏️",
      scope: "other",
      round: el.customRound === true,
    };
  }
  return byType(el.type);
}
