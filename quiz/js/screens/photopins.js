// stub זמני — מוחלף בשלב 4 (פינים על תמונה עם Konva).
import { el, shell, skipLink } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  root.append(el("div", { class: "q-actions" }, skipLink(step, ctx)));
  return root;
}
