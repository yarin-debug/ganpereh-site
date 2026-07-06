// ליבת הדיזיינר: במה, צורה (מלבן/ר/חופשית), גריד, אלמנטים (מלבן/עיגול),
// שינוי גודל בידיות (Transformer), עריכת פינות, undo. הכול במטרים — פיקסלים רק בציור.
import { itemFor } from "./palette.js";

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
const snapQ = (m) => Math.round(m * 4) / 4; // רשת 0.25 מ׳

// שטח פוליגון (shoelace); נקודות [[x,y],...]
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function bboxOf(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export function shapePointsM(shape) {
  if (shape.type === "free" && Array.isArray(shape.pointsM)) return shape.pointsM;
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

export function shapeAreaM2(shape) {
  return Math.max(1, Math.round(polyArea(shapePointsM(shape))));
}

let elSeq = 0;

export function createDesigner(Konva, container, callbacks = {}) {
  const D = {
    shape: { type: "rect", widthM: 4, depthM: 2.5, cut: { corner: "tl", widthM: 1.5, depthM: 1 } },
    elements: [], // {id, type, status, xM, yM, wM, hM, rotation, customLabel?, customRound?}
    mode: "desired",
    selectedId: null,
    undoStack: [],
  };

  const stageH = Math.max(300, Math.min(520, Math.round(window.innerHeight * 0.5)));
  const stage = new Konva.Stage({ container, width: container.clientWidth, height: stageH });
  const gridLayer = new Konva.Layer({ listening: false });
  const shapeLayer = new Konva.Layer();
  const elLayer = new Konva.Layer();
  const editLayer = new Konva.Layer(); // ידיות פינות בעריכת צורה חופשית
  stage.add(gridLayer, shapeLayer, elLayer, editLayer);

  // לחיצה על שטח ריק בקנבס (לא על פריט/צורה) → ביטול בחירה
  stage.on("click tap", (e) => {
    if (e.target === stage) select(null);
  });

  // לחיצה בכל מקום בדף מחוץ ללוח ההעמדה → ביטול בחירה (לוח נקי).
  // הפעולות של הפריט (פס הפעולות, undo) נמצאות בתוך .dz-canvas ולכן לא מבטלות.
  const outsideClick = (ev) => {
    if (!document.body.contains(container)) {
      document.removeEventListener("pointerdown", outsideClick, true);
      return;
    }
    if (D.selectedId && !ev.target.closest(".dz-canvas")) select(null);
  };
  document.addEventListener("pointerdown", outsideClick, true);

  let ppm = 40; // פיקסלים למטר
  let ox = 0;
  let oy = 0;
  let freezeFit = false; // בעריכת פינות — לא מכיילים מחדש כדי שהידיות לא יקפצו
  let world = null; // גבולות העולם (במטרים) בזמן עריכה חופשית
  const toPx = (m) => m * ppm;
  const X = (xM) => ox + toPx(xM);
  const Y = (yM) => oy + toPx(yM);
  const fromX = (px) => (px - ox) / ppm;
  const fromY = (px) => (px - oy) / ppm;

  function shapeBBox() {
    return bboxOf(shapePointsM(D.shape));
  }

  function fit() {
    if (freezeFit) return;
    const w = stage.width();
    const h = stage.height();
    const bb = shapeBBox();
    const bw = Math.max(1, bb.x1 - bb.x0);
    const bh = Math.max(1, bb.y1 - bb.y0);
    ppm = Math.min((w * 0.86) / bw, (h * 0.8) / bh);
    ox = (w - toPx(bw)) / 2 - toPx(bb.x0);
    oy = (h - toPx(bh)) / 2 + 8 - toPx(bb.y0);
  }

  // ---- Transformer: שינוי גודל בידיות, כמו בתוכנת עיצוב ----
  const tr = new Konva.Transformer({
    rotateEnabled: true, // ידית סיבוב חופשית 360° (כמו בתוכנת עיצוב); מוסתרת לעיגולים
    rotateAnchorOffset: 22,
    rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315], // "נעילה" קלה לזוויות נקיות
    rotationSnapTolerance: 7,
    flipEnabled: false,
    anchorSize: 11, // עדין — לא בולט מדי (היה 18)
    anchorCornerRadius: 5.5,
    anchorStroke: COLORS.selected,
    anchorStrokeWidth: 1.5,
    anchorFill: "#fff",
    borderStroke: COLORS.selected,
    borderStrokeWidth: 1.5,
    borderDash: [3, 3],
    padding: 3,
    ignoreStroke: true,
    boundBoxFunc: (oldBox, newBox) => {
      const min = toPx(0.25);
      if (newBox.width < min || newBox.height < min) return oldBox;
      return newBox;
    },
  });
  elLayer.add(tr);

  function attachTransformer() {
    const el = D.elements.find((e) => e.id === D.selectedId);
    const node = el && elLayer.findOne("#" + el.id);
    if (!el || !node) {
      tr.nodes([]);
      elLayer.batchDraw();
      return;
    }
    const round = !!itemFor(el).round;
    tr.keepRatio(round);
    tr.rotateEnabled(!round); // סיבוב עיגול חסר משמעות
    tr.enabledAnchors(
      round
        ? ["top-left", "top-right", "bottom-left", "bottom-right"]
        : [
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ],
    );
    tr.nodes([node]);
    tr.moveToTop();
    elLayer.batchDraw();
    elLayer.drawHit(); // ידיות ה-Transformer חייבות hit מפורש
  }

  function drawShape(animate = false) {
    fit();
    shapeLayer.destroyChildren();
    gridLayer.destroyChildren();
    const pts = shapePointsM(D.shape);
    const flat = pts.flatMap(([x, y]) => [X(x), Y(y)]);
    const bb = bboxOf(pts);

    // רקע לבן — כדי שה-snapshot לא ייצא שקוף
    gridLayer.add(
      new Konva.Rect({ x: 0, y: 0, width: stage.width(), height: stage.height(), fill: "#FFFFFF" }),
    );

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

    // גריד 0.5 מ׳ בתוך הצורה בלבד
    const clip = new Konva.Group({
      clipFunc: (ctx) => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
        ctx.closePath();
      },
    });
    for (let gx = Math.ceil(bb.x0 * 2) / 2; gx <= bb.x1; gx += 0.5) {
      clip.add(
        new Konva.Line({
          points: [X(gx), Y(bb.y0), X(gx), Y(bb.y1)],
          stroke: COLORS.grid,
          strokeWidth: 1,
        }),
      );
    }
    for (let gy = Math.ceil(bb.y0 * 2) / 2; gy <= bb.y1; gy += 0.5) {
      clip.add(
        new Konva.Line({
          points: [X(bb.x0), Y(gy), X(bb.x1), Y(gy)],
          stroke: COLORS.grid,
          strokeWidth: 1,
        }),
      );
    }
    gridLayer.add(clip);

    // תוויות מידה (לא בצורה חופשית — שם השטח מוצג מתחת)
    if (D.shape.type !== "free") {
      const dimStyle = { fontSize: 13, fontFamily: "Alef, sans-serif", fill: COLORS.dim };
      const wLabel = new Konva.Text({ ...dimStyle, text: `${D.shape.widthM} מ׳` });
      wLabel.position({ x: X((bb.x0 + bb.x1) / 2) - wLabel.width() / 2, y: Y(bb.y0) - 22 });
      const dLabel = new Konva.Text({ ...dimStyle, text: `${D.shape.depthM} מ׳` });
      dLabel.position({ x: X(bb.x1) + 8, y: Y((bb.y0 + bb.y1) / 2) - 7 });
      shapeLayer.add(wLabel, dLabel);
    }

    // טאפ על הרקע — ביטול בחירה
    poly.on("click tap", () => select(null));

    if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      poly.opacity(0);
      new Konva.Tween({
        node: poly,
        opacity: 1,
        duration: 0.4,
        easing: Konva.Easings.EaseOut,
        // אנימציות Konva מציירות רק את שכבת התצוגה — בלי זה מפת הפגיעות נשארת ריקה
        onFinish: () => shapeLayer.drawHit(),
      }).play();
    }
    shapeLayer.drawHit(); // הרקע מאזין ל"טאפ מבטל בחירה"
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

  // מגבילים את *מרכז* הפריט ל-bbox של הצורה (במקום את כל התיבה). כך:
  // (1) פריטים חורגים קצת מהמסגרת — עד חצי מהם בחוץ (עץ שיוצא מהפינה);
  // (2) פריטים מסובבים מגיעים לפינה (המרכז יכול להגיע לקצה);
  // (3) שום פריט לא "בורח" — המרכז תמיד בתוך הצורה.
  function clampM(el, xM, yM) {
    const bb = shapeBBox();
    const cx = Math.min(Math.max(bb.x0, xM + el.wM / 2), bb.x1);
    const cy = Math.min(Math.max(bb.y0, yM + el.hM / 2), bb.y1);
    return { xM: cx - el.wM / 2, yM: cy - el.hM / 2 };
  }

  // חפיפה משמעותית בין שני פריטים (AABB במטרים; סף 0.15מ׳ כדי שפריטים
  // צמודים בקושי לא ייחשבו). מתעלם מסיבוב — מספיק לרמז ויזואלי.
  function elementsOverlap(a, b) {
    const ox = Math.min(a.xM + a.wM, b.xM + b.wM) - Math.max(a.xM, b.xM);
    const oy = Math.min(a.yM + a.hM, b.yM + b.hM) - Math.max(a.yM, b.yM);
    return ox > 0.15 && oy > 0.15;
  }

  // פריט ששוכב מעל פריט שצויר לפניו (מתחתיו) → מזהה id שלו לשקיפות
  function overlapSet() {
    const floors = D.elements.filter((e) => itemFor(e).floor);
    const rest = D.elements.filter((e) => !itemFor(e).floor);
    const ordered = [...floors, ...rest];
    const set = new Set();
    for (let i = 0; i < ordered.length; i++) {
      for (let j = 0; j < i; j++) {
        if (elementsOverlap(ordered[i], ordered[j])) {
          set.add(ordered[i].id);
          break;
        }
      }
    }
    return set;
  }

  // גוף הפריט העליון נעשה חצי-שקוף כדי לראות מה מתחתיו; האימוג'י והתווית
  // (צמתים נפרדים) נשארים אטומים לגמרי.
  function applyOverlap() {
    const set = overlapSet();
    for (const el of D.elements) {
      const node = elLayer.findOne("#" + el.id);
      const body = node && node.findOne(".body");
      if (body) body.opacity(set.has(el.id) ? 0.5 : 1);
    }
  }

  function buildNode(el) {
    const item = itemFor(el);
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
    const body = item.round
      ? new Konva.Circle({
          x: wPx / 2,
          y: hPx / 2,
          radius: wPx / 2,
          fill: st.fill,
          stroke: st.stroke,
          dash: st.dash,
          strokeWidth: el.id === D.selectedId ? 3 : 1.5,
          name: "body",
        })
      : new Konva.Rect({
          width: wPx,
          height: hPx,
          cornerRadius: Math.min(8, wPx / 4),
          fill: st.fill,
          stroke: st.stroke,
          dash: st.dash,
          strokeWidth: el.id === D.selectedId ? 3 : 1.5,
          name: "body",
        });
    g.add(body);

    const isCustom = el.type === "custom";
    const emSize = Math.max(13, Math.min(30, Math.min(wPx, hPx) * 0.5));
    if (!isCustom) {
      const em = new Konva.Text({ text: item.em, fontSize: emSize, listening: false });
      em.position({
        x: wPx / 2 - em.width() / 2,
        y: hPx / 2 - em.height() / 2 - (hPx > 46 ? 7 : 0),
      });
      g.add(em);
    }
    if (isCustom || (hPx > 46 && wPx > 54)) {
      const lb = new Konva.Text({
        text: item.label,
        fontSize: isCustom ? Math.max(11, Math.min(14, wPx / 7)) : 11,
        fontFamily: "Alef, sans-serif",
        fill: "#444",
        listening: false,
        width: wPx,
        align: "center",
      });
      lb.position({ x: 0, y: isCustom ? hPx / 2 - lb.height() / 2 : hPx / 2 + emSize / 2 - 4 });
      g.add(lb);
    }
    if (el.id === D.selectedId) {
      body.shadowColor(COLORS.selected);
      body.shadowBlur(6);
      body.stroke(COLORS.selected);
    }

    g.dragBoundFunc(function (pos) {
      // pos = מיקום המרכז (offset במרכז). מגבילים את המרכז ל-bbox — מאפשר חריגה
      // מבוקרת מהמסגרת והגעה לפינות (כולל פריטים מסובבים).
      const bb = shapeBBox();
      return {
        x: Math.min(Math.max(pos.x, X(bb.x0)), X(bb.x1)),
        y: Math.min(Math.max(pos.y, Y(bb.y0)), Y(bb.y1)),
      };
    });
    // בזמן גרירה אסור לבנות את השכבה מחדש — עדכון בחירה בעיצוב-במקום בלבד.
    g.on("dragstart", () => select(el.id, { silentBar: true, inPlace: true }));
    g.on("dragend", () => {
      pushUndo();
      const c = clampM(el, fromX(g.x()) - el.wM / 2, fromY(g.y()) - el.hM / 2);
      el.xM = snapQ(c.xM);
      el.yM = snapQ(c.yM);
      g.position({ x: X(el.xM) + wPx / 2, y: Y(el.yM) + hPx / 2 });
      select(el.id, { inPlace: true });
      elLayer.batchDraw();
      notify();
    });
    // סיום שינוי גודל/סיבוב בידיות: שומרים סיבוב, ממירים scale למטרים, בונים נקי
    g.on("transformend", () => {
      pushUndo();
      const item2 = itemFor(el);
      const sX = g.scaleX();
      const sY = g.scaleY();
      g.scale({ x: 1, y: 1 });
      el.rotation = Math.round(g.rotation()); // סיבוב חופשי 360° מהידית
      const bb = shapeBBox();
      // תקרה נדיבה (2מ׳ מעבר לצורה) — כדי שעץ גדול יוכל לחרוג מהמסגרת
      const maxW = bb.x1 - bb.x0 + 2;
      const maxH = bb.y1 - bb.y0 + 2;
      el.wM = Math.min(Math.max(0.25, snapQ(el.wM * sX)), maxW);
      el.hM = item2.round ? el.wM : Math.min(Math.max(0.25, snapQ(el.hM * sY)), maxH);
      // המרכז נשמר בסקיילינג סביב offset — מחשבים xM/yM מחדש מהמרכז
      const c = clampM(el, fromX(g.x()) - el.wM / 2, fromY(g.y()) - el.hM / 2);
      el.xM = snapQ(c.xM);
      el.yM = snapQ(c.yM);
      redrawElements();
      attachTransformer();
      callbacks.onSelect && callbacks.onSelect(el);
      notify();
    });
    g.on("click tap", (e) => {
      e.cancelBubble = true;
      select(el.id, { inPlace: true });
    });
    return g;
  }

  function redrawElements() {
    tr.nodes([]);
    // לא הורסים את ה-Transformer עצמו — מוציאים אותו, בונים, מחזירים
    tr.remove();
    elLayer.destroyChildren();
    const floors = D.elements.filter((e) => itemFor(e).floor);
    const rest = D.elements.filter((e) => !itemFor(e).floor);
    for (const el of [...floors, ...rest]) elLayer.add(buildNode(el));
    applyOverlap();
    elLayer.add(tr);
    if (D.selectedId) attachTransformer();
    elLayer.drawHit(); // ציור מפורש — batchDraw עלול להיבלע ע"י אנימציה פעילה
    callbacks.onElements && callbacks.onElements(D.elements.length);
  }

  // עדכון עיצוב הבחירה על הצמתים הקיימים — בלי להרוס/לבנות (בטוח גם באמצע גרירה)
  function applySelection() {
    for (const el of D.elements) {
      const node = elLayer.findOne("#" + el.id);
      if (!node) continue;
      const body = node.findOne(".body");
      if (!body) continue;
      if (el.id === D.selectedId) {
        body.stroke(COLORS.selected);
        body.strokeWidth(3);
        body.shadowColor(COLORS.selected);
        body.shadowBlur(6);
      } else {
        body.stroke(styleFor(el, itemFor(el)).stroke);
        body.strokeWidth(1.5);
        body.shadowBlur(0);
      }
    }
    applyOverlap(); // גרירה משנה חפיפות — מעדכנים שקיפות בלי בנייה מחדש
    attachTransformer();
    elLayer.batchDraw();
  }

  function select(id, opts = {}) {
    D.selectedId = id;
    if (opts.inPlace) applySelection();
    else redrawElements();
    if (!opts.silentBar)
      callbacks.onSelect && callbacks.onSelect(id ? D.elements.find((e) => e.id === id) : null);
  }

  function notify() {
    callbacks.onChange && callbacks.onChange();
  }

  // ---- עריכת פינות (צורה חופשית) ----
  function paintVertexHandles() {
    editLayer.destroyChildren();
    if (D.shape.type !== "free") {
      editLayer.batchDraw();
      return;
    }
    const pts = D.shape.pointsM;

    // נקודות אמצע — הקשה מוסיפה פינה חדשה
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const mid = new Konva.Circle({
        x: X(mx),
        y: Y(my),
        radius: 9,
        fill: "#FFFFFF",
        stroke: COLORS.existingStroke,
        strokeWidth: 1.5,
        dash: [3, 2],
      });
      mid.on("click tap", (e) => {
        e.cancelBubble = true;
        pushUndo();
        pts.splice(i + 1, 0, [snapQ(mx), snapQ(my)]);
        drawShape();
        paintVertexHandles();
        callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      });
      editLayer.add(mid);
    });

    // פינות — גרירה משנה את הצורה, הקשה כפולה מוחקת
    pts.forEach((p, i) => {
      const h = new Konva.Circle({
        x: X(p[0]),
        y: Y(p[1]),
        radius: 12,
        fill: COLORS.selected,
        stroke: "#fff",
        strokeWidth: 2.5,
        draggable: true,
        shadowColor: "rgba(0,0,0,0.3)",
        shadowBlur: 5,
      });
      h.on("dragmove", () => {
        const xM = Math.min(Math.max(world.x0, fromX(h.x())), world.x1);
        const yM = Math.min(Math.max(world.y0, fromY(h.y())), world.y1);
        pts[i] = [snapQ(xM), snapQ(yM)];
        h.position({ x: X(pts[i][0]), y: Y(pts[i][1]) });
        drawShape(); // fit קפוא — הצורה מתעדכנת חיה בלי שהידיות קופצות
        callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      });
      h.on("dragstart", () => pushUndoShape());
      h.on("dragend", () => paintVertexHandles());
      h.on("dblclick dbltap", () => {
        if (pts.length <= 3) return;
        pushUndoShape();
        pts.splice(i, 1);
        drawShape();
        paintVertexHandles();
        callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      });
      editLayer.add(h);
    });
    editLayer.batchDraw();
    editLayer.drawHit(); // בלי זה ידיות הפינות לא מגיבות למגע
  }

  function pushUndoShape() {
    // undo של עריכת צורה — נשמר באותו מנגנון (מחסנית אחת, פשוט)
    D.undoStack.push(JSON.stringify({ __shape: D.shape, els: D.elements }));
    if (D.undoStack.length > 20) D.undoStack.shift();
    callbacks.onUndoState && callbacks.onUndoState(true);
  }

  function enterFreeEdit() {
    // עולם קפוא: הצורה הנוכחית + שוליים של 1.5מ׳ להתרחבות
    if (D.shape.type !== "free") {
      D.shape = { type: "free", pointsM: shapePointsM(D.shape).map((p) => [...p]) };
    }
    const bb = shapeBBox();
    // קואורדינטות שליליות מותרות — המטרים יחסיים, אין קדושה ב-(0,0)
    world = {
      x0: bb.x0 - 1.5,
      y0: bb.y0 - 1.5,
      x1: bb.x1 + 1.5,
      y1: bb.y1 + 1.5,
    };
    // fit חד-פעמי על העולם המורחב, ואז הקפאה
    freezeFit = false;
    const saved = D.shape;
    D.shape = {
      type: "free",
      pointsM: [
        [world.x0, world.y0],
        [world.x1, world.y0],
        [world.x1, world.y1],
        [world.x0, world.y1],
      ],
    };
    fit();
    D.shape = saved;
    freezeFit = true;
    drawShape();
    paintVertexHandles();
    callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
  }

  function exitFreeEdit() {
    freezeFit = false;
    editLayer.destroyChildren();
    editLayer.batchDraw();
    // הידוק כל האלמנטים לצורה החדשה
    for (const el of D.elements) Object.assign(el, clampM(el, el.xM, el.yM));
    drawShape();
  }

  // ---- undo ----
  function pushUndo() {
    D.undoStack.push(JSON.stringify({ els: D.elements }));
    if (D.undoStack.length > 20) D.undoStack.shift();
    callbacks.onUndoState && callbacks.onUndoState(true);
  }

  const api = {
    D,
    stage,
    setShape(patch, animate = false) {
      Object.assign(D.shape, patch);
      for (const el of D.elements) Object.assign(el, clampM(el, el.xM, el.yM));
      drawShape(animate);
      paintVertexHandles();
      callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      notify();
    },
    enterFreeEdit,
    exitFreeEdit,
    setMode(mode) {
      D.mode = mode;
    },
    addElement(type, custom) {
      const proto = custom
        ? { w: custom.round ? 1 : 1.2, h: custom.round ? 1 : 0.8 }
        : itemFor({ type });
      pushUndo();
      const bb = shapeBBox();
      const el = {
        id: "e" + ++elSeq,
        type,
        status: D.mode,
        wM: Math.min(proto.w, bb.x1 - bb.x0),
        hM: Math.min(proto.h, bb.y1 - bb.y0),
        rotation: 0,
        ...(custom ? { customLabel: custom.label, customRound: !!custom.round } : {}),
      };
      const cx = (bb.x0 + bb.x1) / 2 - el.wM / 2 + (Math.random() - 0.5) * 0.5;
      const cy = (bb.y0 + bb.y1) / 2 - el.hM / 2 + (Math.random() - 0.5) * 0.5;
      const c = clampM(el, cx, cy);
      el.xM = snapQ(c.xM);
      el.yM = snapQ(c.yM);
      D.elements.push(el);
      select(el.id);
      const node = elLayer.findOne("#" + el.id);
      if (node) {
        node.scale({ x: 0.6, y: 0.6 });
        new Konva.Tween({
          node,
          scaleX: 1,
          scaleY: 1,
          duration: 0.18,
          easing: Konva.Easings.BackEaseOut,
          // אנימציות Konva מציירות רק את שכבת התצוגה — חובה לצייר hit בסיום,
          // אחרת גרירה/בחירה "נתקעות" עד הציור הבא
          onFinish: () => elLayer.drawHit(),
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
      const data = JSON.parse(prev);
      D.elements = data.els;
      if (data.__shape) {
        D.shape = data.__shape;
        drawShape();
        paintVertexHandles();
        callbacks.onShape && callbacks.onShape(shapeAreaM2(D.shape));
      }
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
      editLayer.visible(false);
      const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      editLayer.visible(true);
      const blob = await (await fetch(dataUrl)).blob();
      return { dataUrl, blob };
    },
    destroy() {
      document.removeEventListener("pointerdown", outsideClick, true);
      stage.destroy();
    },
  };

  drawShape(true);
  return api;
}
