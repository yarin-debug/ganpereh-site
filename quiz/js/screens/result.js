// מסך התוצאה: פרופיל + רמת השקעה + מה עכשיו + וואטסאפ. וריאנט lite לעסק/בניין.
import { el } from "./base.js";
import { CONFIG } from "../config.js";
import { buildAcc, computeBand, TYPE_LABEL, STYLE_LABEL } from "../submit.js";
import { STYLE_IMG } from "../flows.js";
import { track } from "../analytics.js";
import { serviceTrack } from "../service-track.js";
import { beginSend, onSettled, isSending } from "../pending-lead.js";
import { sendLead } from "../submit.js";

// סגנון לתצוגה: טקסט חופשי שהוקלד ("משהו אחר בראש") גובר על התווית הגנרית
function styleText(acc) {
  if (acc.ch.style === "other" && acc.ch.styleOther && acc.ch.styleOther !== "פתוח להצעות")
    return acc.ch.styleOther;
  return STYLE_LABEL[acc.ch.style] || acc.ch.style;
}

function waLink(state, acc, band) {
  const lines = ["היי, סיימתי עכשיו את שאלון האפיון באתר 🌿"];
  const c =
    state.answers[
      state.flow === "balcony"
        ? "A_contact"
        : state.flow === "garden"
          ? "B_contact"
          : state.flow === "business"
            ? "C_contact"
            : "D_contact"
    ];
  if (c && c.name) lines.push(c.name);
  let what = TYPE_LABEL[state.propertyType] || "";
  if (acc.lead.area) what += ", " + acc.lead.area;
  if (acc.lead.sizeSqm) what += `, כ-${acc.lead.sizeSqm} מ״ר`;
  lines.push(what);
  const details = [];
  if (acc.ch.style) details.push("סגנון: " + styleText(acc));
  if (acc.ch.requested) details.push("חשוב לי: " + acc.ch.requested);
  if (details.length) lines.push(details.join(" · "));
  lines.push("אשמח לתאם שיחה קצרה.");
  return `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function waButton(href, props) {
  return el(
    "a",
    {
      class: "btn-wa",
      href,
      target: "_blank",
      rel: "noopener",
      "data-track": "quiz_result",
      onclick: () => track("quiz_wa_click", props),
    },
    "לוואטסאפ, מתאמים שיחה",
  );
}

/* בורר חלון השיחה — "מודל שלושת השלבים" (תוכנית-אב הבוט): הליד מסמן
   העדפה, לא סוגר מועד. הבחירה נשלחת לדשבורד (call-window), נרשמת
   בכרטיס הליד ומיילת לירין ולעידו — והם חוזרים בתוך החלון שנבחר.
   כשל שליחה שקט: זו העדפה, לא נתון קריטי — נתאם בשיחה. */
function callWindowBlock(state, acc) {
  const days = [
    ["today", "עוד היום"],
    ["tomorrow", "מחר"],
    ["week", "בימים הקרובים"],
  ];
  const hours = [
    ["morning", "בוקר"],
    ["noon", "צהריים"],
    ["evening", "ערב"],
  ];
  let day = null;
  let hour = null;

  /* הכרטיס הכהה היחיד במסך. מאז שרמת ההשקעה ירדה מהתצוגה, משבצת
     ההדגשה האחת (ראו ההערה ליד .q-service) התפנתה — והיא עוברת לכאן,
     כי זו הפעולה שכל המסך מוביל אליה. האיור של ירין מעגן את "עם ירין
     או עידו" בפנים במקום בשם — אותה דמות שמלווה את הלקוח גם במיילים. */
  const wrap = el("div", { class: "q-result-block q-call" });
  wrap.append(
    el(
      "div",
      { class: "q-call-head" },
      el(
        "div",
        { class: "q-call-headtext" },
        el("h2", { class: "q-title q-block-title" }, "מתי נוח לכם לדבר?"),
        el(
          "p",
          { class: "q-service-line" },
          "שיחת היכרות קצרה, עשר דקות, עם ירין או עידו. בחרו מתי הכי נוח לתפוס אתכם, ונתקשר בזמן שנוח לכם.",
        ),
      ),
      // דקורטיבי — הטקסט לצדו כבר אומר מי מתקשר, ולכן alt ריק
      el("img", {
        class: "q-call-avatar",
        src: "../images/quiz/team-yarin.webp",
        alt: "",
        width: "480",
        height: "480",
        loading: "lazy",
        decoding: "async",
      }),
    ),
  );

  const mkRow = (options, set) => {
    const row = el("div", { class: "q-chips", role: "group" });
    for (const [value, label] of options) {
      const chip = el(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": "false",
          onclick: () => {
            row.querySelectorAll(".chip").forEach((c) => {
              c.classList.remove("selected");
              c.setAttribute("aria-pressed", "false");
            });
            chip.classList.add("selected");
            chip.setAttribute("aria-pressed", "true");
            set(value, label);
            sync();
          },
        },
        label,
      );
      row.append(chip);
    }
    return row;
  };

  const btn = el(
    "button",
    { class: "btn-primary", type: "button", disabled: true },
    "מתאים לי, תתקשרו",
  );
  const done = el(
    "p",
    { class: "q-service-line q-call-done", hidden: true },
    "מעולה, נתקשר בחלון שבחרתם. שריינו לנו עשר דקות.",
  );
  const sync = () => {
    btn.disabled = !(day && hour);
  };

  wrap.append(
    mkRow(days, (v) => {
      day = v;
    }),
    mkRow(hours, (v) => {
      hour = v;
    }),
    el("div", { class: "q-actions" }, btn),
    done,
  );

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "נרשם…";
    track("quiz_call_window", { day, hour });
    const payload = { externalId: state.externalId, day, hour };
    // הליד עצמו עדיין נשלח ברקע (עד 3 נסיונות) — 404 כאן אומר "עוד לא
    // נכתב", לא "לא קיים". מנסים שוב כמה פעמים לפני שמוותרים בשקט.
    const send = (attempt) =>
      fetch(CONFIG.CALL_WINDOW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (res.status === 404 && attempt < 5) {
            setTimeout(() => send(attempt + 1), 4000);
          }
        })
        .catch(() => {
          if (attempt < 5) setTimeout(() => send(attempt + 1), 4000);
        });
    send(1);
    btn.hidden = true;
    done.hidden = false;
  });

  return wrap;
}

/* השליחה רצה ברקע מרגע שהמשתמש לחץ. אם היא נכשלת אחרי שלושת הנסיונות,
   הרגע הזה הוא ההזדמנות האחרונה להציל את הליד — ולכן ההודעה מציעה גם
   ניסיון חוזר וגם את המילוט לוואטסאפ, שבו כל האפיון כבר בטקסט. */
function sendFailureBanner(state, contact, waHref) {
  const banner = el("div", { class: "q-result-block q-send-fail", hidden: true, role: "status" });
  const retry = el("button", { class: "q-retry-send", type: "button" }, "לנסות לשלוח שוב");
  banner.append(
    el(
      "p",
      {},
      "הפרופיל שלכם מוכן, אבל השליחה אלינו לא עברה. אפשר לנסות שוב, או פשוט לשלוח לנו בוואטסאפ: כל האפיון כבר בהודעה.",
    ),
    el(
      "div",
      { class: "q-actions" },
      retry,
      el(
        "a",
        { class: "q-skip", href: waHref, target: "_blank", rel: "noopener" },
        "לשלוח בוואטסאפ",
      ),
    ),
  );
  const watch = () =>
    onSettled((ok) => {
      if (ok) {
        banner.hidden = true;
        return;
      }
      banner.hidden = false;
      banner.classList.add("revealed");
      track("quiz_error", { stage: "submit_background", code: "failed" });
    });
  retry.addEventListener("click", () => {
    if (isSending()) return;
    retry.disabled = true;
    retry.textContent = "שולחים…";
    beginSend(sendLead(state, contact)).then((res) => {
      if (res && res.ok) return;
      retry.disabled = false;
      retry.textContent = "לנסות שוב";
    });
    watch();
  });
  watch();
  return { banner, waHref };
}

export function render(step, ctx) {
  const state = ctx.state;
  const root = el("div", { class: "q-step" });
  const acc = buildAcc(state);
  const { band } = computeBand(state, acc);
  const props = { flow: state.flow, band: band ? band.key : "none" };
  track("quiz_result_view", props);

  // כשל שליחה ברקע — מוסתר עד שיש כשל, ומופיע בראש בשני הווריאנטים
  const contactAnswer =
    state.answers[
      state.flow === "balcony"
        ? "A_contact"
        : state.flow === "garden"
          ? "B_contact"
          : state.flow === "business"
            ? "C_contact"
            : "D_contact"
    ] || {};
  const { banner } = sendFailureBanner(state, contactAnswer, waLink(state, acc, band));

  // ---- lite (עסק / בניין) ----
  if (step.variant === "lite") {
    root.classList.add("q-info");
    root.append(
      banner,
      el("h1", { class: "q-title", tabindex: "-1" }, step.title),
      el("p", { class: "q-subtitle" }, step.subtitle),
      el(
        "div",
        { class: "q-actions" },
        waButton(waLink(state, acc, null), props),
        el("a", { class: "q-skip", href: "/" }, "חזרה לאתר"),
      ),
    );
    return root;
  }

  root.append(banner);

  const blocks = [];

  // 1. פרופיל
  const hero = el("div", { class: "q-result-block q-result-hero" });
  const imgSrc =
    state.designerSnapshotLocal ||
    (state.uploads.find((u) => u.kind === "image" && u.previewUrl) || {}).previewUrl ||
    STYLE_IMG[acc.ch.style] ||
    null;
  if (imgSrc) hero.append(el("img", { src: imgSrc, alt: "החלל שלכם" }));
  // תווית קטנה לפני הכותרת — אותו תפקיד כמו ה-eyebrow במיילי המגזין:
  // שורה שאומרת "מה קרה" לפני שהכותרת אומרת "מה יש כאן".
  hero.append(el("div", { class: "q-eyebrow" }, "האפיון הושלם"));
  hero.append(el("h1", { class: "q-title", tabindex: "-1" }, "הפרופיל של הפרויקט שלכם"));
  const chips = el("div", { class: "q-profile-chips" });
  // כל צ'יפ נושא אינדקס לסטגר של הכניסה — דקורטיבי, פעם אחת, אחרי הניגוב
  const chip = (t) => t && chips.append(el("span", { style: `--i:${chips.children.length}` }, t));
  chip(TYPE_LABEL[state.propertyType]);
  chip(acc.lead.sizeSqm ? `כ-${acc.lead.sizeSqm} מ״ר` : null);
  chip(acc.lead.area);
  chip(acc.ch.style ? styleText(acc) : null);
  chip(acc.ch.requested);
  chip(acc.ch.urgency);
  hero.append(chips);
  // ההתרגשות עוברת ברמז, לא בהצהרה: משפט אחד שאומר שמישהו בצד השני
  // כבר מדמיין את הפרויקט הזה.
  hero.append(
    el(
      "p",
      { class: "q-result-note" },
      "יש כאן כבר תמונה ברורה. עוד לא גינה, אבל כבר כיוון ששווה שיחה.",
    ),
  );
  blocks.push(hero);

  /* רמת ההשקעה ירדה מהמסך (הכרעת ירין 31.8, ערב): מספר אוטומטי בלי
     ביסוס, לפני שדיברנו עם הליד, מפחיד יותר משהוא מחמם. ההערכה עדיין
     מחושבת ונשלחת לדשבורד — היא כלי פנימי לתעדוף, לא מסר ללקוח. */

  // 2. תיאום השיחה — הרגע החם ביותר: הפרופיל בדיוק נחשף, הליד כבר נשלח.
  blocks.push(callWindowBlock(state, acc));

  /* 3. המסלול המומלץ — התשובה ל"איזה שירות אני צריך", שעד היום נמסרה
     רק בשיחה. הנוסח מגיע מ-service-track.js, שהוא מראה של הדשבורד:
     הלקוח יראה את אותו ציר שלבים בדיוק שוב בהצעת המחיר. */
  const track_ = serviceTrack(acc.ch.pCode);
  if (track_) {
    const svc = el(
      "div",
      { class: "q-result-block q-service" },
      el("div", { class: "band-label" }, "המסלול שמתאים לפרויקט הזה"),
      el("div", { class: "band-name" }, track_.label),
    );
    for (const line of track_.lines) svc.append(el("p", { class: "q-service-line" }, line));
    if (track_.steps.length) {
      const ol = el("ol", { class: "q-service-steps" });
      for (const st of track_.steps)
        ol.append(el("li", {}, el("strong", {}, st.title), el("span", {}, st.detail)));
      svc.append(ol);
    }
    if (track_.outro) svc.append(el("p", { class: "q-service-outro" }, track_.outro));
    blocks.push(svc);
  }

  /* 3.5 בקשת הסרטון — בכוונה כאן ולא במסך ההעלאה: הליד כבר נשלח, אין מה
     להפסיד, וסרטון בוואטסאפ לא מכביד על הצינור (העלאת וידאו דרך השאלון
     הייתה תוקעת מובייל ומנפחת אחסון). מי שלא בבית פשוט שולח אחר כך —
     ההודעה כבר יושבת לו בשיחה. */
  {
    const isPlanFile = acc.ch.pCode === "P0" || acc.ch.pCode === "P1";
    const videoLines = ["היי, סיימתי את שאלון האפיון באתר 🌿"];
    if (contactAnswer.name) videoLines.push(contactAnswer.name);
    videoLines.push("אשלח כאן סרטון של השטח" + (isPlanFile ? " ואת התוכנית" : "") + ".");
    const videoHref = `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(videoLines.join("\n"))}`;
    const video = el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title q-block-title" }, "יש לכם דקה? צלמו סרטון של השטח"),
      el(
        "p",
        { class: "q-service-line" },
        "סיבוב קצר עם הטלפון מראה לנו מה שתמונות לא מספרות: גבהים, גישה, ומה באמת קורה בשטח. " +
          "זה מקצר את הדרך להצעה מדויקת.",
      ),
      isPlanFile
        ? el(
            "p",
            { class: "q-service-line" },
            "ואם התוכנית האדריכלית לא צורפה כאן, אפשר לשלוח אותה באותה הודעה.",
          )
        : null,
      el(
        "p",
        { class: "q-service-line" },
        "לא ליד השטח עכשיו? שלחו את ההודעה בכל מקרה, והסרטון יחכה לכם בשיחה לכשנוח.",
      ),
      el(
        "div",
        { class: "q-actions" },
        el(
          "a",
          {
            // וריאנט שקט: במסך אחד יש כפתור טרקוטה מלא אחד (ה-CTA למטה),
            // והסרטון הוא בקשה משנית — קו מתאר במקום עוד מלבן מלא.
            class: "btn-wa btn-wa-quiet",
            href: videoHref,
            target: "_blank",
            rel: "noopener",
            onclick: () => track("quiz_video_wa_click", props),
          },
          "לשלוח סרטון בוואטסאפ",
        ),
      ),
    );
    blocks.push(video);
  }

  /* 4. מה עכשיו — הצטמצם לצעד המיידי בלבד. השורה השלישית ("פגישת מדידה
     ותכנון, ומשם לביצוע") עברה לציר השלבים למעלה, ובמסלול הביצוע היא
     הייתה פשוט לא נכונה. */
  blocks.push(
    el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title q-block-title" }, "מה עכשיו?"),
      el(
        "ol",
        { class: "q-next-steps" },
        el("li", {}, "עוברים על האפיון שלכם אישית, כל תשובה נקראת."),
        el("li", {}, "חוזרים אליכם לשיחת היכרות קצרה, תוך 24–48 שעות."),
        el("li", {}, "משם ממשיכים לפי המסלול שלמעלה, צעד אחר צעד."),
      ),
    ),
  );

  // 4. CTA
  const wa = waButton(waLink(state, acc, band), props);
  blocks.push(
    el(
      "div",
      { class: "q-result-block", style: "background:none;box-shadow:none;padding:0" },
      el("div", { class: "q-actions" }, wa, el("a", { class: "q-skip", href: "/" }, "חזרה לאתר")),
    ),
  );

  root.append(...blocks);

  /* חשיפה מדורגת. הפרופיל — הבלוק שבשבילו כל השאלון נעשה — נחשף
     בניגוב מלמעלה ולא באותה החלקה של כל מסך אחר בשאלון; זה ההבדל בין
     "עוד מסך" ל"הנה מה שיצא". */
  hero.classList.add("q-arrival");
  blocks.forEach((b, i) => setTimeout(() => b.classList.add("revealed"), 80 * i + 30));

  // sticky CTA במובייל כשה-hero יוצא מהמסך
  const sticky = document.getElementById("sticky-cta");
  if (sticky) {
    sticky.innerHTML = "";
    sticky.append(waButton(waLink(state, acc, band), props));
    // הבר נשאר בזרימה ומוחלק פנימה/החוצה. [hidden] היה display: none,
    // כלומר הבהוב במקום כניסה.
    sticky.hidden = false;
    sticky.classList.remove("shown");
    const io = new IntersectionObserver(
      (entries) => {
        sticky.classList.toggle("shown", !entries[0].isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(hero);
  }

  return root;
}
