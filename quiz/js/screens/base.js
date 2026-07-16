// עוזרי DOM משותפים לכל המסכים.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

// שלד מסך: כותרת (מקבלת פוקוס) + תת-כותרת + גוף.
export function shell(step) {
  const root = el("div", { class: "q-step" });
  const title = el("h1", { class: "q-title", tabindex: "-1" }, step.title || "");
  root.append(title);
  if (step.subtitle) root.append(el("p", { class: "q-subtitle" }, step.subtitle));
  return { root, title };
}

export function skipLink(step, ctx) {
  return el(
    "button",
    {
      class: "q-skip",
      type: "button",
      onclick: () => {
        ctx.trackSkip();
        ctx.setValue(null, { silent: true });
        ctx.next();
      },
    },
    step.skipLabel || "לא בטוח/ה, דלגו",
  );
}

export function continueBtn(label = "המשך") {
  return el("button", { class: "btn-primary", type: "button", disabled: true }, label);
}
