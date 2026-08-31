// שער פרטים: שם + טלפון (ולידציית IL) + אימייל רשות + honeypot, ואז שליחה.
import { el, shell } from "./base.js";
import { sendLead } from "../submit.js";
import { beginSend, isSending } from "../pending-lead.js";
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
  // השגיאה מקושרת לשדה: בלי aria-describedby קורא-מסך מכריז "לא תקין"
  // ולא אומר מה בדיוק לתקן.
  const errId = inputAttrs.id + "-err";
  const input = el("input", {
    class: "q-input",
    "aria-describedby": errId,
    ...inputAttrs,
  });
  const err = el("p", { class: "q-error", id: errId }, errorText);
  const wrap = el(
    "div",
    { class: "q-field" },
    el("label", { for: inputAttrs.id }, labelText),
    input,
    err,
  );
  return { wrap, input };
}

export function render(step, ctx) {
  const { root } = shell(step);
  track("quiz_contact_view", { flow: ctx.state.flow });

  const name = field(
    "שם מלא",
    { id: "q-name", type: "text", autocomplete: "name", placeholder: "מה שמכם?" },
    "נשמח לשם, כדי שנדע למי לחזור",
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
    "המספר לא נראה תקין, בדקו רגע",
  );
  // בלי "(רשות)" בכוונה (הכרעת ירין 31.8): התווית הזו הורידה את שיעור
  // מילוי המייל, והמייל הוא הערוץ שבו הלקוח מקבל את סיכום הפרופיל.
  // הוולידציה עדיין מתירה להשאיר ריק — רק הפריים השתנה.
  const email = field(
    "אימייל",
    {
      id: "q-email",
      type: "email",
      autocomplete: "email",
      // במסלול המהיר אין פרופיל — הבטחה על מייל שלא יגיע שוברת אמון
      placeholder:
        ctx.state.flow === "quick" ? "כדי שנוכל לכתוב לכם גם במייל" : "לכאן נשלח את סיכום הפרופיל",
      dir: "ltr",
    },
    "האימייל לא נראה תקין",
  );
  root.append(name.wrap, phone.wrap, email.wrap);

  let extra = null;
  if (step.extraField) {
    extra = field(step.extraField.label, { id: "q-extra", type: "text" }, "נשמח לדעת גם את זה");
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

  const label = el("span", { class: "q-btn-label" }, step.cta || "סיימנו, חזרו אליי ←");
  const btn = el("button", { class: "btn-primary", type: "button" }, label);
  const dots = () => el("span", { class: "q-dots" }, el("i"), el("i"), el("i"));
  // החלפת תווית בהצלבה במקום בפריים אחד
  const setLabel = (...children) => {
    label.classList.add("swapping");
    ctx.after(140, () => {
      label.replaceChildren(...children);
      label.classList.remove("swapping");
    });
  };
  const setErr = (f, on) => {
    f.wrap.classList.toggle("has-error", on);
    f.input.setAttribute("aria-invalid", on ? "true" : "false");
  };

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

    // שליחה כפולה: לחיצה שנייה, או "חזרה" ממסך התוצאה ולחיצה שוב,
    // הייתה יוצרת ליד נוסף על אותו externalId.
    if (isSending() || ctx.state.submitted) return;

    const contact = {
      name: name.input.value.trim(),
      phone: normalizePhone(phone.input.value),
      email: email.input.value.trim(),
      extra: extra ? extra.input.value.trim() : "",
      honeypot: hp.value,
    };

    /* התוצאה לא צריכה את השרת — computeBand רץ מקומית. עד כאן המשתמש
       חיכה עד 38 שניות (3 נסיונות × 12ש') לפני שראה את הפרופיל שלו.
       עכשיו: הפרופיל מיד, השליחה ברקע, וכשל מדווח על מסך התוצאה עם
       המילוט לוואטסאפ. */
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    setLabel(ctx.state.flow === "quick" ? "שומרים את הפרטים " : "מכינים את הפרופיל ", dots());

    ctx.setValue(contact, { silent: true });
    ctx.state.submitted = true;
    beginSend(sendLead(ctx.state, contact));
    ctx.next();
  });

  // הודעת הכשל עברה למסך התוצאה: השליחה כבר לא חוסמת את המעבר לשם.
  root.append(
    el("div", { class: "q-actions" }, btn),
    el("p", { class: "q-trust" }, "נחזור אליכם אישית. בלי ספאם ובלי רשימות תפוצה."),
  );
  return root;
}
