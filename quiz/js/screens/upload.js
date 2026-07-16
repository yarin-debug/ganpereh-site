// מסך העלאת תמונות/PDF עם thumbnails והתקדמות.
import { el, shell, skipLink } from "./base.js";
import { addFiles, removeUpload } from "../upload-client.js";
import { track } from "../analytics.js";

export function render(step, ctx) {
  const { root } = shell(step);
  const state = ctx.state;
  const max = step.maxFiles || 6;

  const input = el("input", {
    type: "file",
    accept: "image/*,application/pdf",
    multiple: true,
    style: "display:none",
  });
  const zone = el(
    "button",
    { class: "q-upload-zone", type: "button", onclick: () => input.click(), style: "width:100%" },
    el("span", { class: "up-icon", "aria-hidden": "true" }, "📷"),
    el("strong", {}, "בחרו תמונות מהמכשיר"),
    el(
      "p",
      { class: "q-trust", style: "margin-top:6px" },
      `עד ${max} קבצים · תמונה או PDF · עד 10MB לקובץ`,
    ),
  );

  const thumbs = el("div", { class: "q-thumbs" });
  const note = el("p", { class: "q-trust", hidden: true }, "");

  const paint = () => {
    thumbs.innerHTML = "";
    for (const u of state.uploads) {
      const t = el("div", { class: "q-thumb" + (u.status === "failed" ? " failed" : "") });
      if (u.kind === "pdf") t.append(el("div", { class: "th-pdf" }, "PDF"));
      else if (u.previewUrl) t.append(el("img", { src: u.previewUrl, alt: u.name }));
      else t.append(el("div", { class: "th-pdf" }, "…"));
      if (u.status === "pending")
        t.append(el("div", { class: "th-progress", "aria-label": "מעלה" }));
      t.append(
        el(
          "button",
          {
            class: "th-x",
            type: "button",
            "aria-label": "הסרה",
            onclick: () => {
              removeUpload(u.id);
              paint();
            },
          },
          "✕",
        ),
      );
      thumbs.append(t);
    }
    const failed = state.uploads.filter((u) => u.status === "failed").length;
    note.hidden = failed === 0;
    note.textContent = failed ? "חלק מהקבצים לא עלו. אפשר להסיר ולנסות שוב, או פשוט להמשיך." : "";
    btn.disabled = state.uploads.filter((u) => u.status !== "failed").length === 0;
  };

  input.addEventListener("change", () => {
    const { rejected } = addFiles(input.files, paint, max);
    input.value = "";
    if (rejected.length) {
      note.hidden = false;
      note.textContent = "לא נוספו: " + rejected.join(", ");
    }
    paint();
  });

  const btn = el(
    "button",
    {
      class: "btn-primary",
      type: "button",
      disabled: true,
      onclick: () => {
        const done = state.uploads.filter((u) => u.status === "done");
        track("quiz_upload", { count: done.length, has_pdf: done.some((u) => u.kind === "pdf") });
        ctx.setValue(state.uploads.length, { silent: true });
        ctx.next();
      },
    },
    "המשך",
  );

  root.append(
    input,
    zone,
    thumbs,
    note,
    el("div", { class: "q-actions" }, btn, skipLink(step, ctx)),
  );
  paint();
  return root;
}
