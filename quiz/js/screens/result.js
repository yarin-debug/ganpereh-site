// מסך התוצאה: פרופיל + רמת השקעה + מה עכשיו + וואטסאפ. וריאנט lite לעסק/בניין.
import { el } from "./base.js";
import { CONFIG } from "../config.js";
import { buildAcc, computeBand, TYPE_LABEL } from "../submit.js";
import { track } from "../analytics.js";
import { serviceTrack } from "../service-track.js";
import { beginSend, onSettled, isSending } from "../pending-lead.js";
import { sendLead } from "../submit.js";

// סגנון לתצוגה: טקסט חופשי שהוקלד ("משהו אחר בראש") גובר על התווית הגנרית

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
  if (acc.ch.requested) details.push("חשוב לי: " + acc.ch.requested);
  if (details.length) lines.push(details.join(" · "));
  lines.push("אשמח לתאם שיחה קצרה.");
  return `https://wa.me/${CONFIG.WA_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/* ════════════════════════════════════════
   בורר חלון השיחה.

   שתי צורות, ובמכוון:
   · **מועדים אמיתיים** — נטענים מהדשבורד (`call-windows`) ונגזרים
     מחלונות שירין ועידו הגדירו. הליד רואה "מחר · 19:00–20:00", כלומר
     זמן שמישהו באמת פנוי בו, וזו הצורה שכל מערך השיחות בנוי עליה.
   · **העדפה גנרית** — "עוד היום / בבוקר". נשארת כרשת ביטחון בלבד.

   ⚠️ **הנפילה החיננית היא העיקר כאן.** רשת שנופלת, דשבורד ששותק,
   או מצב שבו כל החלונות מלאים — כל אלה קורים דווקא ברגע שהליד הכי
   חם, וליד שלא יכול לתאם הוא ליד אבוד. לכן כשל בטעינה אינו מסתיר
   את הבורר אלא מחזיר אותו לצורה הישנה, שהשרת עדיין מקבל.
   ════════════════════════════════════════ */
function callWindowBlock(state, acc, opts = {}) {
  const wrap = el("div", { class: "q-result-block q-call" });

  /* הכרטיס הכהה היחיד במסך. מאז שרמת ההשקעה ירדה מהתצוגה, משבצת
     ההדגשה האחת (ראו ההערה ליד .q-service) התפנתה — והיא עוברת לכאן,
     כי זו הפעולה שכל המסך מוביל אליה. האיור של ירין מעגן את "עם ירין
     או עידו" בפנים במקום בשם — אותה דמות שמלווה את הלקוח גם במיילים. */
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
          "שיחת היכרות קצרה עם ירין או עידו, עשר דקות. בחרו יום ושעה, ונתקשר בדיוק אז.",
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

  // מה נשלח לשרת: או slotId (מועד אמיתי) או day+hour (העדפה)
  let picked = null;
  /* בחירה חלקית, בשביל שורת הסיכום בלבד: "מחר. נשאר לבחור שעה."
     picked נשאר null עד ששני החלקים קיימים, ורק הוא נשלח. */
  let pendingDay = null;
  let pendingTime = null;

  const dayRow = el("div", { class: "q-chips", role: "group" });
  const timeRow = el("div", { class: "q-chips", role: "group" });

  /* שני שלבים, לא שתי שורות זהות. עד כאן ההבדל בין השורות נמסר
     ב-aria-label בלבד — כלומר היה קיים לקורא מסך ולא לעין, ושתי שורות
     צ'יפים זהות זו מתחת לזו נקראות כרשימה אחת. המספר וקו השיער הם מה
     שהופך "שתים-עשרה אפשרויות" ל"יום, ואז שעה". הכותרת הגלויה היא גם
     השם הנגיש של הקבוצה, ולכן אין כאן שני נוסחים שיכולים להיפרד. */
  const mkGroup = (num, title, row, hintText) => {
    const labelId = `q-call-step-${num}`;
    const label = el(
      "div",
      { class: "q-call-step", id: labelId },
      el("span", { class: "q-call-num", "aria-hidden": "true" }, String(num)),
      el("span", {}, title),
    );
    row.setAttribute("aria-labelledby", labelId);
    const hint = hintText ? el("p", { class: "q-call-hint" }, hintText) : null;
    return { node: el("div", { class: "q-call-group", hidden: true }, label, row, hint), hint };
  };

  const dayGroup = mkGroup(1, "באיזה יום?", dayRow);
  const timeGroup = mkGroup(2, "ובאיזו שעה?", timeRow, "קודם יום, ואז השעות שלו.");

  const btn = el(
    "button",
    { class: "btn-primary", type: "button", disabled: true },
    "מתאים לי, תתקשרו",
  );

  /* שורת הסיכום. המשפט הזה כבר היה קיים — אבל רק *אחרי* הלחיצה, כלומר
     הכפתור "מתאים לי, תתקשרו" מעולם לא אמר על מה בדיוק לוחצים. עכשיו
     הוא חי: מתעדכן בכל בחירה, ומנסח את ההתחייבות במילים לפני שמאשרים
     אותה. אותו `saidLabel` מנסח גם אותו וגם את האישור שאחרי — נוסח אחד. */
  const summaryLine = el("strong", {});
  const summary = el(
    "div",
    { class: "q-call-summary", role: "status", hidden: true },
    summaryLine,
    el("span", {}, "שיחה של עד עשר דקות."),
  );

  const done = el(
    "p",
    { class: "q-service-line q-call-done", hidden: true },
    "קבענו. נתקשר במועד שבחרתם. שריינו לנו עשר דקות.",
  );
  const status = el("p", { class: "q-call-status", role: "status" }, "טוענים מועדים…");

  const sync = () => {
    btn.disabled = !picked;
    summary.classList.toggle("is-set", !!picked);
    if (picked) summaryLine.textContent = `נתקשר ${picked.said}.`;
    else if (pendingDay) summaryLine.textContent = `${pendingDay}. נשאר רק לבחור שעה.`;
    else if (pendingTime) summaryLine.textContent = `${pendingTime}. נשאר רק לבחור יום.`;
    else summaryLine.textContent = "כאן יופיע המועד שתבחרו.";
  };

  // הבוררים מוסתרים עד שידוע איזו צורה מוצגת — שלב ממוספר עם שורה ריקה
  // בזמן הטעינה נראה כמו תקלה
  const showPickers = () => {
    dayGroup.node.hidden = false;
    timeGroup.node.hidden = false;
    summary.hidden = false;
    sync();
  };

  // שלב 2 לפני שנבחר יום: הכותרת נשארת (כדי שיהיה ברור שיש שני שלבים),
  // והרמז מחליף את שורת הצ'יפים במקום להתווסף אליה
  const setTimeWaiting = (on) => {
    timeGroup.node.classList.toggle("is-waiting", on);
    if (timeGroup.hint) timeGroup.hint.hidden = !on;
    timeRow.hidden = on;
  };

  // צ'יפ בורר יחיד. `row` הוא הקבוצה שממנה בוחרים אחד.
  const mkChip = (row, label, onPick) => {
    const chip = el("button", { class: "chip", type: "button", "aria-pressed": "false" }, label);
    chip.addEventListener("click", () => {
      row.querySelectorAll(".chip").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("selected");
      chip.setAttribute("aria-pressed", "true");
      onPick();
      sync();
    });
    row.append(chip);
    return chip;
  };

  // ── הצורה הישנה: יום גנרי × שעה גנרית ──
  const renderGeneric = () => {
    status.hidden = true;
    dayRow.replaceChildren();
    timeRow.replaceChildren();
    let day = null;
    let hour = null;
    // ההעדפה הגנרית מקבלת את אותה שורת סיכום: "נתקשר מחר, בשעות הערב."
    // הצ'יפ נשאר קצר ("ערב"), המשפט נשאר משפט.
    const update = () => {
      picked = day && hour ? { day, hour, said: `${pendingDay}, ${pendingTime}` } : null;
    };
    for (const [value, label, said] of [
      ["today", "עוד היום", "עוד היום"],
      ["tomorrow", "מחר", "מחר"],
      ["week", "בימים הקרובים", "בימים הקרובים"],
    ]) {
      mkChip(dayRow, label, () => {
        day = value;
        pendingDay = said;
        update();
      });
    }
    for (const [value, label, said] of [
      ["morning", "בוקר", "בשעות הבוקר"],
      ["noon", "צהריים", "בשעות הצהריים"],
      ["evening", "ערב", "בשעות הערב"],
    ]) {
      mkChip(timeRow, label, () => {
        hour = value;
        pendingTime = said;
        update();
      });
    }
    // כאן שתי השאלות פתוחות במקביל, ולכן שלב 2 אינו במצב המתנה
    setTimeWaiting(false);
    showPickers();
  };

  /* תווית לתוך משפט, לא לצ'יפ. ה-`label` מהשרת בנוי לתצוגה עצמאית
     ("מחר · 19:00–20:00"), והנקודה האמצעית בתוך משפט נקראת כתקלת
     עימוד. כאן: "מחר, בין 19:00 ל-20:00". */
  const saidDay = (label) => (label.startsWith("יום ") ? "ב" + label : label);
  const saidLabel = (slot) =>
    slot.start && slot.end
      ? `${saidDay(slot.dayLabel)}, בין ${slot.start} ל-${slot.end}`
      : `${saidDay(slot.dayLabel)}, ${slot.timeLabel}`;

  /* אותה תווית בשתי צורות: בצ'יפ "חמישי, 3 בספטמבר", במשפט "ביום חמישי,
     3 בספטמבר". השרת שולח את הצורה המלאה — נכונה למשפט, רחבה מדי לצ'יפ
     ברוחב טלפון. */
  const dayChipLabel = (label) => label.replace(/^יום /, "");

  /* ── הצורה החדשה: מועדים אמיתיים, מקובצים לפי יום ──
     שתי שורות ולא רשימה אחת: שנים־עשר מועדים ברצף הם שיתוק בחירה,
     ואילו "איזה יום" ואז "איזו שעה" הן שתי שאלות שכל אחת בת שתיים-שלוש
     אפשרויות. זה גם בדיוק המבנה שהיה כאן קודם — הליד לא לומד ממשק חדש,
     רק מקבל תשובות אמיתיות. */
  const renderSlots = (slots) => {
    status.hidden = true;
    dayRow.replaceChildren();
    timeRow.replaceChildren();

    const byDay = [];
    for (const slot of slots) {
      const group = byDay.find((g) => g.date === slot.date);
      if (group) group.slots.push(slot);
      else byDay.push({ date: slot.date, label: slot.dayLabel, slots: [slot] });
    }

    const showTimes = (group) => {
      timeRow.replaceChildren();
      picked = null;
      pendingTime = null;
      setTimeWaiting(false);
      for (const slot of group.slots) {
        const chip = mkChip(timeRow, slot.timeLabel, () => {
          picked = { slotId: slot.id, said: saidLabel(slot) };
          pendingTime = slot.timeLabel;
        });
        /* ⚠️ "08:30–09:30" בתוך טקסט בעברית הוצג הפוך — "09:30–08:30".
           המקף בין שני מספרים הוא תו ניטרלי ולכן מקבל את כיוון הפסקה,
           ושני המספרים מסודרים מימין לשמאל: הצ'יפ הבטיח חלון שנגמר לפני
           שהתחיל. הכיוון נקבע על הצ'יפ ולא בעטיפת <bdi>, כדי שהשם הנגיש
           של הכפתור יישאר צומת טקסט אחד. */
        chip.classList.add("q-chip-time");
        /* יום שיש בו מועד אחד: הצ'יפ מסומן מראש במקום להיעלם. הגרסה
           הקודמת דילגה על השורה כולה ("שאלה עם תשובה אחת אינה שאלה"),
           אבל אז שלב 2 הופיע רק לפעמים — והליד אישר מועד שמעולם לא
           הוצג לו. עדיף צ'יפ בודד מסומן מאשר מועד סמוי. */
        if (group.slots.length === 1) {
          chip.classList.add("selected");
          chip.setAttribute("aria-pressed", "true");
          picked = { slotId: slot.id, said: saidLabel(slot) };
          pendingTime = slot.timeLabel;
        }
      }
      sync();
    };

    setTimeWaiting(true);
    for (const group of byDay) {
      mkChip(dayRow, dayChipLabel(group.label), () => {
        pendingDay = group.label;
        showTimes(group);
      });
    }
    showPickers();
  };

  wrap.append(
    status,
    dayGroup.node,
    timeGroup.node,
    summary,
    el("div", { class: "q-actions" }, btn),
    done,
  );

  /* טעינת המועדים. אין ריטריי בכוונה: הליד עומד מול המסך, וניסיון חוזר
     של שתים-עשרה שניות הוא בדיוק הזמן שבו הוא סוגר את הלשונית. נופלים
     מיד לצורה הגנרית, שממשיכה לעבוד. */
  fetch(CONFIG.CALL_SLOTS_URL, { headers: { Accept: "application/json" } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && Array.isArray(data.slots) && data.slots.length) renderSlots(data.slots);
      else {
        // אפס מועדים = כל החלונות מלאים או כבויים. הגנרי עדיין מתעד העדפה,
        // וזה עדיף על מסך שאומר ללקוח "אין לנו זמן בשבילך".
        track("quiz_call_slots_empty", { flow: state.flow });
        renderGeneric();
      }
    })
    .catch(() => {
      track("quiz_error", { stage: "call_slots", code: "fetch_failed" });
      renderGeneric();
    });

  btn.addEventListener("click", () => {
    if (!picked) return;
    btn.disabled = true;
    btn.textContent = "נרשם…";
    track(
      "quiz_call_window",
      picked.slotId ? { slot: picked.slotId } : { day: picked.day, hour: picked.hour },
    );
    /* מי שהגיע מקישור ?lid= נרשם על הכרטיס הקיים לפי המזהה שלו, לא לפי
       externalId של ההגשה הזאת. במסלול המהיר עם lid אין בלוק quiz בכלל,
       ולכן `characterization.quiz.externalId` — המקום שהשרת מחפש בו
       הגשה ממוזגת — נשאר ריק והמועד היה נזרק ב-404 שקט. ובמסך "בחרו
       זמן" (v=call) אין הגשה בכלל, רק המזהה. */
    const ident = state.linkLeadId
      ? { leadId: state.linkLeadId, externalId: state.externalId }
      : { externalId: state.externalId };
    const payload = picked.slotId
      ? { ...ident, slotId: picked.slotId }
      : { ...ident, day: picked.day, hour: picked.hour };
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
    // המועד שנבחר חוזר ללקוח בגוף האישור — "נתקשר מחר בין 19:00 ל-20:00"
    // מדויק יותר מ"נתקשר בחלון שבחרתם", וזה מה שהופך את זה להתחייבות
    if (picked.said) {
      done.textContent = `קבענו. נתקשר ${picked.said}. שריינו לנו עשר דקות.`;
    }
    // האישור מחליף את הסיכום החי, והבוררים קופאים: צ'יפ שאפשר ללחוץ
    // עליו אחרי שהמועד נשלח מבטיח שינוי שכבר אי אפשר לעשות
    summary.hidden = true;
    wrap.querySelectorAll(".chip").forEach((c) => {
      c.disabled = true;
    });
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
        "בוחרים מועד, ואנחנו מתקשרים. בלי התחייבות.",
      ),
    );
    const next = el(
      "div",
      { class: "q-result-block" },
      el("h2", { class: "q-title q-block-title" }, "מה עכשיו?"),
      el(
        "ol",
        { class: "q-next-steps" },
        el("li", {}, "מתקשרים אליכם במועד שתבחרו, לשיחת היכרות קצרה."),
        el("li", {}, "בשיחה נכיר את הפרויקט, ומשם נתאם יחד את ההמשך."),
      ),
    );
    /* שכבה 2, ברשות (הכרעת ירין 5.9.2026: שכבות ולא תנאים).
       ⚠️ **רק למי שהגיע מהקישור** (`callOnly`): מי שבחר במסלול המהיר
       מ-S0 בדיוק אמר "בלי שאלון", והצעה מיד אחרי הסירוב קוראת כלחץ.
       הקישור נושא את `lid`, ולכן ההגשה תתמזג לאותו כרטיס, והשאלון
       ידלג שם על מה שכבר ידוע. */
    const helpLink =
      state.callOnly && state.linkLeadId
        ? el(
            "a",
            {
              class: "q-skip",
              href: "?lid=" + encodeURIComponent(state.linkLeadId),
              onclick: () => track("quiz_layer2_from_call", { flow: state.flow }),
            },
            "יש לכם דקה? כמה שאלות שיעזרו לנו להגיע מוכנים",
          )
        : null;
    const tail = el(
      "div",
      { class: "q-result-block", style: "background:none;box-shadow:none;padding:0" },
      el(
        "div",
        { class: "q-actions" },
        helpLink,
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
  // ⚠️ תמונת הגיבור הוסרה מכאן (5.9.2026, הכרעת ירין): תמונה לאורך בתוך
  // הקשת ב-.q-result-hero img (רדיוס עליון גדול, קיצוץ שמרכז את התמונה)
  // לא נראתה טוב — הקשת נועדה לצילום שהמרכז שלו "נושם", וצילום מרפסת/גינה
  // עם קווים אנכיים (עציצים, גדר, גזעים) נחתך בצורה מוזרה בשוליים העגולים.
  const hero = el("div", { class: "q-result-block q-result-hero" });
  const imgSrc = state.designerSnapshotLocal || null;
  if (imgSrc) hero.append(el("img", { src: imgSrc, alt: "התרשים שהעליתם" }));
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
          "לא ליד השטח עכשיו? קודם בחרו למעלה מועד לשיחה, ואת הסרטון שלחו כשמתאפשר.",
        );
        scheduled.listeners.push(() => {
          note.textContent =
            "לא ליד השטח עכשיו? הסרטון יכול לחכות: השיחה כבר קבועה. שלחו כשמתאפשר.";
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
    callLine.textContent = "מתקשרים אליכם במועד שבחרתם, לשיחת היכרות קצרה.";
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
    "השיחה קבועה. נתקשר במועד שבחרתם.",
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
