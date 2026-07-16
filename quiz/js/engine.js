// מנוע השאלון: רצף מסכים, ניווט קדימה/אחורה, branching, progress, resume, deep-link.
import { state, save, hasProgress, resetState } from "./state.js";
import { COMMON, FLOWS, TYPE_MAP } from "./flows.js";
import { track } from "./analytics.js";

import * as info from "./screens/info.js";
import * as choice from "./screens/choice.js";
import * as chips from "./screens/chips.js";
import * as stepper from "./screens/stepper.js";
import * as textinput from "./screens/textinput.js";
import * as composite from "./screens/composite.js";
import * as upload from "./screens/upload.js";
import * as photopins from "./screens/photopins.js";
import * as designer from "./screens/designer.js";
import * as contact from "./screens/contact.js";
import * as result from "./screens/result.js";

const RENDERERS = {
  info: info.render,
  single: choice.render,
  chips: chips.render,
  stepper: stepper.render,
  text: textinput.render,
  composite: composite.render,
  upload: upload.render,
  photopins: photopins.render,
  designer: designer.render,
  contact: contact.render,
  result: result.render,
};

const screenEl = document.getElementById("screen");
const backBtn = document.getElementById("q-back");
const progressEl = document.getElementById("q-progress");
const progressFill = document.getElementById("q-progress-fill");
const stickyEl = document.getElementById("sticky-cta");

let deepLinked = false;

function sequence() {
  return [...COMMON, ...(state.flow ? FLOWS[state.flow] : [])];
}
function isVisible(step) {
  return !step.showIf || step.showIf(state);
}
function findStep(id) {
  return sequence().find((s) => s.id === id);
}

// progress: מיקום בין השאלות הנראות של המסלול (info/contact/result לא נספרים)
function updateProgress(step) {
  const hidden =
    step.hideProgress || step.type === "contact" || step.type === "result" || step.id === "S0";
  progressEl.hidden = hidden;
  if (hidden) return;
  const countable = sequence().filter(
    (s) => !["info", "result", "contact"].includes(s.type) && isVisible(s),
  );
  const idx = countable.findIndex((s) => s.id === step.id);
  const pct = idx >= 0 ? Math.round(((idx + 1) / countable.length) * 100) : 0;
  progressFill.style.width = pct + "%";
  progressEl.setAttribute("aria-valuenow", String(pct));
}

function summarizeAnswer(v) {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join(",");
  if (typeof v === "object") return JSON.stringify(v).slice(0, 90);
  return String(v).slice(0, 90);
}

function makeCtx(step) {
  return {
    state,
    save,
    track,
    value: state.answers[step.id],
    setValue(v, opts = {}) {
      state.answers[step.id] = v;
      if (step.effect) step.effect(v, state, step);
      save();
    },
    next: () => next(step),
    back,
    trackSkip: () => track("quiz_step_skip", { flow: state.flow, step_id: step.id }),
  };
}

function renderStep(step) {
  state.stepId = step.id;
  save();
  screenEl.innerHTML = "";
  if (stickyEl && step.type !== "result") {
    stickyEl.hidden = true;
    stickyEl.innerHTML = "";
  }
  const node = RENDERERS[step.type](step, makeCtx(step));
  screenEl.append(node);
  backBtn.hidden = step.id === "S0" || step.type === "result";
  updateProgress(step);
  const title = node.querySelector(".q-title");
  if (title) setTimeout(() => title.focus({ preventScroll: false }), 60);
  window.scrollTo({ top: 0 });
}

function next(fromStep) {
  const seq = sequence();
  const i = seq.findIndex((s) => s.id === fromStep.id);
  // אירוע התקדמות עבור שאלות (לא info/contact — להן אירועים ייעודיים)
  if (!["info", "contact", "result"].includes(fromStep.type)) {
    track("quiz_step", {
      flow: state.flow,
      step_id: fromStep.id,
      step_index: i,
      answer: summarizeAnswer(state.answers[fromStep.id]),
    });
    if (fromStep.id === "S1") track("quiz_flow_selected", { flow: state.flow });
  }
  // deep-link: מ-S0 ישירות לתחילת המסלול
  let j = i + 1;
  if (fromStep.id === "S0" && deepLinked) j = seq.findIndex((s) => s.id === "S1") + 1;
  while (j < seq.length && !isVisible(seq[j])) j++;
  if (j >= seq.length) return;
  state.history.push(fromStep.id);
  save();
  renderStep(seq[j]);
}

function back() {
  while (state.history.length) {
    const prevId = state.history.pop();
    const prev = findStep(prevId);
    if (prev && isVisible(prev)) {
      save();
      renderStep(prev);
      return;
    }
  }
}

backBtn.addEventListener("click", back);

// ---- boot ----
function boot() {
  // deep-link ?type=
  const t = new URLSearchParams(location.search).get("type");
  if (t && TYPE_MAP[t] && !hasProgress()) {
    state.flow = TYPE_MAP[t].flow;
    state.propertyType = TYPE_MAP[t].propertyType;
    state.answers.S1 = t;
    deepLinked = true;
    save();
  } else if (t && TYPE_MAP[t]) {
    deepLinked = true; // יש התקדמות שמורה — נכבד אותה, אבל אם יתחיל מחדש נדלג
  }

  const s0 = { ...COMMON[0] };
  if (hasProgress() && state.stepId && state.stepId !== "S0") {
    // הצעת המשך — לשמור את היעד לפני ש-renderStep(s0) דורס את stepId
    const resumeTo = state.stepId;
    s0.subtitle = "יש לכם שאלון באמצע, אפשר להמשיך בדיוק מאיפה שעצרתם.";
    s0.cta = "להמשיך מאיפה שעצרתם";
    s0.onCta = () => {
      const step = findStep(resumeTo);
      if (step && isVisible(step)) renderStep(step);
      else renderStep(COMMON[1]);
    };
    s0.secondary = {
      label: "להתחיל מחדש",
      onClick: () => {
        resetState();
        location.reload();
      },
    };
    renderStep(s0);
    return;
  }

  s0.onCta = (ctx) => {
    track("quiz_start", { quiz_version: 2 });
    ctx.next();
  };
  renderStep(s0);
}

boot();
