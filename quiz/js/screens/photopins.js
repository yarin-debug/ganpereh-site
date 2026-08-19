// פינים על תמונה (מסלול גינה): טאפ מוסיף נקודה ממוספרת + בחירת תווית → zones + snapshot.
import { el, shell, skipLink } from "./base.js";
import { loadKonva } from "../designer/loader.js";
import { uploadReadyBlob } from "../upload-client.js";
import { track } from "../analytics.js";

const LABELS = ["פינת ישיבה", "צמחייה", "דשא", "פינת אוכל", "משחק לילדים", "אחר"];

export function render(step, ctx) {
  const { root } = shell(step);
  const state = ctx.state;
  const canvasBox = el("div", { class: "dz-canvas pins" });
  root.append(canvasBox);

  const img = state.uploads.find((u) => u.kind === "image" && u.previewUrl);
  if (!img) {
    // אין תמונה זמינה — מדלגים בשקט
    ctx.after(0, () => ctx.next());
    return root;
  }

  const pins = []; // {id, num, label, xR, yR (יחסי 0-1), node}
  let stage = null;
  let konvaRef = null;

  const doneBtn = el(
    "button",
    { class: "btn-primary", type: "button", disabled: true },
    "סיימתי ✓",
  );

  loadKonva().then(
    (Konva) => boot(Konva),
    () => {
      // בלי Konva אין סימון — ממשיכים הלאה בלי לחסום
      track("quiz_designer_fallback", { reason: "load_pins" });
      ctx.next();
    },
  );

  function boot(Konva) {
    konvaRef = Konva;
    const image = new Image();
    image.onload = () => {
      const w = canvasBox.clientWidth;
      const scale = w / image.naturalWidth;
      const h = Math.min(
        Math.round(image.naturalHeight * scale),
        Math.round(window.innerHeight * 0.55),
      );
      stage = new Konva.Stage({ container: canvasBox, width: w, height: h });
      const layer = new Konva.Layer();
      stage.add(layer);
      const bg = new Konva.Image({ image, width: w, height: image.naturalHeight * scale });
      layer.add(bg);

      stage.on("click tap", (e) => {
        if (e.target !== bg) return;
        const pos = stage.getPointerPosition();
        addPin(pos.x / w, pos.y / h, layer, w, h);
      });
    };
    image.src = img.previewUrl;
  }

  let seq = 0;
  let chooser = null;

  function addPin(xR, yR, layer, w, h) {
    const pin = { id: "p" + ++seq, num: pins.length + 1, label: null, xR, yR };
    const g = new konvaRef.Group({ x: xR * w, y: yR * h, draggable: true });
    g.add(
      new konvaRef.Circle({
        radius: 15,
        fill: "#C4623A",
        stroke: "#fff",
        strokeWidth: 2.5,
        shadowColor: "rgba(0,0,0,0.4)",
        shadowBlur: 6,
      }),
      new konvaRef.Text({
        text: String(pin.num),
        fontSize: 14,
        fontStyle: "bold",
        fill: "#fff",
        x: -5,
        y: -7,
      }),
    );
    g.on("dragend", () => {
      pin.xR = g.x() / w;
      pin.yR = g.y() / h;
    });
    g.on("click tap", (e) => {
      e.cancelBubble = true;
      openChooser(pin, g);
    });
    layer.add(g);
    pin.node = g;
    pins.push(pin);
    openChooser(pin, g);
    sync();
  }

  function openChooser(pin, node) {
    chooser?.remove();
    chooser = el("div", { class: "pin-chooser" });
    for (const label of LABELS) {
      chooser.append(
        el(
          "button",
          {
            class: "chip" + (pin.label === label ? " selected" : ""),
            type: "button",
            onclick: () => {
              pin.label = label;
              chooser.remove();
              chooser = null;
              sync();
            },
          },
          label,
        ),
      );
    }
    chooser.append(
      el(
        "button",
        {
          class: "chip pin-del",
          type: "button",
          onclick: () => {
            pin.node.destroy();
            pins.splice(pins.indexOf(pin), 1);
            pins.forEach((p, i) => {
              p.num = i + 1;
              p.node.findOne("Text").text(String(p.num));
            });
            pin.node.getLayer()?.batchDraw();
            chooser.remove();
            chooser = null;
            sync();
          },
        },
        "מחיקה ✕",
      ),
    );
    canvasBox.append(chooser);
  }

  function sync() {
    doneBtn.disabled = pins.filter((p) => p.label).length === 0;
  }

  doneBtn.addEventListener("click", async () => {
    doneBtn.disabled = true;
    const labeled = pins.filter((p) => p.label);
    state.zones = labeled.map((p) => `${p.num} ${p.label}`).join(" · ");
    try {
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/jpeg", quality: 0.85 });
      const blob = await (await fetch(dataUrl)).blob();
      state.zonesSnapshotUrl = await uploadReadyBlob(blob, "zones.jpg", "image/jpeg");
    } catch (e) {
      /* snapshot לא חובה */
    }
    track("quiz_step", { flow: state.flow, step_id: step.id, answer: state.zones });
    ctx.setValue(state.zones, { silent: true });
    ctx.save();
    ctx.next();
  });

  root.append(el("div", { class: "q-actions" }, doneBtn, skipLink(step, ctx)));
  return root;
}
