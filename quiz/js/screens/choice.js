// בחירה יחידה — גריד כרטיסים, auto-advance אחרי 160ms.
import { el, shell } from "./base.js";
import { skipLink } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const cols = step.cols === 1 ? "q-options cols-1" : "q-options narrow-1";
  const grid = el("div", { class: cols, role: "group", "aria-label": step.title });
  let locked = false;

  for (const opt of step.options) {
    const card = el(
      "button",
      {
        class: "opt-card" + (ctx.value === opt.value ? " selected" : ""),
        type: "button",
        onclick: () => {
          if (locked) return;
          locked = true;
          grid.querySelectorAll(".opt-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          ctx.setValue(opt.value);
          if (step.autoAdvance === false) {
            locked = false;
            return;
          }
          // דרך ctx.after כדי שהמנוע יבטל אותו אם המסך הוחלף בינתיים
          // (טאפ ואז "חזרה" בתוך החלון דילג שני מסכים קדימה).
          ctx.after(160, () => ctx.next());
        },
      },
      el("span", { class: "opt-check", "aria-hidden": "true" }, "✓"),
      opt.img ? el("img", { src: opt.img, alt: "", loading: "lazy" }) : null,
      opt.icon ? el("span", { class: "opt-icon", "aria-hidden": "true" }, opt.icon) : null,
      el("span", { class: "opt-label" }, opt.label),
      opt.sub ? el("span", { class: "opt-sub" }, opt.sub) : null,
    );
    grid.append(card);
  }
  root.append(grid);
  if (step.skippable) root.append(el("div", { class: "q-actions" }, skipLink(step, ctx)));
  return root;
}
