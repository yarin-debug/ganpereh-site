// בניית ה-payload לפי מפרט-נתונים.md ושליחה ל-inbound עם ריטריי.
import { CONFIG } from "./config.js";
import { armBeacon } from "./pending-lead.js";
import { COMMON, FLOWS } from "./flows.js";
import { estimate, bandFor } from "./band.js";
import { track } from "./analytics.js";
import { waitForPending } from "./upload-client.js";

export const TYPE_LABEL = {
  balcony: "מרפסת",
  roof_garden: "גג",
  penthouse: "פנטהאוז",
  ground_garden: "גינה פרטית",
  villa: "וילה",
  office: "משרד",
  business: "עסק",
  other: "שטח משותף",
};
export const STYLE_LABEL = {
  natural_wild: "פרא וצמחייה עבותה",
  mediterranean: "ים-תיכוני חם",
  minimal: "מינימליסטי ונקי",
  other: "פתוח להצעות",
};
const SCOPE_LABEL = {
  pots: "אדניות וכלים",
  planting: "צמחייה",
  trees: "עצים",
  pergola: "פרגולה",
  shading: "הצללה",
  deck: "דק",
  lawn: "דשא",
  furniture: "ריהוט",
  lighting: "תאורה",
  water: "אלמנט מים",
  paving: "ריצוף",
  irrigation: "השקיה",
  demolition: "פינוי",
  maintenance: "תחזוקה שוטפת",
  other: "אחר",
};

export function allSteps(state) {
  return [...COMMON, ...(FLOWS[state.flow] || [])];
}

function shapeArea(shape) {
  if (!shape) return null;
  if (shape.areaM2) return shape.areaM2; // serialize v2 — כולל גם צורה חופשית
  let a = (shape.widthM || 0) * (shape.depthM || 0);
  if (shape.type === "L" && shape.cut) a -= (shape.cut.widthM || 0) * (shape.cut.depthM || 0);
  return Math.max(1, Math.round(a));
}

// מריץ את כל פונקציות ה-apply של המסלול ומרכז lead/characterization/scope/notes.
export function buildAcc(state) {
  const acc = { lead: {}, ch: {}, scope: new Map(), notes: [], existingParts: [], kitchen: false };
  for (const step of allSteps(state)) {
    if (step.showIf && !step.showIf(state)) continue;
    const v = state.answers[step.id];
    if (v === undefined || v === null) continue;
    if (step.apply) step.apply(v, acc, state, step);
  }
  // תרומות הדיזיינר
  if (state.designer) {
    const sqm = shapeArea(state.designer.shape);
    if (sqm && !acc.lead.sizeSqm) acc.lead.sizeSqm = sqm;
    for (const it of state.designerScope || []) {
      if (!acc.scope.has(it.key))
        acc.scope.set(it.key, { qty: it.qty, note: it.note || "מהדיזיינר" });
      if (it.kitchen) acc.kitchen = true;
    }
    const ex = (state.designer.counts && state.designer.counts.existing) || {};
    if (ex.water_point) acc.existingParts.push("נקודת מים");
    if (ex.electric_point) acc.existingParts.push("נקודת חשמל");
  }
  if (acc.existingParts.length) {
    const txt = "קיים: " + [...new Set(acc.existingParts)].join(", ");
    acc.ch.existingState = acc.ch.existingState ? acc.ch.existingState + " · " + txt : txt;
  }
  if (state.zones) acc.ch.zones = state.zones;
  return acc;
}

export function computeBand(state, acc) {
  if (state.flow !== "balcony" && state.flow !== "garden")
    return { est: estimate(state.propertyType, acc.lead.sizeSqm, []), band: null };
  const keys = [...acc.scope.keys()];
  if (acc.kitchen) keys.push("outdoor_kitchen");
  const est = estimate(state.propertyType, acc.lead.sizeSqm, keys);
  return { est, band: bandFor(est) };
}

function buildMedia(state) {
  const media = [];
  let n = 1;
  const push = (url, desc) => media.push({ id: "m" + n, num: String(n++), desc, url });
  if (state.designerSnapshotUrl) push(state.designerSnapshotUrl, "תרשים החלל (מהשאלון)");
  if (state.zonesSnapshotUrl) push(state.zonesSnapshotUrl, "סימון אזורים (מהשאלון)");
  for (const u of state.uploads) {
    if (u.status === "done" && u.url)
      push(u.url, u.kind === "pdf" ? "קובץ PDF מהשאלון" : "תמונה מהשאלון");
  }
  return media;
}

function buildMessage(state, acc, band) {
  const parts = ["שאלון v2"];
  let what = TYPE_LABEL[state.propertyType] || "";
  if (acc.lead.sizeSqm) what += ` ${acc.lead.sizeSqm} מ״ר`;
  if (acc.lead.area) what += ` ב${acc.lead.area}`;
  if (what) parts.push(what.trim());
  if (acc.ch.style) parts.push("סגנון: " + (STYLE_LABEL[acc.ch.style] || acc.ch.style));
  if (band) parts.push("רמת השקעה: " + band.label);
  const scopeLabels = [...acc.scope.keys()].map((k) => SCOPE_LABEL[k] || k);
  if (scopeLabels.length) parts.push("רצונות: " + scopeLabels.join(", "));
  if (acc.ch.urgency) parts.push('לו"ז: ' + acc.ch.urgency);
  if (acc.ch.budgetMentioned) parts.push("תקציב: " + acc.ch.budgetMentioned);
  return parts.join(" · ");
}

export function buildPayload(state, contact) {
  const acc = buildAcc(state);
  const { est, band } = computeBand(state, acc);
  const media = buildMedia(state);
  const scopeArr = [...acc.scope].map(([key, o]) => ({
    key,
    selected: true,
    ...(o.qty ? { qty: o.qty } : {}),
    ...(o.note ? { note: o.note } : {}),
  }));
  const notes = [...acc.notes];
  if (contact.extra) notes.unshift("עסק: " + contact.extra);

  const characterization = {
    ...acc.ch,
    ...(scopeArr.length ? { scope: scopeArr } : {}),
    ...(media.length ? { media } : {}),
    quiz: {
      version: 1,
      flow: state.flow,
      ...(band ? { band } : {}),
      ...(state.designer ? { designer: state.designer } : {}),
      answers: state.answers,
      durationSec: Math.round((Date.now() - state.startedAt) / 1000),
      completedAt: new Date().toISOString(),
    },
  };

  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email || "",
    platform: "website",
    campaign: CONFIG.CAMPAIGN,
    propertyType: state.propertyType,
    ...(acc.lead.area ? { area: acc.lead.area } : {}),
    ...(acc.lead.sizeSqm ? { sizeSqm: acc.lead.sizeSqm } : {}),
    externalId: state.externalId,
    estimatedValue: est,
    message:
      buildMessage(state, acc, band) + (notes.length ? " · הערות: " + notes.join(" | ") : ""),
    company: contact.honeypot || "",
    characterization,
  };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function showDebug(payload) {
  let panel = document.getElementById("q-debug");
  if (!panel) {
    panel = document.createElement("pre");
    panel.id = "q-debug";
    panel.dir = "ltr";
    panel.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;max-height:45vh;overflow:auto;background:#111;color:#8f8;font-size:11px;padding:12px;z-index:999;white-space:pre-wrap";
    document.body.append(panel);
  }
  panel.textContent = "DRY_RUN payload:\n" + JSON.stringify(payload, null, 2);
}

export async function sendLead(state, contact) {
  try {
    await waitForPending();
  } catch (e) {
    /* כשל העלאות לא חוסם ליד */
  }
  const payload = buildPayload(state, contact);
  const band = payload.characterization.quiz.band;
  const submitProps = {
    flow: state.flow,
    band: band ? band.key : "none",
    estimated_value_bucket: Math.round(payload.estimatedValue / 10000) * 10,
    has_designer: !!state.designer,
    photo_count: state.uploads.filter((u) => u.status === "done").length,
    duration_sec: payload.characterization.quiz.durationSec,
  };

  // מזוין רק במסלול האמיתי — ב-DRY_RUN אין למי לשלוח
  if (!CONFIG.DRY_RUN) armBeacon(CONFIG.INBOUND_URL, payload);

  if (CONFIG.DRY_RUN) {
    console.log("[quiz DRY_RUN] payload:", payload);
    window.__quizPayload = payload;
    showDebug(payload);
    await delay(600);
    track("quiz_submit", submitProps);
    return { ok: true, payload };
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(CONFIG.INBOUND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (res.ok) {
        track("quiz_submit", submitProps);
        if (window.gpTrackLead) window.gpTrackLead("quiz");
        return { ok: true, payload };
      }
      if (res.status >= 400 && res.status < 500) break; // אין טעם לנסות שוב
    } catch (e) {
      /* רשת — ננסה שוב */
    }
    await delay(attempt * 800);
  }
  track("quiz_error", { stage: "submit", code: "failed" });
  return { ok: false };
}
