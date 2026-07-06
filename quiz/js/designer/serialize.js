// סריאליזציה במטרים (בלתי תלוי מכשיר) + גזירת scope אוטומטית לקטלוג העבודות.
import { byType } from "./palette.js";
import { shapeAreaM2 } from "./core.js";

export function serialize(D) {
  const counts = { desired: {}, existing: {} };
  for (const el of D.elements) {
    const bucket = counts[el.status] || counts.desired;
    bucket[el.type] = (bucket[el.type] || 0) + 1;
  }
  const shape = { type: D.shape.type, widthM: D.shape.widthM, depthM: D.shape.depthM };
  if (D.shape.type === "L") shape.cut = { ...D.shape.cut };
  return {
    version: 1,
    shape,
    elements: D.elements.map((el) => ({
      id: el.id,
      type: el.type,
      status: el.status,
      xM: el.xM,
      yM: el.yM,
      wM: el.wM,
      hM: el.hM,
      rotation: el.rotation || 0,
    })),
    counts,
  };
}

// אלמנטים רצויים → scope items: {key, qty, note, kitchen}
export function scopeFromDesigner(D) {
  const groups = new Map(); // scopeKey → {count, areaM2, dims, kitchen}
  for (const el of D.elements) {
    if (el.status !== "desired") continue;
    const item = byType(el.type);
    if (!item || !item.scope) continue;
    const g = groups.get(item.scope) || { count: 0, areaM2: 0, dims: null, kitchen: false };
    g.count++;
    g.areaM2 += el.wM * el.hM;
    if (!g.dims) g.dims = `${el.wM}×${el.hM} מ׳`;
    if (item.kitchen) g.kitchen = true;
    groups.set(item.scope, g);
  }
  const out = [];
  for (const [key, g] of groups) {
    let qty;
    const item = { areaKeys: ["deck", "lawn"], unitDim: ["pergola", "shading"] };
    if (item.areaKeys.includes(key)) qty = `~${Math.max(1, Math.round(g.areaM2))} מ״ר`;
    else if (item.unitDim.includes(key)) qty = `${g.count} יח׳ · ${g.dims}`;
    else qty = `${g.count} יח׳`;
    out.push({
      key,
      qty,
      note: g.kitchen ? "מטבח חוץ (מהדיזיינר)" : "מהדיזיינר",
      kitchen: g.kitchen,
    });
  }
  return out;
}

export function designerSizeSqm(D) {
  return shapeAreaM2(D.shape);
}
