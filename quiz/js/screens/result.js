// מסך התוצאה: פרופיל + רמת השקעה + מה עכשיו + וואטסאפ. וריאנט lite לעסק/בניין.
import { el } from "./base.js";
import { CONFIG } from "../config.js";
import { buildAcc, computeBand, TYPE_LABEL, STYLE_LABEL } from "../submit.js";
import { STYLE_IMG } from "../flows.js";
import { track } from "../analytics.js";

function waLink(state, acc, band) {
  const lines = ["היי, סיימתי עכשיו את שאלון האפיון באתר 🌿"];
  const c =
    state.answers[
      state.flow === "balcony"
        ? "A_contact"
        : state.flow === "garden"
          ? "B_contact"
          : state.flow === "business"
            ? "C_contact"
            : "D_contact"
    ];
  if (c && c.name) lines.push(c.name);
  let what = TYPE_LABEL[state.propertyType] || "";
  if (acc.lead.area) what += ", " + acc.lead.area;
  if (acc.lead.sizeSqm) what += `, כ-${acc.lead.sizeSqm} מ״ר`;
  lines.push(what);
  const details = [];
  if (acc.ch.style) details.push("סגנון: " + (STYLE_LABEL[acc.ch.style] || acc.ch.style));
  if (acc.ch.requested) details.push("חשוב לי: " + acc.ch.requested);
  if (details.length) lines.push(details.join(" · "));
  if (band) lines.push("רמת השקעה שהוצגה: " + band.label);
  lines.push("אשמח להתקדם להצעה האישית.");
  return `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function waButton(href, props) {
  return el(
    "a",
    {
      class: "btn-wa",
      href,
      target: "_blank",
      rel: "noopener",
      "data-track": "quiz_result",
      onclick: () => track("quiz_wa_click", props),
    },
    "לוואטסאפ — מתקדמים להצעה",
  );
}

// count-up עדין לטווח הרמה
function animateRange(node, band) {
  const minK = Math.round(band.min / 1000);
  const maxK = band.max ? Math.round(band.max / 1000) : null;
  const dur = 600;
  const t0 = performance.now();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const text = (m, x) => (x ? `‏${m}–${x} אלף ₪` : `‏${m} אלף ₪ ומעלה`);
  if (reduced) {
    node.textContent = text(minK, maxK);
    return;
  }
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const ease = 1 - Math.pow(1 - p, 3);
    node.textContent = text(Math.round(minK * ease), maxK ? Math.round(maxK * ease) : null);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function render(step, ctx) {
  const state = ctx.state;
  const root = el("div", { class: "q-step" });
  const acc = buildAcc(state);
  const { band } = computeBand(state, acc);
  const props = { flow: state.flow, band: band ? band.key : "none" };
  track("quiz_result_view", props);

  // ---- lite (עסק / בניין) ----
  if (step.variant === "lite") {
    root.classList.add("q-info");
    root.append(
      el("h1", { class: "q-title", tabindex: "-1" }, step.title),
      el("p", { class: "q-subtitle" }, step.subtitle),
      el(
        "div",
        { class: "q-actions" },
        waButton(waLink(state, acc, null), props),
        el("a", { class: "q-skip", href: "/" }, "חזרה לאתר"),
      ),
    );
    return root;
  }

  const blocks = [];

  // 1. פרופיל
  const hero = el("div", { class: "q-result-block q-result-hero" });
  const imgSrc =
    state.designerSnapshotLocal ||
    (state.uploads.find((u) => u.kind === "image" && u.previewUrl) || {}).previewUrl ||
    STYLE_IMG[acc.ch.style] ||
    null;
  if (imgSrc) hero.append(el("img", { src: imgSrc, alt: "החלל שלכם" }));
  hero.append(el("h1", { class: "q-title", tabindex: "-1" }, "הפרופיל של הפרויקט שלכם"));
  const chips = el("div", { class: "q-profile-chips" });
  const chip = (t) => t && chips.append(el("span", {}, t));
  chip(TYPE_LABEL[state.propertyType]);
  chip(acc.lead.sizeSqm ? `כ-${acc.lead.sizeSqm} מ״ר` : null);
  chip(acc.lead.area);
  chip(acc.ch.style ? STYLE_LABEL[acc.ch.style] : null);
  chip(acc.ch.requested);
  chip(acc.ch.urgency);
  hero.append(chips);
  blocks.push(hero);

  // 2. רמת השקעה
  if (band) {
    const range = el("div", { class: "band-range" });
    const bandBlock = el(
      "div",
      { class: "q-result-block q-band" },
      el("div", { class: "band-label" }, "רמת השקעה משוערת"),
      el("div", { class: "band-name" }, band.label),
      range,
      el(
        "div",
        { class: "band-note" },
        "הערכה ראשונית לפי מה שסיפרתם — המחיר נקבע בהצעה האישית בלבד.",
      ),
    );
    blocks.push(bandBlock);
    setTimeout(() => animateRange(range, band), 500);
  }

  // 3. מה עכשיו
  blocks.push(
    el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title", style: "font-size:1.2rem" }, "מה עכשיו?"),
      el(
        "ol",
        { class: "q-next-steps" },
        el("li", {}, "עוברים על האפיון שלכם אישית — כל תשובה נקראת."),
        el("li", {}, "הצעה מותאמת אצלכם תוך 24–48 שעות."),
        el("li", {}, "פגישת מדידה ותכנון — ומשם לביצוע."),
      ),
    ),
  );

  // 4. CTA
  const wa = waButton(waLink(state, acc, band), props);
  blocks.push(
    el(
      "div",
      { class: "q-result-block", style: "background:none;box-shadow:none;padding:0" },
      el("div", { class: "q-actions" }, wa, el("a", { class: "q-skip", href: "/" }, "חזרה לאתר")),
    ),
  );

  root.append(...blocks);

  // reveal מדורג
  blocks.forEach((b, i) => setTimeout(() => b.classList.add("revealed"), 80 * i + 30));

  // sticky CTA במובייל כשה-hero יוצא מהמסך
  const sticky = document.getElementById("sticky-cta");
  if (sticky) {
    sticky.innerHTML = "";
    sticky.append(waButton(waLink(state, acc, band), props));
    sticky.hidden = true;
    const io = new IntersectionObserver(
      (entries) => {
        sticky.hidden = entries[0].isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(hero);
  }

  return root;
}
