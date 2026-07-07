// מסך הדיזיינר: שלב צורה (מלבן/ר/חופשית) → שלב אלמנטים (פלטה, ידיות גודל, undo)
// → serialize+snapshot. כשל טעינת Konva → מעבר שקוף לשאלות ה-fallback.
import { el, shell } from "./base.js";
import { loadKonva } from "../designer/loader.js";
import { createDesigner } from "../designer/core.js";
import { PALETTE } from "../designer/palette.js";
import {
  serialize,
  deserialize,
  scopeFromDesigner,
  designerSizeSqm,
} from "../designer/serialize.js";
import { uploadReadyBlob } from "../upload-client.js";
import { track } from "../analytics.js";

function dimControl(labelText, get, set, min, max) {
  const out = el("output", {}, get().toFixed(1).replace(/\.0$/, "") + " מ׳");
  const btn = (txt, d) =>
    el(
      "button",
      {
        type: "button",
        "aria-label": labelText + (d > 0 ? " — הוספה" : " — הפחתה"),
        onclick: () => {
          set(Math.min(max, Math.max(min, get() + d)));
          out.textContent = get().toFixed(1).replace(/\.0$/, "") + " מ׳";
        },
      },
      txt,
    );
  return el(
    "div",
    { class: "dz-dim" },
    el("label", {}, labelText),
    btn("+", 0.5),
    out,
    btn("−", -0.5),
  );
}

export function render(step, ctx) {
  const { root } = shell(step);
  const wrap = el("div", { class: "dz-wrap" });
  const canvasBox = el("div", { class: "dz-canvas" });
  wrap.append(canvasBox);
  root.append(wrap);

  const startedAt = Date.now();
  let designer = null;
  // חזרה אחורה לדיזיינר: אם כבר יש לוח שמור — טוענים אותו לעריכה
  const restored = deserialize(ctx.state.designer);

  const fallback = (reason) => {
    track("quiz_designer_fallback", { reason });
    ctx.state.answers.A_designer_skipped = true;
    ctx.save();
    ctx.next();
  };

  loadKonva().then(
    (Konva) => document.fonts.ready.then(() => boot(Konva)),
    () => fallback("load"),
  );

  function boot(Konva) {
    track("quiz_designer_open", {});
    const sqmNote = el("p", { class: "dz-sqm" });
    const hint = el("div", { class: "dz-hint", hidden: true }, "גררו לכאן את החלומות 🌿");
    let phase = "shape"; // לפני createDesigner — ה-callbacks רצים כבר בבנייה

    designer = createDesigner(
      Konva,
      canvasBox,
      {
        onShape: (sqm) => {
          sqmNote.innerHTML = `שטח משוער: <b>${sqm} מ״ר</b>`;
        },
        onSelect: (elSel) => paintActionBar(elSel),
        onUndoState: (can) => {
          undoBtn.disabled = !can;
        },
        onElements: (n) => {
          hint.hidden = n > 0 || phase !== "elements";
        },
      },
      restored,
    );
    sqmNote.innerHTML = `שטח משוער: <b>${designer.areaM2()} מ״ר</b>`;

    // ---- שלב הצורה ----
    const freeHint = el(
      "p",
      { class: "dz-sqm", hidden: true },
      "גררו את הנקודות הכתומות · הקשה על נקודת אמצע מוסיפה פינה · הקשה כפולה על פינה מוחקת",
    );

    const shapeCards = el(
      "div",
      { class: "dz-shape-cards three" },
      shapeCard("מלבן", "▭", "rect"),
      shapeCard("צורת ר", "⌐", "L"),
      shapeCard("צורה חופשית", "⬠", "free"),
    );
    function shapeCard(label, icon, type) {
      const c = el(
        "button",
        {
          class: "opt-card" + (designer.D.shape.type === type ? " selected" : ""),
          type: "button",
          onclick: () => {
            shapeCards.querySelectorAll(".opt-card").forEach((x) => x.classList.remove("selected"));
            c.classList.add("selected");
            const isFree = type === "free";
            dims.hidden = isFree;
            cornerBox.hidden = type !== "L";
            freeHint.hidden = !isFree;
            if (isFree) {
              designer.enterFreeEdit();
            } else {
              designer.exitFreeEdit();
              // חזרה מצורה חופשית — משחזרים מלבן/ר במידות ברירת מחדל סבירות
              if (designer.D.shape.type === "free") {
                designer.D.shape = {
                  type,
                  widthM: 4,
                  depthM: 2.5,
                  cut: { corner: "tl", widthM: 1.5, depthM: 1 },
                };
                designer.setShape({}, true);
              } else {
                designer.setShape({ type }, true);
              }
            }
          },
        },
        el("span", { class: "opt-icon", "aria-hidden": "true" }, icon),
        el("span", { class: "opt-label" }, label),
      );
      return c;
    }

    const dims = el(
      "div",
      { class: "dz-dims" },
      dimControl(
        "רוחב",
        () => designer.D.shape.widthM,
        (v) => designer.setShape({ widthM: v }),
        1,
        25,
      ),
      dimControl(
        "עומק",
        () => designer.D.shape.depthM,
        (v) => designer.setShape({ depthM: v }),
        1,
        15,
      ),
    );

    const cornerBox = el("div", { class: "dz-dims", hidden: designer.D.shape.type !== "L" });
    const cornerSeg = el("div", { class: "q-seg" });
    for (const [corner, label] of [
      ["tl", "שמאל למעלה"],
      ["tr", "ימין למעלה"],
      ["bl", "שמאל למטה"],
      ["br", "ימין למטה"],
    ]) {
      // התוויות לפי מה שרואים על המסך (tl בקנבס = שמאל למעלה אצל המשתמש)
      const chip = el(
        "button",
        {
          class: "chip" + (designer.D.shape.cut.corner === corner ? " selected" : ""),
          type: "button",
          onclick: () => {
            cornerSeg.querySelectorAll(".chip").forEach((x) => x.classList.remove("selected"));
            chip.classList.add("selected");
            designer.setShape({ cut: { ...designer.D.shape.cut, corner } });
          },
        },
        label,
      );
      cornerSeg.append(chip);
    }
    cornerBox.append(
      el(
        "div",
        { style: "width:100%" },
        el("div", { class: "q-group-label" }, "איזו פינה חתוכה?"),
        cornerSeg,
      ),
      dimControl(
        "רוחב חיתוך",
        () => designer.D.shape.cut.widthM,
        (v) => designer.setShape({ cut: { ...designer.D.shape.cut, widthM: v } }),
        0.5,
        20,
      ),
      dimControl(
        "עומק חיתוך",
        () => designer.D.shape.cut.depthM,
        (v) => designer.setShape({ cut: { ...designer.D.shape.cut, depthM: v } }),
        0.5,
        12,
      ),
    );

    // מעבר משלב הצורה לשלב האלמנטים. silent=true בשחזור (בלי אירוע אנליטיקס כפול)
    function goToElements(opts = {}) {
      phase = "elements";
      designer.exitFreeEdit(); // מסיר ידיות פינות אם היו; לא משנה צורה
      if (!opts.silent)
        track("quiz_designer_shape", { shape: designer.D.shape.type, sqm: designer.areaM2() });
      shapePhase.remove();
      wrap.append(elementsPhase);
      hint.hidden = designer.D.elements.length > 0;
      ctx.state.answers.A_designer_shape_done = true;
      ctx.save();
    }

    const toElementsBtn = el(
      "button",
      { class: "btn-primary", type: "button", onclick: () => goToElements() },
      "ממשיכים לאלמנטים ←",
    );
    const shapePhase = el(
      "div",
      {},
      shapeCards,
      el("div", { style: "height:12px" }),
      dims,
      cornerBox,
      freeHint,
      sqmNote,
      el("div", { class: "q-actions" }, toElementsBtn, skipInside()),
    );
    wrap.append(shapePhase);

    // ---- שלב האלמנטים ----
    const tabs = el("div", { class: "dz-tabs" });
    const itemsGrid = el("div", { class: "dz-items" });
    const customForm = el("div", { class: "dz-custom-form", hidden: true });

    const paintItems = () => {
      itemsGrid.innerHTML = "";
      const mode = designer.D.mode;
      const list = PALETTE.filter((p) =>
        mode === "existing" ? true : !p.infra || p.type === "door",
      );
      for (const item of list) {
        itemsGrid.append(
          el(
            "button",
            {
              class: "dz-item",
              type: "button",
              onclick: () => {
                designer.addElement(item.type);
                track("quiz_designer_element_add", { type: item.type, status: designer.D.mode });
              },
            },
            el("span", { class: "em", "aria-hidden": "true" }, item.em),
            el("span", { class: "lb" }, item.label),
          ),
        );
      }
      // אריח פריט חופשי — פותח טופס מיני
      itemsGrid.append(
        el(
          "button",
          {
            class: "dz-item dz-item-custom",
            type: "button",
            "aria-expanded": "false",
            onclick: () => {
              customForm.hidden = !customForm.hidden;
              if (!customForm.hidden) customForm.querySelector("input").focus();
            },
          },
          el("span", { class: "em", "aria-hidden": "true" }, "✏️"),
          el("span", { class: "lb" }, "פריט חופשי"),
        ),
      );
    };

    // טופס הפריט החופשי
    const customInput = el("input", {
      class: "q-input",
      type: "text",
      placeholder: "מה להוסיף? למשל: ג׳קוזי",
      "aria-label": "שם הפריט",
    });
    let customRound = false;
    const shapeSeg = el("div", { class: "q-seg" });
    const segChip = (label, round) => {
      const c = el(
        "button",
        {
          class: "chip" + (round === customRound ? " selected" : ""),
          type: "button",
          onclick: () => {
            customRound = round;
            shapeSeg.querySelectorAll(".chip").forEach((x) => x.classList.remove("selected"));
            c.classList.add("selected");
          },
        },
        label,
      );
      return c;
    };
    shapeSeg.append(segChip("מלבן", false), segChip("עיגול", true));
    const customAdd = el(
      "button",
      {
        class: "btn-primary",
        type: "button",
        style: "padding:10px 22px;min-height:44px",
        onclick: () => {
          const label = customInput.value.trim();
          if (label.length < 2) {
            customInput.focus();
            return;
          }
          designer.addElement("custom", { label, round: customRound });
          track("quiz_designer_element_add", { type: "custom", status: designer.D.mode });
          customInput.value = "";
          customForm.hidden = true;
        },
      },
      "הוספה",
    );
    customForm.append(customInput, shapeSeg, customAdd);

    const tab = (label, mode, cls) => {
      const t = el(
        "button",
        {
          class: "dz-tab" + (designer.D.mode === mode ? " active " + cls : ""),
          type: "button",
          onclick: () => {
            designer.setMode(mode);
            tabs.querySelectorAll(".dz-tab").forEach((x) => (x.className = "dz-tab"));
            t.className = "dz-tab active " + cls;
            paintItems();
          },
        },
        label,
      );
      return t;
    };
    tabs.append(tab("מה חולמים ✨", "desired", "desired"), tab("מה קיים היום", "existing", ""));
    paintItems();

    // פס פעולות לאלמנט נבחר. שינוי גודל וסיבוב — בידיות שעל האלמנט עצמו
    // (ידית הסיבוב מעל הפריט, כמו בתוכנת עיצוב).
    const bar = el("div", { class: "dz-actionbar", hidden: true });
    const barBtn = (txt, label, fn) =>
      el("button", { type: "button", "aria-label": label, onclick: fn }, txt);
    bar.append(
      barBtn("⧉", "שכפול", () => designer.duplicateSelected()),
      barBtn("↔", "החלפה בין קיים לרצוי", () =>
        designer.mutateSelected(
          (e) => (e.status = e.status === "desired" ? "existing" : "desired"),
        ),
      ),
      barBtn("🗑", "מחיקה", () => designer.deleteSelected()),
    );
    function paintActionBar(elSel) {
      bar.hidden = !elSel;
    }

    const undoBtn = el(
      "button",
      {
        class: "dz-undo",
        type: "button",
        "aria-label": "ביטול פעולה אחרונה",
        disabled: true,
        onclick: () => designer.undo(),
      },
      "↩",
    );
    canvasBox.append(bar, undoBtn, hint);

    const doneBtn = el(
      "button",
      {
        class: "btn-primary",
        type: "button",
        onclick: async () => {
          doneBtn.disabled = true;
          doneBtn.textContent = "שומרים את הלוח…";
          const D = designer.D;
          const json = serialize(D);
          ctx.state.designer = json;
          ctx.state.designerScope = scopeFromDesigner(D);
          try {
            const { dataUrl, blob } = await designer.snapshotBlob();
            ctx.state.designerSnapshotLocal = dataUrl;
            try {
              ctx.state.designerSnapshotUrl = await uploadReadyBlob(
                blob,
                "designer.png",
                "image/png",
              );
            } catch (e) {
              /* העלאת snapshot נכשלה — לא חוסם */
            }
          } catch (e) {
            /* snapshot נכשל — ממשיכים */
          }
          const desired = json.elements.filter((x) => x.status === "desired").length;
          const existing = json.elements.length - desired;
          track("quiz_designer_done", {
            desired_count: desired,
            existing_count: existing,
            duration_sec: Math.round((Date.now() - startedAt) / 1000),
          });
          ctx.setValue({ sqm: designerSizeSqm(D), desired, existing }, { silent: true });
          ctx.save();
          ctx.next();
        },
      },
      "סיימתי ✓",
    );

    const elementsPhase = el(
      "div",
      {},
      el("div", { class: "dz-palette" }, tabs, itemsGrid, customForm),
      el("div", { class: "q-actions" }, doneBtn, skipInside()),
    );

    function skipInside() {
      return el(
        "button",
        {
          class: "q-skip",
          type: "button",
          onclick: () => {
            track("quiz_designer_skip", { from: phase });
            ctx.state.answers.A_designer_skipped = true;
            ctx.save();
            ctx.next();
          },
        },
        "מעדיפים רשימה במקום מפה?",
      );
    }

    // שוחזר לוח קודם → קופצים ישר לשלב האלמנטים, שם המשתמש עצר ולחץ "סיימתי"
    if (restored) goToElements({ silent: true });
  }

  return root;
}
