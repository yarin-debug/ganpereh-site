// בחירה יחידה — גריד כרטיסים, auto-advance אחרי 160ms.
// אפשרות עם opt.textInput פותחת שדה חופשי במקום להתקדם אוטומטית
// (הטקסט נשמר ב-answers[<id>Other]).
import { el, shell } from "./base.js";
import { skipLink } from "./base.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const cols = step.cols === 1 ? "q-options cols-1" : "q-options narrow-1";
  const grid = el("div", { class: cols, role: "group", "aria-label": step.title });
  let locked = false;

  // אזור הטקסט החופשי — קיים רק כשלמסך יש אפשרות כזו
  const otherKey = step.id + "Other";
  const hasTextOption = (step.options || []).some((o) => o.textInput);
  let otherWrap = null;
  let otherInput = null;
  if (hasTextOption) {
    const existing = ctx.state.answers[otherKey] || "";
    otherInput = el("input", {
      class: "q-input",
      type: "text",
      value: existing,
      placeholder: "ספרו לנו במילה-שתיים על הכיוון",
      maxlength: "120",
    });
    const go = el(
      "button",
      {
        class: "btn-primary",
        type: "button",
        onclick: () => {
          const t = otherInput.value.trim();
          if (t) ctx.state.answers[otherKey] = t;
          else delete ctx.state.answers[otherKey];
          ctx.save();
          ctx.next();
        },
      },
      "המשך",
    );
    otherWrap = el("div", { class: "q-actions", hidden: true, style: "flex-direction:column" });
    otherWrap.append(otherInput, go);
  }

  for (const opt of step.options) {
    const card = el(
      "button",
      {
        class:
          "opt-card" + (opt.img ? " has-img" : "") + (ctx.value === opt.value ? " selected" : ""),
        type: "button",
        onclick: () => {
          if (locked) return;
          grid.querySelectorAll(".opt-card").forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          ctx.setValue(opt.value);
          // אפשרות עם שדה חופשי לא בורחת קדימה — נותנים מקום לכתוב
          if (opt.textInput) {
            if (otherWrap) {
              otherWrap.hidden = false;
              otherInput.focus();
            }
            return;
          }
          if (otherWrap) otherWrap.hidden = true;
          locked = true;
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
      // התמונה יושבת **לצד** הטקסט ולא מעליו, ולכן היא עטופה ב-.opt-txt.
      // הסיבה נמדדה: הרצועה הרחבה הקודמת הראתה 25% מצילום לאורך, וספריית
      // הצילומים של גן פרא היא 88% לאורך. בפריסה הזו נראה הצילום המלא,
      // והכרטיס יוצא **נמוך יותר** (132px מול 190px) כי הכותרת עלתה לצד.
      // כרטיס עם אייקון ובלי תמונה נשאר בפריסה האנכית הישנה.
      opt.img
        ? el("img", { src: opt.img, alt: "", loading: "lazy", width: "420", height: "560" })
        : null,
      opt.icon ? el("span", { class: "opt-icon", "aria-hidden": "true" }, opt.icon) : null,
      el(
        "span",
        { class: "opt-txt" },
        el("span", { class: "opt-label" }, opt.label),
        opt.sub ? el("span", { class: "opt-sub" }, opt.sub) : null,
      ),
    );
    grid.append(card);
  }
  root.append(grid);
  if (otherWrap) {
    root.append(otherWrap);
    // חזרה למסך כשהאפשרות הזו כבר נבחרה — השדה נשאר פתוח עם הטקסט
    if ((step.options || []).some((o) => o.textInput && ctx.value === o.value)) {
      otherWrap.hidden = false;
    }
  }
  if (step.skippable) root.append(el("div", { class: "q-actions" }, skipLink(step, ctx)));
  return root;
}
