// ליבת הדיזיינר: במה, צורה, גריד, אלמנטים, בחירה, undo. הכול במטרים — פיקסלים רק בציור.
import { byType } from "./palette.js";

const COLORS = {
  shapeFill: "#FFFFFF",
  shapeStroke: "#1B3024",
  grid: "#F0F0EC",
  dim: "#5c5c5c",
  existingStroke: "#8a8a86",
  desiredFillPlant: "#EAF2EA",
  desiredStrokePlant: "#253D2C",
  desiredFillBuilt: "#FAF0EB",
  desiredStrokeBuilt: "#C4623A",
  selected: "#C4623A",
};

const PLANT_SCOPES = new Set(["planting", "trees", "lawn", "pots"]);

export function shapeAreaM2(shape) {
  let a = shape.widthM * shape.depthM;
  if (shape.type === "L" && shape.cut) a -= shape.cut.widthM * shape.cut.depthM;
  return Math.max(1, Math.round(a));
}

function shapePointsM(shape) {
  const { widthM: w, depthM: d } = shape;
  if (shape.type !== "L" || !shape.cut) {
    return [
      [0, 0],
      [w, 0],
      [w, d],
      [0, d],
    ];
  }
  const cw = Math.min(shape.cut.widthM, w - 0.5);
  const cd = Math.min(shape.cut.depthM, d - 0.5);
  switch (shape.cut.corner) {
    case "tr":
      return [
        [0, 0],
        [w - cw, 0],
        [w - cw, cd],
        [w, cd],
        [w, d],
        [0, d],
      ];
    case "br":
      return [
        [0, 0],
        [w, 0],
        [w, d - cd],
        [w - cw, d - cd],
        [w - cw, d],
        [0, d],
      ];
    case "bl":
      return [
        [0, 0],
        [w, 0],
        [w, d],
        [cw, d],
        [cw, d - cd],
        [0, d - cd],
      ];
    default: // tl
      return [
        [cw, 0],
        [w, 0],
        [w, d],
        [0, d],
        [0, cd],
        [cw, cd],
      ];
  }
}

let elSeq = 0;

export function createDesigner(Konva, container, callbacks = {}) {
  const D = {
    shape: { type: "rect", widthM: 4, depthM: 2.5, cut: { corner: "tl", widthM: 1.5, depthM: 1 } },
    elements: [], // {id, type, status, xM, yM, wM, hM, rotation}
    mode: "desired",
    selectedId: null,
    undoStack: [],
  };

  const stageH = Math.max(300, Math.min(520, Math.round(window.innerHeight * 0.5)));
  const stage = new Konva.Stage({ container, width: container.clientWidth, height: stageH });
  const gridLayer = new Konva.Layer({ listening: false });
  const shapeLayer = new Konva.Layer();
  const elLayer = new Konva.Layer();
  stage.add(gridLayer, shapeLayer, elLayer);

  let ppm = 40; // פיקסלים למטר
  let ox = 0;
  let oy = 0;
  const toPx = (m) => m * ppm;
  const X = (xM) => ox + toPx(xM);
  const Y = (yM) => oy + toPx(yM);

  function fit() {
    const w = stage.width();
    const h = stage.height();
    ppm = Math.min((w * 0.86) / D.shape.widthM, (h * 0.8) / D.shape.depthM);
    ox = (w - toPx(D.shape.widthM)) / 2;
    oy = (h - toPx(D.shape.depthM)) / 2 + 8;
  }

  function drawShape(animate = false) {
    fit();
    shapeLayer.destroyChildren();
    gridLayer.destroyChildren();
    const pts = shapePointsM(D.shape);
    const flat = pts.flatMap(([x, y]) => [X(x), Y(y)]);

    const poly = new Konva.Line({
      points: flat,
      closed: true,
      fill: COLORS.shapeFill,
      stroke: COLORS.shapeStroke,
      strokeWidth: 2,
      shadowColor: "rgba(0,0,0,0.10)",
      shadowBlur: 16,
      shadowOffsetY: 4,
    });
    shapeLayer.add(poly);

    // רקע לבן — כדי שה-snapshot לא ייצא שקוף
    gridLayer.add(
      new Konva.Rect({ x: 0, y: 0, width: stage.width(), height: stage.height(), fill: "#FFFFFF" }),
    );

    // גריד 0.5 מ׳ בתוך הצורה בלבד
    const clip = new Konva.Group({
      clipFunc: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
        ctx.closePath();
      },
    });
    for (let gx = 0.5; gx < D.shape.widthM; gx += 0.5) {
      clip.add(
        new Konva.Line({
          points: [X(gx), Y(0), X(gx), Y(D.shape.depthM)],
          stroke: COLORS.grid,
          strokeWidth: 1,
        }),
      );
    }
    for (let gy = 0.5; gy < D.shape.depthM; gy += 0.5) {
      clip.add(
        new Konva.Line({
          points: [X(0), Y(gy), X(D.shape.widthM), Y(gy)],
          stroke: COLORS.grid,
          strokeWidth: 1,
        }),
      );
    }
    gridLayer.add(clip);

    // תוויות מידה
    const dimStyle = { fontSize: 13, fontFamily: "Alef, sans-serif", fill: COLORS.dim };
    const wLabel = new Konva.Text({ ...dimStyle, text: `${D.shape.widthM} מ׳` });
    wLabel.position({ x: X(D.shape.widthM / 2) - wLabel.width() / 2, y: oy - 22 });
    const dLabel = new Konva.Text({ ...dimStyle, text: `${D.shape.depthM} מ׳` });
    dLabel.position({ x: X(D.shape.widthM) + 8, y: Y(D.shape.depthM / 2) - 7 });
    shapeLayer.add(wLabel, dLabel);

    // טאפ על הרקע — ביטול בחירה
    poly.on("click tap", () => select(null));

    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // הנקודות בקואורדינטות אבסולוטיות — מזיזים רק שקיפות, בלי offset (מזיז את הצורה)
      poly.opacity(0);
      new Konva.Tween({
        node: poly,
        opacity: 1,
        duration: 0.4,
        easing: Konva.Easings.EaseOut,
      }).play();
    }
    redrawElements();
  }

  // ---- אלמנטים ----
  function styleFor(el, item) {
    if (el.status === "existing") {
      return { fill: "rgba(255,255,255,0.4)", stroke: COLORS.existingStroke, dash: [6, 4] };
    }
    const plant = item.scope && PLANT_SCOPES.has(item.scope);
    return plant
      ? { fill: COLORS.desiredFillPlant, stroke: COLORS.desiredStrokePlant, dash: undefined }
      : { fill: COLORS.desiredFillBuilt, stroke: COLORS.desiredStrokeBuilt, dash: undefined };
  }

  function clampM(el, xM, yM) {
    return {
      xM: Math.min(Math.max(0, xM), Math.max(0, D.shape.widthM - el.wM)),
      yM: Math.min(Math.max(0, yM), Math.max(0, D.shape.depthM - el.hM)),
    };
  }

  function buildNode(el) {
    const item = byType(el.type);
    const wPx = toPx(el.wM);
    const hPx = toPx(el.hM);
    const g = new Konva.Group({
      x: X(el.xM) + wPx / 2,
      y: Y(el.yM) + hPx / 2,
      offset: { x: wPx / 2, y: hPx / 2 },
      rotation: el.rotation || 0,
      draggable: true,
      id: el.id,
    });
    const st = styleFor(el, item);
    const rect = new Konva.Rect({
      width: wPx,
      height: hPx,
      cornerRadius: Math.min(8, wPx / 4),
      fill: st.fill,
      stroke: st.stroke,
      dash: st.dash,
      strokeWidth: el.id === D.selectedId ? 3 : 1.5,
      name: "body",
    });
    g.add(rect);
    const emSize = Math.max(13, Math.min(30, Math.min(wPx, hPx) * 0.5));
    const em = new Konva.Text({ text: item.em, fontSize: emSize, listening: false });
    em.position({ x: wPx / 2 - em.width() / 2, y: hPx / 2 - em.height() / 2 - (hPx > 46 ? 7 : 0) });
    g.add(em);
    if (hPx > 46 && wPx > 54) {
      const lb = new Konva.Text({
        text: item.label,
        fontSize: 11,
        fontFamily: "Alef, sans-serif",
        fill: "#444",
        listening: false,
        width: wPx,
        align: "center",
      });
      lb.position({ x: 0, y: hPx / 2 + emSize / 2 - 4 });
      g.add(lb);
    }
    if (el.id === D.selectedId) {
      rect.shadowColor(COLORS.selected);
      rect.shadowBlur(12);
      rect.stroke(COLORS.selected);
    }

    g.dragBoundFunc(function (pos) {
      // clamp למלבן החוסם של הצורה (במכוון bbox — פשטות לפני שלמות)
      const minX = ox + wPx / 2;
      const maxX = ox + toPx(D.shape.widthM) - wPx / 2;
      const minY = oy + hPx / 2;
      const maxY = oy + toPx(D.shape.depthM) - hPx / 2;
      return {
        x: Math.min(Math.max(pos.x, minX), Math.max(minX, maxX)),
        y: Math.min(Math.max(pos.y, minY), Math.max(minY, maxY)),
      };
    });
    g.on("dragstart", () => select(el.id, { silentBar: true }));
    g.on("dragend", () => {
      pushUndo();
      const c = clampM(el, (g.x() - wPx / 2 - ox) / ppm, (g.y() - hPx / 2 - oy) / ppm);
      el.xM = Math.round(c.xM * 4) / 4;
      el.yM = Math.round(c.yM * 4) / 4;
      select(el.id);
      notify();
    });
    g.on("click tap", (e) => {
      e.cancelBubble = true;
      select(el.id);
    });
    return g;
  }

  function redrawElements() {
    elLayer.destroyChildren();
    const floors = D.elements.filter((e) => byType(e.type).floor);
    const rest = D.elements.filter((e) => !byType(e.type).floor);
    for (const el of [...floors, ...rest]) elLayer.add(buildNode(el));
    callbacks.onElements && callbacks.onElements(D.elements.length);
  }

  function select(id, opts = {}) {
    D.selectedId = id;
    redrawElements();
    if (!opts.silentBar)
      callbacks.onSelect && callbacks.onSelect(id ? D.elements.find((e) => e.id === id) : null);
  }

  function notify() {
    callbacks.onChange && callbacks.onChange();
  }

  // ---- undo ----
  function pushUndo() {
    D.undoStack.push(JSON.stringify(D.elements));
    if (D.undoStack.length > 20) D.undoStack.shift();
    callbacks.onUndoState && callbacks.onUndoState(true);
  }

  const api = {
    D,
    stage,
    setShape(patch, animate = false) {
      Object.assign(D.shape, patch);
      // אלמנטים שנשארו מחוץ לצורה החדשה — מהודקים פנימה
      for (const el of D.elements) Object.assign(el, clampM(el, el.xM, el.yM));
      drawShape(animate);
      callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      notify();
    },
    setMode(mode) {
      D.mode = mode;
    },
    addElement(type) {
      const item = byType(type);
      pushUndo();
      const status = D.mode;
      const el = {
        id: "e" + ++elSeq,
        type,
        status,
        wM: Math.min(item.w, D.shape.widthM),
        hM: Math.min(item.h, D.shape.depthM),
        rotation: 0,
      };
      const c = clampM(
        el,
        D.shape.widthM / 2 - el.wM / 2 + (Math.random() - 0.5) * 0.5,
        D.shape.depthM / 2 - el.hM / 2 + (Math.random() - 0.5) * 0.5,
      );
      el.xM = Math.round(c.xM * 4) / 4;
      el.yM = Math.round(c.yM * 4) / 4;
      D.elements.push(el);
      select(el.id);
      // pop כניסה
      const node = elLayer.findOne("#" + el.id);
      if (node) {
        node.scale({ x: 0.6, y: 0.6 });
        new Konva.Tween({
          node,
          scaleX: 1,
          scaleY: 1,
          duration: 0.18,
          easing: Konva.Easings.BackEaseOut,
        }).play();
      }
      notify();
      return el;
    },
    mutateSelected(fn) {
      const el = D.elements.find((e) => e.id === D.selectedId);
      if (!el) return;
      pushUndo();
      fn(el);
      Object.assign(el, clampM(el, el.xM, el.yM));
      redrawElements();
      callbacks.onSelect && callbacks.onSelect(el);
      notify();
    },
    duplicateSelected() {
      const el = D.elements.find((e) => e.id === D.selectedId);
      if (!el) return;
      pushUndo();
      const copy = { ...el, id: "e" + ++elSeq };
      const c = clampM(copy, copy.xM + 0.5, copy.yM + 0.5);
      copy.xM = c.xM;
      copy.yM = c.yM;
      D.elements.push(copy);
      select(copy.id);
      notify();
    },
    deleteSelected() {
      if (!D.selectedId) return;
      pushUndo();
      D.elements = D.elements.filter((e) => e.id !== D.selectedId);
      select(null);
      notify();
    },
    undo() {
      const prev = D.undoStack.pop();
      if (prev === undefined) return;
      D.elements = JSON.parse(prev);
      D.selectedId = null;
      redrawElements();
      callbacks.onSelect && callbacks.onSelect(null);
      callbacks.onUndoState && callbacks.onUndoState(D.undoStack.length > 0);
      notify();
    },
    canUndo: () => D.undoStack.length > 0,
    deselect: () => select(null),
    areaM2: () => shapeAreaM2(D.shape),
    async snapshotBlob() {
      select(null);
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      const blob = await (await fetch(dataUrl)).blob();
      return { dataUrl, blob };
    },
    destroy() {
      stage.destroy();
    },
  };

  drawShape(true);
  return api;
}
