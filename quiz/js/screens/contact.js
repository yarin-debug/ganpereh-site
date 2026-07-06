// שער פרטים: שם + טלפון (ולידציית IL) + אימייל רשות + honeypot, ואז שליחה.
import { el, shell } from "./base.js";
import { sendLead } from "../submit.js";
import { track } from "../analytics.js";

// טלפון ישראלי: נייד/קווי, אחרי ניקוי רווחים ומקפים. +972 מנורמל ל-0.
export function normalizePhone(raw) {
  let p = (raw || "").replace(/[\s\-().]/g, "");
  if (p.startsWith("+972")) p = "0" + p.slice(4);
  else if (p.startsWith("972")) p = "0" + p.slice(3);
  return p;
}
export function isValidPhone(raw) {
  return /^0(5\d|[23489])\d{7}$/.test(normalizePhone(raw));
}
export function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

function field(labelText, inputAttrs, errorText) {
  const input = el("input", { class: "q-input", ...inputAttrs });
  const wrap = el(
    "div",
    { class: "q-field" },
    el("label", { for: inputAttrs.id }, labelText),
    input,
    el("p", { class: "q-error" }, errorText),
  );
  return { wrap, input };
}

export function render(step, ctx) {
  const { root } = shell(step);
  track("quiz_contact_view", { flow: ctx.state.flow });

  const name = field(
    "שם מלא",
    { id: "q-name", type: "text", autocomplete: "name", placeholder: "מה שמכם?" },
    "נשמח לשם — כדי שנדע למי לחזור",
  );
  const phone = field(
    "טלפון",
    {
      id: "q-phone",
      type: "tel",
      autocomplete: "tel",
      inputmode: "tel",
      placeholder: "050-0000000",
      dir: "ltr",
    },
    "המספר לא נראה תקין — בדקו רגע",
  );
  const email = field(
    "אימייל (רשות)",
    {
      id: "q-email",
      type: "email",
      autocomplete: "email",
      placeholder: "you@email.com",
      dir: "ltr",
    },
    "האימייל לא נראה תקין",
  );
  root.append(name.wrap, phone.wrap, email.wrap);

  let extra = null;
  if (step.extraField) {
    extra = field(step.extraField.label, { id: "q-extra", type: "text" }, "שדה חובה");
    root.append(extra.wrap);
  }

  // honeypot — בוטים ממלאים, בני אדם לא רואים
  const hp = el("input", {
    type: "text",
    name: "company",
    tabindex: "-1",
    autocomplete: "off",
    "aria-hidden": "true",
  });
  root.append(el("div", { class: "hp-field" }, hp));

  const btn = el(
    "button",
    { class: "btn-primary", type: "button" },
    step.cta || "שלחו לי את ההצעה ←",
  );
  const setErr = (f, on) => f.wrap.classList.toggle("has-error", on);

  btn.addEventListener("click", async () => {
    const okName = name.input.value.trim().length >= 2;
    const okPhone = isValidPhone(phone.input.value);
    const okEmail = !email.input.value.trim() || isValidEmail(email.input.value.trim());
    const okExtra =
      !step.extraField ||
      !step.extraField.required ||
      (extra && extra.input.value.trim().length >= 2);
    setErr(name, !okName);
    setErr(phone, !okPhone);
    setErr(email, !okEmail);
    if (extra) setErr(extra, !okExtra);
    if (!okName || !okPhone || !okEmail || !okExtra) {
      const firstBad = [
        okName ? null : name,
        okPhone ? null : phone,
        okEmail ? null : email,
        okExtra ? null : extra,
      ].find(Boolean);
      firstBad.input.focus();
      return;
    }

    btn.disabled = true;
    btn.innerHTML = "";
    btn.append("מכינים את הפרופיל ", el("span", { class: "q-dots" }, el("i"), el("i"), el("i")));

    const contact = {
      name: name.input.value.trim(),
      phone: normalizePhone(phone.input.value),
      email: email.input.value.trim(),
      extra: extra ? extra.input.value.trim() : "",
      honeypot: hp.value,
    };

    const res = await sendLead(ctx.state, contact);
    if (res.ok) {
      ctx.setValue(contact, { silent: true });
      ctx.state.submitted = true;
      ctx.next();
    } else {
      btn.disabled = false;
      btn.textContent = "נסו שוב ←";
      fail.hidden = false;
    }
  });

  const fail = el(
    "p",
    { class: "q-trust", hidden: true },
    "משהו השתבש בשליחה — אפשר לנסות שוב, או פשוט ",
    el(
      "a",
      {
        href: `https://wa.me/${step.waNumber || "972545525124"}`,
        target: "_blank",
        rel: "noopener",
        style: "color:var(--green-accent);font-weight:700",
      },
      "לכתוב לנו בוואטסאפ",
    ),
    ".",
  );

  root.append(
    el("div", { class: "q-actions" }, btn),
    fail,
    el("p", { class: "q-trust" }, "ההצעה מגיעה בוואטסאפ או בשיחה — בלי ספאם ובלי רשימות תפוצה."),
  );
  return root;
}
