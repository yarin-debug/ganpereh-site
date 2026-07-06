// stub זמני — מוחלף בשלב 5 (דיזיינר Konva מלא).
import { el, shell } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  root.append(
    el("p", { class: "q-subtitle" }, "(הדיזיינר בבנייה — בינתיים עונים בשאלות)"),
    el(
      "div",
      { class: "q-actions" },
      el(
        "button",
        {
          class: "btn-primary",
          type: "button",
          onclick: () => {
            ctx.state.answers.A_designer_skipped = true;
            ctx.save();
            ctx.next();
          },
        },
        "המשך בשאלות",
      ),
    ),
  );
  return root;
}
