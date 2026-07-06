// מספרי: presets כצ'יפים + שורת −/+, עם יחידה.
import { el, shell, skipLink } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const min = step.min ?? 0;
  const max = step.max ?? 999;
  const inc = step.step ?? 1;
  let val = typeof ctx.value === "number" ? ctx.value : (step.initial ?? min);

  const valEl = el("div", { class: "q-stepper-val", "aria-live": "polite" });
  const paint = () => {
    valEl.innerHTML = "";
    valEl.append(String(val), el("small", {}, step.unit || ""));
    if (presetWrap) {
      presetWrap.querySelectorAll(".chip").forEach((c) => {
        c.classList.toggle("selected", Number(c.dataset.v) === val);
      });
    }
  };

  let presetWrap = null;
  if (step.presets) {
    presetWrap = el("div", { class: "q-chips", role: "group", "aria-label": "טווחים מהירים" });
    for (const p of step.presets) {
      presetWrap.append(
        el(
          "button",
          {
            class: "chip",
            type: "button",
            "data-v": p.value,
            onclick: () => {
              val = p.value;
              paint();
            },
          },
          p.label,
        ),
      );
    }
    root.append(presetWrap);
  }

  const minus = el(
    "button",
    {
      class: "q-stepper-btn",
      type: "button",
      "aria-label": "הפחתה",
      onclick: () => {
        val = Math.max(min, val - inc);
        paint();
      },
    },
    "−",
  );
  const plus = el(
    "button",
    {
      class: "q-stepper-btn",
      type: "button",
      "aria-label": "הוספה",
      onclick: () => {
        val = Math.min(max, val + inc);
        paint();
      },
    },
    "+",
  );
  root.append(el("div", { class: "q-stepper-row" }, plus, valEl, minus));

  const btn = el(
    "button",
    {
      class: "btn-primary",
      type: "button",
      onclick: () => {
        ctx.setValue(val);
        ctx.next();
      },
    },
    step.continueLabel || "המשך",
  );
  const actions = el("div", { class: "q-actions" }, btn);
  if (step.skippable) actions.append(skipLink(step, ctx));
  root.append(actions);
  paint();
  return root;
}
