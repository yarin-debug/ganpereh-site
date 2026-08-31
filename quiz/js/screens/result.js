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

const CONTACT_STEP_ID = {
  balcony: "A_contact",
  garden: "B_contact",
  business: "C_contact",
  building: "D_contact",
  quick: "Q_contact",
};

function waLink(state, acc, band) {
  const c = state.answers[CONTACT_STEP_ID[state.flow]] || {};
  // המסלול המהיר: אין אפיון לצטט, וגם אין להמציא ("שטח משותף" זה
  // ברירת המחדל הטכנית של propertyType, לא משהו שהליד אמר)
  if (state.flow === "quick") {
    const lines = ["היי, השארתי עכשיו פרטים באתר 🌿"];
    if (c.name) lines.push(c.name);
    lines.push("אשמח לדבר על פרויקט גינון.");
    return `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
  }
  const lines = ["היי, סיימתי עכשיו את שאלון האפיון באתר 🌿"];
  if (c.name) lines.push(c.name);
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

/* בורר חלון השיחה — "מודל שלושת השלבים" (תוכנית-אב הבוט): הליד מסמן
   העדפה, לא סוגר מועד. הבחירה נשלחת לדשבורד (call-window), נרשמת
   בכרטיס הליד ומיילת לירין ולעידו — והם חוזרים בתוך החלון שנבחר.
   כשל שליחה שקט: זו העדפה, לא נתון קריטי — נתאם בשיחה. */
function callWindowBlock(state, acc, opts = {}) {
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
    // מודיע לשאר המסך: ה-CTA, הבר הדביק ושורת הסרטון מגיבים לתיאום
    if (opts.onScheduled) opts.onScheduled();
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

  // כשל שליחה ברקע — מוסתר עד שיש כשל, ומופיע בראש בכל הווריאנטים
  const contactAnswer = state.answers[CONTACT_STEP_ID[state.flow]] || {};
  const { banner } = sendFailureBanner(state, contactAnswer, waLink(state, acc, band));

  /* תיאום שיחה הוא ברירת המחדל של המערכת (הכרעת ירין 31.8, מקצה
     התיקונים): ליד ← אפיון ← שיחה קבועה ← פגישה. לכן הבורר נמצא בכל
     ווריאנט, וכל שאר המסך מגיב אליו — ה-CTA, הבר הדביק ושורת הסרטון
     יודעים אם השיחה כבר נקבעה. וואטסאפ נשאר מילוט, לא מסלול. */
  const scheduled = { done: false, listeners: [] };
  const callBlock = callWindowBlock(state, acc, {
    onScheduled: () => {
      scheduled.done = true;
      scheduled.listeners.forEach((fn) => fn());
    },
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // כפתור שמוביל אל הבורר: גלילה + הבזק קצר על הכרטיס, כדי שהעין תדע
  // לאן הגיעה. זה ה-CTA הראשי — הפעולה עצמה קורית בבורר, לא בקישור.
  const gotoCallButton = (label) => {
    const b = el(
      "button",
      { class: "btn-primary", type: "button" },
      label || "לבחור מתי נוח לכם לדבר",
    );
    b.addEventListener("click", () => {
      track("quiz_goto_call", props);
      callBlock.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      // reflow כפוי במקום requestAnimationFrame: מאפס את האנימציה גם
      // בלחיצה חוזרת, ולא תלוי בפריימים (rAF לא יורה בטאב מוסתר)
      callBlock.classList.remove("q-call-pulse");
      void callBlock.offsetWidth;
      callBlock.classList.add("q-call-pulse");
    });
    return b;
  };
  // וואטסאפ כקישור שקט — למי שבאמת מעדיף צ'אט, בלי להתחרות בבורר
  const waQuietLink = () =>
    el(
      "a",
      {
        class: "q-skip",
        href: waLink(state, acc, band),
        target: "_blank",
        rel: "noopener",
        onclick: () => track("quiz_wa_click", props),
      },
      "מעדיפים וואטסאפ? כתבו לנו",
    );

  // ---- call (המסלול המהיר — בלי שאלון) ----
  if (step.variant === "call") {
    const head = el(
      "div",
      { class: "q-result-block q-result-hero" },
      el("div", { class: "q-eyebrow" }, "הפרטים אצלנו"),
      el("h1", { class: "q-title", tabindex: "-1" }, "נשאר רק לבחור מתי"),
      el(
        "p",
        { class: "q-result-note", style: "border-top:none;padding-top:0;margin-top:4px" },
        "בחרו חלון שנוח לכם, ואנחנו כבר נתקשר. עשר דקות, בלי התחייבות.",
      ),
    );
    const next = el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title q-block-title" }, "מה עכשיו?"),
      el(
        "ol",
        { class: "q-next-steps" },
        el("li", {}, "מתקשרים אליכם בחלון שתבחרו, לשיחת היכרות קצרה."),
        el("li", {}, "בשיחה נכיר את הפרויקט, ומשם נתאם יחד את ההמשך."),
      ),
    );
    const tail = el(
      "div",
      { class: "q-result-block", style: "background:none;box-shadow:none;padding:0" },
      el(
        "div",
        { class: "q-actions" },
        waQuietLink(),
        el("a", { class: "q-skip", href: "/" }, "חזרה לאתר"),
      ),
    );
    const blocks = [head, callBlock, next, tail];
    root.append(banner, ...blocks);
    head.classList.add("q-arrival");
    blocks.forEach((b, i) => setTimeout(() => b.classList.add("revealed"), 80 * i + 30));
    return root;
  }

  // ---- lite (עסק / בניין) ----
  if (step.variant === "lite") {
    root.classList.add("q-info");
    root.append(
      banner,
      el("h1", { class: "q-title", tabindex: "-1" }, step.title),
      el("p", { class: "q-subtitle" }, step.subtitle),
      callBlock,
      el(
        "div",
        { class: "q-actions" },
        waQuietLink(),
        el("a", { class: "q-skip", href: "/" }, "חזרה לאתר"),
      ),
    );
    // הבלוקים של הווריאנט המלא נחשפים בהדרגה; כאן הכרטיס יחיד ופשוט מוצג
    callBlock.classList.add("revealed");
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
  blocks.push(callBlock);

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
      /* השורה הזו מגיבה לתיאום: העוגן הוא תמיד השיחה, לא הוואטסאפ.
         לפני — מפנה למעלה לבורר; אחרי — מאשרת שהשיחה קבועה. אף אחד
         לא אמור לצאת מהמסך בלי זמן שיחה. */
      (() => {
        const note = el(
          "p",
          { class: "q-service-line" },
          "לא ליד השטח עכשיו? קודם בחרו למעלה מתי נוח לכם לדבר, ואת הסרטון שלחו כשמתאפשר.",
        );
        scheduled.listeners.push(() => {
          note.textContent =
            "לא ליד השטח עכשיו? הסרטון יכול לחכות — השיחה כבר קבועה. שלחו כשמתאפשר.";
        });
        return note;
      })(),
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
  // השורה השנייה מגיבה לתיאום: ברגע שיש חלון, "24–48 שעות" כבר לא נכון
  const callLine = el("li", {}, "חוזרים אליכם לשיחת היכרות קצרה, תוך 24–48 שעות.");
  scheduled.listeners.push(() => {
    callLine.textContent = "מתקשרים אליכם בחלון שבחרתם, לשיחת היכרות קצרה.";
  });
  blocks.push(
    el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title q-block-title" }, "מה עכשיו?"),
      el(
        "ol",
        { class: "q-next-steps" },
        el("li", {}, "עוברים על האפיון שלכם אישית, כל תשובה נקראת."),
        callLine,
        el("li", {}, "משם ממשיכים לפי המסלול שלמעלה, צעד אחר צעד."),
      ),
    ),
  );

  /* 5. CTA סוגר. עד מקצה התיקונים הוא שלח לוואטסאפ "לתאם שיחה" — בזמן
     שכל מערך התיאום יושב שני מסכים למעלה. עכשיו הוא מחזיר אל הבורר,
     ואחרי שהשיחה נקבעה הוא מתחלף באישור. */
  const finalCta = gotoCallButton();
  const finalDone = el(
    "p",
    { class: "q-final-done", hidden: true },
    "קבענו. נתקשר בחלון שבחרתם — שריינו לנו עשר דקות.",
  );
  scheduled.listeners.push(() => {
    finalCta.hidden = true;
    finalDone.hidden = false;
  });
  blocks.push(
    el(
      "div",
      { class: "q-result-block", style: "background:none;box-shadow:none;padding:0" },
      el(
        "div",
        { class: "q-actions" },
        finalCta,
        finalDone,
        waQuietLink(),
        el("a", { class: "q-skip", href: "/" }, "חזרה לאתר"),
      ),
    ),
  );

  root.append(...blocks);

  /* חשיפה מדורגת. הפרופיל — הבלוק שבשבילו כל השאלון נעשה — נחשף
     בניגוב מלמעלה ולא באותה החלקה של כל מסך אחר בשאלון; זה ההבדל בין
     "עוד מסך" ל"הנה מה שיצא". */
  hero.classList.add("q-arrival");
  blocks.forEach((b, i) => setTimeout(() => b.classList.add("revealed"), 80 * i + 30));

  /* sticky במובייל: מופיע כשבורר השיחה מחוץ למסך, ומחזיר אליו — לא
     לוואטסאפ. אחרי שהשיחה נקבעה אין לו תפקיד, והוא יורד לתמיד. */
  const sticky = document.getElementById("sticky-cta");
  if (sticky) {
    sticky.innerHTML = "";
    sticky.append(gotoCallButton("מתי נוח לכם לדבר?"));
    // הבר נשאר בזרימה ומוחלק פנימה/החוצה. [hidden] היה display: none,
    // כלומר הבהוב במקום כניסה.
    sticky.hidden = false;
    sticky.classList.remove("shown");
    const io = new IntersectionObserver(
      (entries) => {
        sticky.classList.toggle("shown", !entries[0].isIntersecting && !scheduled.done);
      },
      { threshold: 0 },
    );
    io.observe(callBlock);
    scheduled.listeners.push(() => {
      sticky.classList.remove("shown");
      io.disconnect();
    });
  }

  return root;
}
