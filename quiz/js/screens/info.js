// מסכי מידע: פתיחה, הקדמת הדיזיינר, עידוד.
import { el, shell } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  root.classList.add("q-info");

  const cta = el(
    "button",
    {
      class: "btn-primary",
      type: "button",
      onclick: () => (step.onCta ? step.onCta(ctx) : ctx.next()),
    },
    step.cta || "המשך",
  );
  const actions = el("div", { class: "q-actions" }, cta);

  if (step.secondary) {
    // `strong` הופך את הדילוג מקישור קטן לכפתור משני מלא-רוחב — שני נתיבים
    // שנראים כמו בחירה, ולא צעד חובה עם מילוט באותיות קטנות.
    const cls = step.secondary.strong ? "btn-secondary" : "q-skip";
    actions.append(
      el(
        "button",
        { class: cls, type: "button", onclick: () => step.secondary.onClick(ctx) },
        step.secondary.label,
      ),
    );
  }
  root.append(actions);
  if (step.trust) root.append(el("p", { class: "q-trust" }, step.trust));
  return root;
}
