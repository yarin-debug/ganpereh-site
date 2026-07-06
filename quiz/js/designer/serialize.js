// סריאליזציה במטרים (בלתי תלוי מכשיר) + גזירת scope אוטומטית לקטלוג העבודות.
import { itemFor } from "./palette.js";
import { shapeAreaM2 } from "./core.js";

export function serialize(D) {
  const counts = { desired: {}, existing: {} };
  for (const el of D.elements) {
    const bucket = counts[el.status] || counts.desired;
    bucket[el.type] = (bucket[el.type] || 0) + 1;
  }
  const shape = { type: D.shape.type, areaM2: shapeAreaM2(D.shape) };
  if (D.shape.type === "free") {
    shape.pointsM = D.shape.pointsM.map((p) => [
      Math.round(p[0] * 100) / 100,
      Math.round(p[1] * 100) / 100,
    ]);
  } else {
    shape.widthM = D.shape.widthM;
    shape.depthM = D.shape.depthM;
    if (D.shape.type === "L") shape.cut = { ...D.shape.cut };
  }
  return {
    version: 2,
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
      ...(el.type === "custom"
        ? { customLabel: el.customLabel, customRound: !!el.customRound }
        : {}),
    })),
    counts,
  };
}

// אלמנטים רצויים → scope items: {key, qty, note, kitchen}
export function scopeFromDesigner(D) {
  const groups = new Map(); // scopeKey → {count, areaM2, dims, kitchen, labels}
  for (const el of D.elements) {
    if (el.status !== "desired") continue;
    const item = itemFor(el);
    if (!item || !item.scope) continue;
    const g = groups.get(item.scope) || {
      count: 0,
      areaM2: 0,
      dims: null,
      kitchen: false,
      labels: [],
    };
    g.count++;
    g.areaM2 += el.wM * el.hM;
    if (!g.dims) g.dims = `${el.wM}×${el.hM} מ׳`;
    if (item.kitchen) g.kitchen = true;
    if (el.type === "custom" && el.customLabel) g.labels.push(el.customLabel);
    groups.set(item.scope, g);
  }
  const out = [];
  for (const [key, g] of groups) {
    let qty;
    const areaKeys = ["deck", "lawn"];
    const unitDim = ["pergola", "shading"];
    if (areaKeys.includes(key)) qty = `~${Math.max(1, Math.round(g.areaM2))} מ״ר`;
    else if (unitDim.includes(key)) qty = `${g.count} יח׳ · ${g.dims}`;
    else qty = `${g.count} יח׳`;
    let note = "מהדיזיינר";
    if (g.kitchen) note = "מטבח חוץ (מהדיזיינר)";
    if (g.labels.length) note = g.labels.join(", ") + " (מהדיזיינר)";
    out.push({ key, qty, note, kitchen: g.kitchen });
  }
  return out;
}

export function designerSizeSqm(D) {
  return shapeAreaM2(D.shape);
}
