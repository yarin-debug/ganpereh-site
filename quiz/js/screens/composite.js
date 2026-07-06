// מסך מקובץ (גישה ולוגיסטיקה): כמה קבוצות קטנות במסך אחד.
// step.groups: [{key, label, type:"stepper"|"seg", min, max, unit, options:[{value,label}]}]
import { el, shell } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const val = Object.assign({}, ctx.value || {});

  const btn = el("button", { class: "btn-primary", type: "button", disabled: true }, "המשך");
  const sync = () => {
    btn.disabled = step.groups.some(
      (g) => g.type === "seg" && (val[g.key] === undefined || val[g.key] === null),
    );
  };

  for (const g of step.groups) {
    const box = el("div", { class: "q-group" }, el("div", { class: "q-group-label" }, g.label));
    if (g.type === "stepper") {
      let v = typeof val[g.key] === "number" ? val[g.key] : (g.initial ?? g.min ?? 0);
      val[g.key] = v;
      const valEl = el("div", { class: "q-stepper-val", "aria-live": "polite" });
      const paint = () => {
        valEl.innerHTML = "";
        valEl.append(String(v), el("small", {}, g.unit || ""));
      };
      const minus = el(
        "button",
        {
          class: "q-stepper-btn",
          type: "button",
          "aria-label": "הפחתה",
          onclick: () => {
            v = Math.max(g.min ?? 0, v - 1);
            val[g.key] = v;
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
            v = Math.min(g.max ?? 99, v + 1);
            val[g.key] = v;
            paint();
          },
        },
        "+",
      );
      box.append(el("div", { class: "q-stepper-row" }, plus, valEl, minus));
      paint();
    } else {
      const seg = el("div", { class: "q-seg", role: "group", "aria-label": g.label });
      for (const opt of g.options) {
        const chip = el(
          "button",
          {
            class: "chip" + (val[g.key] === opt.value ? " selected" : ""),
            type: "button",
            onclick: () => {
              val[g.key] = opt.value;
              seg.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
              chip.classList.add("selected");
              sync();
            },
          },
          opt.label,
        );
        seg.append(chip);
      }
      box.append(seg);
    }
    root.append(box);
  }

  btn.addEventListener("click", () => {
    ctx.setValue(val);
    ctx.next();
  });
  root.append(el("div", { class: "q-actions" }, btn));
  sync();
  return root;
}
