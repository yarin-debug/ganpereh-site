// כל השאלון כ-data. הקופי כאן סופי — מקורו במפרט-מסלולים.md של הפרויקט.
// apply(value, acc, state, step) בונה את ה-payload; effect(value, state) משנה ניווט/state.

const IMG = {
  tzahala: "../images/tzahala.webp",
  benShafrot: "../images/ben-shafrot.webp",
  nineCloud: "../images/nine-cloud.webp",
  yuvalRosio: "../images/yuval-rosio.webp",
  mishtalah: "../images/mishtalah.webp",
  office: "../images/IMG_0074.webp",
};

export const STYLE_IMG = {
  natural_wild: IMG.yuvalRosio,
  mediterranean: IMG.tzahala,
  minimal: IMG.benShafrot,
  other: IMG.nineCloud,
};

const CITIES = [
  "תל אביב",
  "רמת גן",
  "גבעתיים",
  "הרצליה",
  "רמת השרון",
  "ראשון לציון",
  "חולון",
  "בת ים",
  "פתח תקווה",
  "בני ברק",
  "רעננה",
  "כפר סבא",
  "הוד השרון",
  "נתניה",
  "ראש העין",
];

// ---- עוזרי מיפוי ----
const labelOf = (step, v) => {
  const o = (step.options || []).find((x) => x.value === v);
  return o ? o.label : v;
};
const setChLabel = (field) => (v, acc, st, step) => {
  if (v) acc.ch[field] = labelOf(step, v);
};
const joinLabels = (field) => (v, acc, st, step) => {
  if (Array.isArray(v) && v.length) acc.ch[field] = v.map((x) => labelOf(step, x)).join(" · ");
};
const addScope = (acc, key, note) => {
  if (!acc.scope.has(key)) acc.scope.set(key, { note: note || "מהשאלון" });
};
// chips שממופים ל-scope: option.scope = מפתח אחד או מערך
const chipsToScope = (v, acc, st, step) => {
  for (const val of v || []) {
    const opt = step.options.find((o) => o.value === val);
    if (!opt || !opt.scope) continue;
    for (const k of [].concat(opt.scope)) addScope(acc, k, opt.scopeNote || "מהשאלון");
    if (opt.kitchen) acc.kitchen = true; // מטבח חוץ — לתוספת band
  }
};

// chips + הטקסט החופשי של "משהו נוסף" (answers[<id>_other]) — נכנס לסקופ
// כפריט "אחר" עם הטקסט כהערה, כך שהוא מגיע גם לאפיון וגם להצעה
const chipsWithOther = (v, acc, st, step) => {
  chipsToScope(v, acc, st, step);
  const t = st.answers[step.id + "_other"];
  if (t) {
    const cur = acc.scope.get("other");
    if (cur) cur.note = (cur.note ? cur.note + " · " : "") + t;
    else acc.scope.set("other", { note: t });
    acc.notes.push("ביקשו עוד: " + t);
  }
};

// ---- שאלות משותפות (משוכפלות בין מסלולים עם id שונה) ----
const styleStep = (id) => ({
  id,
  type: "single",
  title: "איזה סגנון מדבר אליכם?",
  subtitle: "כיוון ראשוני, אפשר להתחרט",
  options: [
    {
      value: "natural_wild",
      label: "פרא וצמחייה עבותה",
      sub: "רב-שכבתי, ירוק עז, חי",
      img: IMG.yuvalRosio,
    },
    {
      value: "mediterranean",
      label: "ים-תיכוני חם",
      sub: "אבן, עצים, גוונים ארציים",
      img: IMG.tzahala,
    },
    {
      value: "minimal",
      label: "מינימליסטי ונקי",
      sub: "קווים נקיים, פחות זה יותר",
      img: IMG.benShafrot,
    },
    {
      value: "other",
      label: "משהו אחר בראש",
      sub: "ספרו לנו, או תנו לנו להפתיע",
      img: IMG.nineCloud,
      textInput: true,
    },
  ],
  apply: (v, acc, st, step) => {
    if (!v) return;
    acc.ch.style = v;
    if (v === "other") acc.ch.styleOther = st.answers[step.id + "Other"] || "פתוח להצעות";
  },
});

const timelineStep = (id) => ({
  id,
  type: "single",
  title: "מתי הייתם רוצים להתחיל?",
  subtitle: "לא מחייב, עוזר לנו לתכנן קדימה",
  options: [
    { value: "asap", label: "כמה שיותר מהר", icon: "⚡" },
    { value: "m1_3", label: "בחודש–שלושה הקרובים", icon: "📅" },
    { value: "m6", label: "בחצי השנה הקרובה", icon: "🗓️" },
    { value: "checking", label: "רק בודק/ת בינתיים", icon: "🌅" },
  ],
  apply: setChLabel("urgency"),
});

// קוד P — הסיווג שקובע איזה שירות הליד צריך. הערכים והתוויות מסונכרנים עם
// domain/characterization.ts ו-domain/quote-services.ts בדשבורד: P0→ביצוע,
// P1→תכנון ממוקד, P2→תכנון מלא. השאלון מעולם לא שלח את השדה הזה, ולכן כל
// ליד נחת בלי מסלול והסיווג נעשה ידנית בשיחה.
const pcodeStep = (id) => ({
  id,
  type: "single",
  cols: 1,
  title: "מה כבר יש לכם ביד?",
  subtitle: "זה מה שקובע איזה שירות מתאים לכם",
  options: [
    {
      value: "P2",
      label: "כלום עדיין, מתחילים מאפס",
      sub: "רוב הפרויקטים מתחילים בדיוק כאן",
      icon: "🌱",
    },
    {
      value: "P1",
      label: "יש כיוון או תכנון חלקי",
      sub: "תוכנית אדריכל, סקיצה, או רעיון מגובש",
      icon: "📐",
    },
    {
      value: "P0",
      label: "יש תוכנית וכתב כמויות מוכנים",
      sub: "מחפשים מי שיבצע",
      icon: "📋",
    },
  ],
  apply: (v, acc) => {
    if (v) acc.ch.pCode = v;
  },
});

const cityStep = (id) => ({
  id,
  type: "text",
  title: "איפה נמצא הנכס?",
  subtitle: "עיר או שכונה",
  placeholder: "למשל: תל אביב",
  datalist: CITIES,
  // רחוב — לא חובה. נשמר תחת <id>_sub ומצטרף לעיר בשדה המיקום; הדשבורד
  // ממילא מנרמל עיר מתוך טקסט חופשי (lib/hebrew/city.ts), והרחוב נשאר
  // מידע שימושי בכרטיס.
  subField: { label: "רחוב ומספר", placeholder: "לא חובה" },
  apply: (v, acc, st, step) => {
    if (!v) return;
    const street = st.answers[step.id + "_sub"];
    acc.lead.area = street ? `${v}, ${street}` : v;
  },
});

const contactStep = (id, extraField) => ({
  id,
  type: "contact",
  title: "הפרופיל שלכם מוכן. לאן נחזור אליכם?",
  extraField: extraField || null,
});

// ---- S0 + S1 ----
export const COMMON = [
  {
    id: "S0",
    type: "info",
    hideProgress: true,
    title: "בואו נאפיין את החלל שלכם",
    subtitle: "כשתי דקות, שאלה אחת בכל פעם. בסוף: פרופיל הפרויקט, המסלול שמתאים לכם, והצעד הבא.",
    cta: "מתחילים",
    trust: "ללא התחייבות · הפרטים נשארים אצלנו בלבד",
    /* "מתחילים" אחרי ביקור במסלול המהיר = חזרה לשאלון המלא. האיפוס
       חייב לשבת כאן ולא רק ב-boot: אחרי "חזרה" המנוע מרנדר את ה-S0
       הזה (לא את העותק של boot), ובלי האיפוס S1 נשאר מוסתר והכפתור
       קופץ בשקט שוב לשער הפרטים. */
    onCta: (ctx) => {
      if (ctx.state.flow === "quick") {
        ctx.state.flow = null;
        ctx.state.propertyType = null;
        ctx.save();
      }
      ctx.next();
    },
    /* המסלול המהיר — רשת הביטחון של המשפך. מי שלא רוצה או לא יכול
       למלא שאלון (מבוגרים, חוסר זמן, חוסר סבלנות) לא הולך לאיבוד:
       פרטים + בחירת חלון שיחה, וזהו. מייל הברכה ממילא מציע את האפיון
       שוב אחר כך, עם קישור ?lid= שממזג לאותו כרטיס.
       ⚠️ בזרימת ההמשך (resume) הקישור נעלם — boot() דורס את secondary
       ב"להתחיל מחדש", וזה נכון: מי שבאמצע שאלון לא צריך מסלול עוקף. */
    secondary: {
      label: "מעדיפים בלי שאלון? השאירו פרטים ונתאם שיחה",
      onClick: (ctx) => {
        ctx.state.flow = "quick";
        ctx.state.propertyType = "other";
        ctx.track("quiz_quick_path", { from: "S0" });
        ctx.save();
        ctx.next();
      },
    },
  },
  {
    id: "S1",
    type: "single",
    title: "איזה חלל אנחנו הופכים לפרא?",
    // במסלול המהיר אין בחירת חלל — next() מ-S0 מדלג הישר לפרטים,
    // ו"חזרה" מדלגת עליו באותו אופן.
    showIf: (s) => s.flow !== "quick",
    options: [
      {
        value: "balcony",
        label: "מרפסת",
        sub: "גם קטנה, זה המגרש הביתי שלנו",
        img: IMG.mishtalah,
        flow: "balcony",
        propertyType: "balcony",
      },
      {
        value: "roof",
        label: "גג / גינת גג",
        sub: "שטח פתוח עם פוטנציאל גדול",
        img: IMG.nineCloud,
        flow: "balcony",
        propertyType: "roof_garden",
      },
      {
        value: "penthouse",
        label: "פנטהאוז",
        sub: "מרפסות גדולות, סטנדרט גבוה",
        img: IMG.benShafrot,
        flow: "balcony",
        propertyType: "penthouse",
      },
      {
        value: "garden",
        label: "גינה פרטית / וילה",
        sub: "קרקע, אדמה, שורשים",
        img: IMG.yuvalRosio,
        flow: "garden",
        propertyType: "ground_garden",
      },
      {
        value: "business",
        label: "עסק או משרד",
        sub: "ירוק שעובד בשבילכם",
        img: IMG.office,
        flow: "business",
        propertyType: "office",
      },
      {
        value: "building",
        label: "שטח משותף בבניין",
        sub: "לובי, חצר, גג משותף",
        img: IMG.tzahala,
        flow: "building",
        propertyType: "other",
      },
    ],
    effect: (v, state, step) => {
      const opt = step.options.find((o) => o.value === v);
      if (opt) {
        state.flow = opt.flow;
        state.propertyType = opt.propertyType;
      }
    },
  },
];

// ---- מסלול A: מרפסת / גג / פנטהאוז ----
// הרצף קוצר מ-16 מסכים ל-8 (31.8.2026). מה שירד — כיוון, רוח, גישה, מצב
// קיים, השקיה, העדפות-שלילה, שמש, תקציב וטקסט חופשי — נמדד ממילא בפגישת
// השטח לפי תבנית-פרוגרמה.md, שקובעת מפורשות "לא לאסוף מחדש מה שהאפיון
// כבר יודע". פירוט והנמקה: docs/תוכנית-זיקוק-השאלון.md
//
// ⚠️ מסך התמונות יושב **לפני** שער הפרטים ולא אחריו, בכוונה: הליד נשלח
// בשער, והקליטה מדדפת לפי external_id ומתעלמת משליחה שנייה. בורר הקבצים
// בנייד מסתיר את הדף ומפעיל את ה-beacon — כלומר תמונות שנבחרו אחרי
// השליחה היו נמחקות בשקט.
const FLOW_A = [
  cityStep("A_city"),
  pcodeStep("A_pcode"),
  {
    id: "A_designer_intro",
    type: "info",
    title: "עכשיו החלק הכיף: משרטטים את המרפסת",
    subtitle:
      "בחרו צורה וגודל, וגררו פנימה מה שקיים היום ומה שאתם חולמים עליו. שתי דקות של משחק, שנותנות לנו בסיס אמיתי לתכנון.",
    cta: "פותחים את הלוח",
    trust: "אפשר גם בלי הלוח — התשובות בשאלות מספיקות לנו לגמרי.",
    // ניקוי דגל הדילוג גם בכניסה מהכפתור הראשי: מי שדילג, חזר אחורה
    // והתחרט — בלי זה הדגל נשאר דלוק, הלוח נשאר מוסתר (showIf), והכפתור
    // "פותחים את הלוח" קפץ בשקט ישר לשאלות. באג שירין תפס 31.8.
    onCta: (ctx) => {
      delete ctx.state.answers.A_designer_skipped;
      ctx.save();
      ctx.next();
    },
    secondary: {
      // כפתור ולא קישור-דילוג קטן (בקשת ירין 2.9.2026): הלוח נראה כמו
      // תנאי להמשך, ומי שלא רוצה לצייר נוטש במקום לבחור את הנתיב השני.
      strong: true,
      label: "אענה בשאלות במקום",
      onClick: (ctx) => {
        ctx.state.answers.A_designer_skipped = true;
        ctx.track("quiz_designer_skip", { from: "intro" });
        ctx.save();
        ctx.next();
      },
    },
  },
  {
    id: "A_designer",
    type: "designer",
    title: "המרפסת שלכם",
    showIf: (s) => !s.answers.A_designer_skipped,
  },
  {
    id: "A_fallback_size",
    type: "stepper",
    title: "מה הגודל המשוער?",
    subtitle: "בערך, לא צריך סרט מדידה",
    unit: "מ״ר",
    min: 2,
    max: 400,
    initial: 12,
    presets: [
      { label: "עד 10 מ״ר", value: 8 },
      { label: "10–20", value: 15 },
      { label: "20–40", value: 30 },
      { label: "מעל 40", value: 50 },
    ],
    showIf: (s) => !!s.answers.A_designer_skipped,
    apply: (v, acc) => {
      if (v) acc.lead.sizeSqm = v;
    },
  },
  {
    id: "A_fallback_wants",
    type: "chips",
    title: "מה הייתם רוצים שיהיה?",
    subtitle: "בחרו כמה שבא לכם",
    options: [
      { value: "plants", label: "צמחייה ועצים", scope: ["planting", "trees"] },
      { value: "pots", label: "אדניות וכלים", scope: "pots" },
      { value: "pergola", label: "פרגולה או הצללה", scope: "pergola" },
      { value: "deck", label: "דק", scope: "deck" },
      { value: "lighting", label: "תאורה", scope: "lighting" },
      { value: "seating", label: "פינת ישיבה", scope: "furniture" },
      { value: "water", label: "אלמנט מים", scope: "water" },
      { value: "kitchen", label: "מטבח חוץ", scope: "other", scopeNote: "מטבח חוץ", kitchen: true },
    ],
    other: { label: "משהו נוסף…", placeholder: "מה עוד הייתם רוצים?" },
    showIf: (s) => !!s.answers.A_designer_skipped,
    apply: chipsWithOther,
  },
  styleStep("A_style"),
  {
    id: "A_priority",
    type: "chips",
    // תקרה 4 מתוך 6 ולא 2 (בקשת ירין 2.9.2026). תקרה נמוכה גרמה לחלק
    // מהצרכים להישאר בחוץ — ודווקא הם מה שמזין את סעיפי הסקופ בהצעה.
    max: 4,
    title: "מה הכי חשוב שהחלל ייתן לכם?",
    options: [
      { value: "hosting", label: "פינת ישיבה ואירוח" },
      { value: "green", label: "ירוק ופרטיות" },
      { value: "quiet", label: "פינה שקטה לעצמי" },
      { value: "kids", label: "מרחב לילדים" },
      { value: "herbs", label: "תבלינים וירקות" },
      { value: "value", label: "ערך לנכס" },
    ],
    apply: joinLabels("requested"),
  },
  timelineStep("A_timeline"),
  {
    id: "A_photos",
    type: "upload",
    skippable: true,
    skipLabel: "אצרף אחר כך",
    maxFiles: 6,
    title: "רוצים לצרף תמונות של החלל?",
    subtitle: "עד 6 תמונות, אפשר גם תוכנית (PDF). זה עוזר לנו להגיע מוכנים, ולתת הצעה מדויקת.",
  },
  contactStep("A_contact"),
  { id: "A_result", type: "result" },
];

// ---- מסלול B: גינה פרטית ----
// קוצר מ-15 מסכים ל-10 (31.8.2026), באותו היגיון של מסלול A. ירדו: מצב
// קיים, מה קיים בשטח, שמש, סימון נקודות על התמונה, תקציב וטקסט חופשי.
// סימון הנקודות (B_pins) הוא ויתור מודע — הוא מרתק, אבל הוא מסך נוסף
// שתלוי בהעלאת תמונות, וגינה נמדדת ממילא בסיור.
const FLOW_B = [
  {
    id: "B_subtype",
    type: "single",
    title: "איזה סוג נכס?",
    options: [
      { value: "ground_garden", label: "בית פרטי או דירת גן", icon: "🏡" },
      { value: "villa", label: "וילה", icon: "🏛️" },
    ],
    effect: (v, state) => {
      state.propertyType = v;
    },
  },
  cityStep("B_city"),
  pcodeStep("B_pcode"),
  {
    id: "B_size",
    type: "stepper",
    title: "מה גודל הגינה בערך?",
    subtitle: "הערכה גסה מספיקה",
    unit: "מ״ר",
    min: 10,
    max: 2000,
    step: 10,
    initial: 80,
    presets: [
      { label: "עד 50 מ״ר", value: 40 },
      { label: "50–100", value: 80 },
      { label: "100–250", value: 170 },
      { label: "מעל 250", value: 300 },
    ],
    apply: (v, acc) => {
      if (v) acc.lead.sizeSqm = v;
    },
  },
  {
    id: "B_wants",
    type: "chips",
    title: "מה תרצו שיהיה בגינה?",
    subtitle: "בחרו כמה שבא לכם",
    options: [
      { value: "lawn", label: "דשא", scope: "lawn" },
      { value: "deck", label: "דק", scope: "deck" },
      { value: "pergola", label: "פרגולה", scope: "pergola" },
      { value: "shading", label: "הצללה", scope: "shading" },
      { value: "furniture", label: "ריהוט ופינות ישיבה", scope: "furniture" },
      { value: "lighting", label: "תאורת גן", scope: "lighting" },
      { value: "irrigation", label: "מערכת השקיה", scope: "irrigation" },
      { value: "trees", label: "עצים", scope: "trees" },
      { value: "planting", label: "ערוגות וצמחייה", scope: "planting" },
      { value: "paving", label: "ריצוף ושבילים", scope: "paving" },
      { value: "water", label: "אלמנט מים", scope: "water" },
      { value: "demolition", label: "פינוי וניקוי שטח", scope: "demolition" },
      { value: "kitchen", label: "מטבח חוץ", scope: "other", scopeNote: "מטבח חוץ", kitchen: true },
    ],
    other: { label: "משהו נוסף…", placeholder: "מה עוד הייתם רוצים בגינה?" },
    apply: chipsWithOther,
  },
  styleStep("B_style"),
  {
    id: "B_maintenance",
    type: "single",
    title: "וכמה תחזוקה מתאימה לכם?",
    cols: 1,
    options: [
      { value: "m_full", label: "שאתם תתחזקו, שיישאר מושלם", icon: "🤝" },
      { value: "m_diy", label: "אני בעניין של ידיים באדמה, עם ליווי שלכם", icon: "🧤" },
      { value: "m_minimal", label: "גינה עצמאית שדורשת מינימום", icon: "🌵" },
    ],
    apply: (v, acc) => {
      if (v === "m_full") addScope(acc, "maintenance", "מהשאלון: תחזוקה שוטפת");
      if (v === "m_diy") acc.notes.push("רוצה מעורבות אישית בגינון + ליווי");
      if (v === "m_minimal")
        acc.ch.notWanted = (acc.ch.notWanted ? acc.ch.notWanted + " · " : "") + "תחזוקה גבוהה";
    },
  },
  timelineStep("B_timeline"),
  {
    id: "B_photos",
    type: "upload",
    skippable: true,
    skipLabel: "אצרף אחר כך",
    maxFiles: 8,
    title: "צרפו כמה תמונות של הגינה",
    subtitle: "עד 8 תמונות מכיוונים שונים, אפשר גם תוכנית מדידה (PDF).",
  },
  contactStep("B_contact"),
  { id: "B_result", type: "result" },
];

// ---- מסלול C: עסק / משרד ----
const FLOW_C = [
  {
    id: "C_type",
    type: "single",
    title: "איזה עסק?",
    options: [
      { value: "office", label: "משרד", icon: "🏢" },
      { value: "restaurant", label: "מסעדה או בית קפה", icon: "☕" },
      { value: "storefront", label: "חנות או חזית מסחרית", icon: "🏬" },
      { value: "hotel", label: "מלון או אירוח", icon: "🛎️" },
      { value: "other_biz", label: "אחר", icon: "✨" },
    ],
    effect: (v, state) => {
      state.propertyType = v === "office" ? "office" : "business";
    },
    apply: (v, acc, st, step) => {
      acc.notes.push("סוג עסק: " + labelOf(step, v));
    },
  },
  {
    id: "C_space",
    type: "chips",
    title: "איפה הירוק ייכנס?",
    options: [
      { value: "balcony", label: "מרפסת או גג" },
      { value: "yard", label: "חצר" },
      { value: "front", label: "כניסה וחזית" },
      { value: "indoor", label: "בתוך החלל (צמחייה פנימית)" },
    ],
    apply: (v, acc, st, step) => {
      if (v && v.length) acc.notes.push("אזורים: " + v.map((x) => labelOf(step, x)).join(", "));
    },
  },
  {
    id: "C_size",
    type: "stepper",
    title: "מה גודל השטח בערך?",
    unit: "מ״ר",
    min: 2,
    max: 1000,
    initial: 30,
    presets: [
      { label: "עד 20 מ״ר", value: 15 },
      { label: "20–50", value: 35 },
      { label: "50–150", value: 100 },
      { label: "מעל 150", value: 200 },
    ],
    apply: (v, acc) => {
      if (v) acc.lead.sizeSqm = v;
    },
  },
  {
    id: "C_goal",
    type: "chips",
    title: "מה זה צריך לעשות בשבילכם?",
    options: [
      { value: "wellbeing", label: "רווחת עובדים" },
      { value: "impression", label: "רושם ללקוחות" },
      { value: "branding", label: "מיתוג וצילומים" },
      { value: "unused", label: "ניצול שטח שעומד ריק" },
    ],
    apply: joinLabels("requested"),
  },
  {
    id: "C_maintenance",
    type: "single",
    cols: 1,
    title: "מעניין אתכם גם טיפול שוטף?",
    options: [
      { value: "yes", label: "כן, חשוב שיישאר מושלם" },
      { value: "maybe", label: "אולי, נשמח לשמוע" },
      { value: "no", label: "לא כרגע" },
    ],
    apply: (v, acc) => {
      if (v === "yes") addScope(acc, "maintenance", "מהשאלון: תחזוקה שוטפת");
      if (v === "maybe") acc.notes.push("פתוח לשמוע על תחזוקה שוטפת");
    },
  },
  {
    id: "C_timeline",
    type: "single",
    title: "יש תאריך יעד? (פתיחה, אירוע)",
    options: [
      { value: "asap", label: "כמה שיותר מהר", icon: "⚡" },
      { value: "months", label: "בחודשים הקרובים", icon: "📅" },
      { value: "none", label: "אין דדליין", icon: "🌊" },
    ],
    apply: setChLabel("urgency"),
  },
  contactStep("C_contact", { key: "business", label: "שם העסק", required: true }),
  {
    id: "C_result",
    type: "result",
    variant: "lite",
    title: "קיבלנו. עכשיו תורנו.",
    subtitle:
      "הצעות לעסקים נבנות לפי מפרט מדויק, ולכן מתחילים בשיחה קצרה. חוזרים אליכם תוך יום עסקים.",
  },
];

// ---- מסלול D: בניין משותף ----
const FLOW_D = [
  {
    id: "D_role",
    type: "single",
    title: "מה התפקיד שלך בתהליך?",
    cols: 1,
    options: [
      { value: "vaad", label: "נציג/ת ועד הבית" },
      { value: "resident", label: "דייר/ת שמקדם/ת את הרעיון" },
      { value: "management", label: "חברת ניהול" },
    ],
    apply: (v, acc, st, step) => {
      acc.notes.push("תפקיד: " + labelOf(step, v));
    },
  },
  {
    id: "D_space",
    type: "chips",
    title: "אילו אזורים בבניין?",
    options: [
      { value: "lobby", label: "לובי וכניסה" },
      { value: "yard", label: "חצר משותפת" },
      { value: "roof", label: "גג משותף" },
      { value: "parking", label: "חניון ושבילים" },
    ],
    apply: (v, acc, st, step) => {
      if (v && v.length) acc.notes.push("אזורים: " + v.map((x) => labelOf(step, x)).join(", "));
    },
  },
  {
    id: "D_size",
    type: "stepper",
    title: "מה גודל השטח בערך?",
    unit: "מ״ר",
    min: 5,
    max: 1000,
    initial: 40,
    presets: [
      { label: "עד 30 מ״ר", value: 20 },
      { label: "30–100", value: 60 },
      { label: "מעל 100", value: 150 },
    ],
    skippable: true,
    skipLabel: "לא בטוח/ה, דלגו",
    apply: (v, acc) => {
      if (v) acc.lead.sizeSqm = v;
    },
  },
  {
    id: "D_stage",
    type: "single",
    cols: 1,
    title: "איפה זה עומד?",
    options: [
      { value: "budget", label: "יש תקציב מאושר" },
      { value: "quotes", label: "אוספים הצעות לאסיפת דיירים" },
      { value: "idea", label: "רעיון ראשוני שצריך לגבש" },
    ],
    apply: (v, acc, st, step) => {
      acc.ch.urgency = labelOf(step, v);
      acc.notes.push("שלב: " + labelOf(step, v));
    },
  },
  contactStep("D_contact"),
  {
    id: "D_result",
    type: "result",
    variant: "lite",
    title: "קיבלנו.",
    subtitle:
      "חוזרים אליכם תוך יום עסקים לשיחה קצרה, ואחריה נכין הצעה מסודרת שנוח להציג לאסיפת הדיירים, עם פירוט ותמונות.",
  },
];

// ---- מסלול מהיר: בלי שאלון, רק פרטים + חלון שיחה ----
// נכנסים אליו מהקישור המשני שבמסך הפתיחה. שני מסכים בלבד: שער פרטים
// (הליד נשלח בו, כרגיל) ומסך תוצאה בווריאנט "call" שכולו בורר השיחה.
// הליד מגיע לדשבורד בלי characterization — ולכן מקבל את מייל הברכה
// שמזמין לאפיון, לא את מייל הפרופיל הריק.
const FLOW_Q = [
  {
    id: "Q_contact",
    type: "contact",
    // הפס היה מציג 100% על השאלה היחידה במסלול — מסתירים אותו
    hideProgress: true,
    title: "משאירים פרטים, ובוחרים מתי נוח לדבר",
    subtitle: "בלי שאלון. שיחת היכרות קצרה עם ירין או עידו, ומשם ממשיכים יחד.",
    cta: "המשך לבחירת זמן ←",
  },
  { id: "Q_result", type: "result", variant: "call" },
];

export const FLOWS = {
  balcony: FLOW_A,
  garden: FLOW_B,
  business: FLOW_C,
  building: FLOW_D,
  quick: FLOW_Q,
};

// deep-link ?type= → בחירת מסלול מראש (מדלג על S1)
export const TYPE_MAP = {
  balcony: { flow: "balcony", propertyType: "balcony" },
  roof: { flow: "balcony", propertyType: "roof_garden" },
  penthouse: { flow: "balcony", propertyType: "penthouse" },
  garden: { flow: "garden", propertyType: "ground_garden" },
  business: { flow: "business", propertyType: "office" },
  building: { flow: "building", propertyType: "other" },
};
