// בחירה מרובה בצ'יפים + כפתור המשך. step.other = טקסט חופשי אופציונלי
// ("משהו נוסף שאין ברשימה") שנשמר ב-answers[<id>_other].
import { el, shell, skipLink, continueBtn } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const selected = new Set(Array.isArray(ctx.value) ? ctx.value : []);
  const wrap = el("div", { class: "q-chips", role: "group", "aria-label": step.title });
  const btn = continueBtn(step.continueLabel || "המשך");
  const hint = step.max ? el("p", { class: "q-chips-hint" }, `אפשר לבחור עד ${step.max}`) : null;

  // טקסט חופשי — נפתח מצ'יפ "משהו נוסף", נשמר לצד הבחירות ולא במקומן
  const otherKey = step.id + "_other";
  let otherInput = null;
  let otherChip = null;
  if (step.other) {
    const existing = ctx.state.answers[otherKey] || "";
    otherInput = el("input", {
      class: "q-input",
      type: "text",
      value: existing,
      placeholder: step.other.placeholder || "ספרו לנו במילה-שתיים",
      maxlength: "120",
      hidden: !existing,
      oninput: () => sync(),
    });
    otherChip = el(
      "button",
      {
        class: "chip" + (existing ? " selected" : ""),
        type: "button",
        "aria-pressed": existing ? "true" : "false",
        onclick: () => {
          const open = otherInput.hidden;
          otherInput.hidden = !open;
          otherChip.classList.toggle("selected", open);
          otherChip.setAttribute("aria-pressed", open ? "true" : "false");
          if (open) otherInput.focus();
          sync();
        },
      },
      step.other.label || "משהו נוסף…",
    );
  }

  const otherText = () => (otherInput && !otherInput.hidden ? otherInput.value.trim() : "");

  const sync = () => {
    btn.disabled = selected.size === 0 && !otherText();
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

  if (otherChip) wrap.append(otherChip);

  btn.addEventListener("click", () => {
    const t = otherText();
    if (t) ctx.state.answers[otherKey] = t;
    else delete ctx.state.answers[otherKey];
    ctx.setValue([...selected]);
    ctx.next();
  });

  root.append(wrap);
  if (otherInput) {
    otherInput.style.marginTop = "10px";
    root.append(otherInput);
  }
  if (hint) root.append(hint);
  const actions = el("div", { class: "q-actions" }, btn);
  if (step.skippable) actions.append(skipLink(step, ctx));
  root.append(actions);
  sync();
  return root;
}
