// טקסט חופשי / עיר עם datalist / textarea.
import { el, shell, skipLink } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const isArea = !!step.multiline;
  const input = el(isArea ? "textarea" : "input", {
    class: isArea ? "q-textarea" : "q-input",
    placeholder: step.placeholder || "",
    "aria-label": step.title,
    ...(isArea ? {} : { type: "text", list: step.datalist ? "q-datalist" : null }),
  });
  if (typeof ctx.value === "string") input.value = ctx.value;
  root.append(el("div", { class: "q-field" }, input));

  if (step.datalist) {
    const dl = el("datalist", { id: "q-datalist" });
    for (const item of step.datalist) dl.append(el("option", { value: item }));
    root.append(dl);
  }

  const btn = el(
    "button",
    { class: "btn-primary", type: "button", disabled: !step.optional },
    step.continueLabel || "המשך",
  );
  const sync = () => {
    if (!step.optional) btn.disabled = input.value.trim().length < (step.minLen ?? 2);
  };
  input.addEventListener("input", sync);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isArea && !btn.disabled) btn.click();
  });
  btn.addEventListener("click", () => {
    ctx.setValue(input.value.trim() || null);
    ctx.next();
  });

  const actions = el("div", { class: "q-actions" }, btn);
  if (step.skippable) actions.append(skipLink(step, ctx));
  root.append(actions);
  sync();
  // המיקוד היחיד במסך טקסט — המנוע מדלג על מיקוד הכותרת בשלבים האלה.
  ctx.after(280, () => input.focus({ preventScroll: true }));
  return root;
}
