// בחירה מרובה בצ'יפים + כפתור המשך.
import { el, shell, skipLink, continueBtn } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const selected = new Set(Array.isArray(ctx.value) ? ctx.value : []);
  const wrap = el("div", { class: "q-chips", role: "group", "aria-label": step.title });
  const btn = continueBtn(step.continueLabel || "המשך");
  const hint = step.max ? el("p", { class: "q-chips-hint" }, `אפשר לבחור עד ${step.max}`) : null;

  const sync = () => {
    btn.disabled = selected.size === 0;
  };

  for (const opt of step.options) {
    const chip = el(
      "button",
      {
        class: "chip" + (selected.has(opt.value) ? " selected" : ""),
        type: "button",
        "aria-pressed": selected.has(opt.value) ? "true" : "false",
        onclick: () => {
          if (selected.has(opt.value)) {
            selected.delete(opt.value);
            chip.classList.remove("selected");
            chip.setAttribute("aria-pressed", "false");
          } else {
            if (step.max && selected.size >= step.max) return;
            selected.add(opt.value);
            chip.classList.add("selected");
            chip.setAttribute("aria-pressed", "true");
          }
          sync();
        },
      },
      opt.label,
    );
    wrap.append(chip);
  }

  btn.addEventListener("click", () => {
    ctx.setValue([...selected]);
    ctx.next();
  });

  root.append(wrap);
  if (hint) root.append(hint);
  const actions = el("div", { class: "q-actions" }, btn);
  if (step.skippable) actions.append(skipLink(step, ctx));
  root.append(actions);
  sync();
  return root;
}
