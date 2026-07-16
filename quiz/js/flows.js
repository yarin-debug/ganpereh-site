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
const setCh = (field, map) => (v, acc) => {
  const out = map ? map[v] : v;
  if (out !== undefined && out !== null && out !== "") acc.ch[field] = out;
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

// ---- שאלות משותפות (משוכפלות בין מסלולים עם id שונה) ----
const sunStep = (id) => ({
  id,
  type: "single",
  title: "כמה שמש מקבל החלל?",
  subtitle: "אפשר להעריך, נדייק בביקור",
  options: [
    { value: "full", label: "שמש מלאה רוב היום", sub: "6+ שעות", icon: "☀️" },
    { value: "partial", label: "שמש חלקית, כמה שעות", icon: "⛅" },
    { value: "shade", label: "מוצל רוב היום", icon: "☁️" },
    { value: "unsure", label: "לא בטוח/ה", icon: "🤔" },
  ],
  apply: (v, acc) => {
    if (v === "unsure") acc.notes.push("חשיפת שמש: לבדוק בביקור");
    else if (v) acc.ch.sunExposure = v;
  },
});

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
    { value: "other", label: "תפתיעו אותי", sub: "פתוחים להצעה שלכם", img: IMG.nineCloud },
  ],
  apply: (v, acc) => {
    if (!v) return;
    acc.ch.style = v;
    if (v === "other") acc.ch.styleOther = "פתוח להצעות";
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

const cityStep = (id) => ({
  id,
  type: "text",
  title: "איפה נמצא הנכס?",
  subtitle: "עיר או שכונה",
  placeholder: "למשל: תל אביב",
  datalist: CITIES,
  apply: (v, acc) => {
    if (v) acc.lead.area = v;
  },
});

const freetextStep = (id) => ({
  id,
  type: "text",
  multiline: true,
  optional: true,
  skippable: true,
  skipLabel: "אין, סיימנו",
  title: "משהו נוסף שכדאי שנדע?",
  placeholder: "בעל חיים שמסתובב במרפסת, אירוע מתקרב, רעיון שראיתם…",
  apply: (v, acc) => {
    if (v) acc.notes.push(v);
  },
});

const contactStep = (id, extraField) => ({
  id,
  type: "contact",
  title: "הפרופיל שלכם מוכן. לאן לשלוח את ההצעה האישית?",
  extraField: extraField || null,
});

// ---- S0 + S1 ----
export const COMMON = [
  {
    id: "S0",
    type: "info",
    hideProgress: true,
    title: "בואו נאפיין את החלל שלכם",
    subtitle:
      "כ-4 דקות, שאלה אחת בכל פעם. בסוף: פרופיל פרויקט, רמת השקעה משוערת, והצעה אישית תוך 24–48 שעות.",
    cta: "מתחילים",
    trust: "ללא התחייבות · הפרטים נשארים אצלנו בלבד",
  },
  {
    id: "S1",
    type: "single",
    title: "איזה חלל אנחנו הופכים לפרא?",
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
const FLOW_A = [
  cityStep("A_city"),
  {
    id: "A_designer_intro",
    type: "info",
    title: "עכשיו החלק הכיף: משרטטים את המרפסת",
    subtitle:
      "בחרו צורה וגודל, וגררו פנימה מה שקיים היום ומה שאתם חולמים עליו. שתי דקות של משחק, ובצד שלנו זה שווה זהב לתכנון.",
    cta: "פותחים את הלוח",
    secondary: {
      label: "דלגו, אענה בשאלות",
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
    id: "A_fallback_existing",
    type: "chips",
    title: "מה קיים היום בחלל?",
    options: [
      { value: "water", label: "נקודת מים 🚰" },
      { value: "electric", label: "נקודת חשמל ⚡" },
      { value: "pergola", label: "פרגולה" },
      { value: "deck", label: "דק" },
      { value: "furniture", label: "ריהוט גן" },
      { value: "pots", label: "עציצים וצמחים" },
      { value: "nothing", label: "כלום עדיין" },
    ],
    showIf: (s) => !!s.answers.A_designer_skipped,
    apply: (v, acc, st, step) => {
      const labels = (v || []).filter((x) => x !== "nothing").map((x) => labelOf(step, x));
      if (labels.length) acc.existingParts.push(...labels);
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
    showIf: (s) => !!s.answers.A_designer_skipped,
    apply: chipsToScope,
  },
  sunStep("A_sun"),
  {
    id: "A_direction",
    type: "single",
    skippable: true,
    title: "לאיזה כיוון פונה החלל?",
    options: [
      { value: "דרום", label: "דרום", sub: "הכי שמשי" },
      { value: "מערב", label: "מערב", sub: "שמש אחר הצהריים" },
      { value: "מזרח", label: "מזרח", sub: "שמש בוקר" },
      { value: "צפון", label: "צפון", sub: "מוצל יחסית" },
    ],
    apply: setCh("sunDirection"),
  },
  {
    id: "A_wind",
    type: "single",
    title: "ומה עם רוח?",
    options: [
      { value: "na", label: "מוגן, כמעט ואין", icon: "🌿" },
      { value: "mild", label: "מורגשת אבל נעימה", icon: "🍃" },
      { value: "strong", label: "חזקה, קומה גבוהה או גג פתוח", icon: "💨" },
    ],
    apply: setCh("wind"),
  },
  {
    id: "A_access",
    type: "composite",
    title: "גישה ולוגיסטיקה",
    subtitle: "עצים ואדניות צריכים לעלות איכשהו 🙂",
    groups: [
      {
        key: "floor",
        type: "stepper",
        label: "באיזו קומה?",
        min: 0,
        max: 40,
        unit: "קומה",
        initial: 2,
      },
      {
        key: "elevator",
        type: "seg",
        label: "מעלית",
        options: [
          { value: true, label: "יש" },
          { value: false, label: "אין" },
        ],
      },
      {
        key: "parking",
        type: "seg",
        label: "חניה לפריקה ליד הבניין",
        options: [
          { value: "yes", label: "יש" },
          { value: "no", label: "אין" },
          { value: "unsure", label: "לא בטוח/ה" },
        ],
      },
    ],
    apply: (v, acc) => {
      if (!v) return;
      acc.ch.accessFloor = String(v.floor ?? "");
      if (typeof v.elevator === "boolean") acc.ch.hasElevator = v.elevator;
      if (v.parking === "yes") acc.ch.hasUnloadingParking = true;
      if (v.parking === "no") acc.ch.hasUnloadingParking = false;
    },
  },
  {
    id: "A_state",
    type: "single",
    title: "מה המצב היום?",
    options: [
      { value: "empty", label: "ריק לגמרי, מתחילים מאפס", icon: "🟫" },
      { value: "some", label: "יש קצת, צריך שדרוג", icon: "🌱" },
      { value: "renew", label: "גינה קיימת שצריך לחדש", icon: "🔄" },
      { value: "reno", label: "באמצע או אחרי שיפוץ", icon: "🛠️" },
    ],
    apply: setChLabel("existingState"),
  },
  {
    id: "A_irrigation",
    type: "single",
    title: "יש מערכת השקיה?",
    options: [
      { value: "none", label: "אין", icon: "🚱" },
      { value: "basic", label: "יש, בסיסית", icon: "💧" },
      { value: "computer", label: "יש, עם מחשב השקיה", icon: "🖥️" },
      { value: "unsure", label: "לא בטוח/ה", icon: "🤔" },
    ],
    apply: (v, acc) => {
      if (v === "none") acc.ch.irrigationExisting = "none";
      if (v === "basic") acc.ch.irrigationExisting = "exists";
      if (v === "computer") {
        acc.ch.irrigationExisting = "exists";
        acc.ch.irrigationComputerized = true;
      }
    },
  },
  styleStep("A_style"),
  {
    id: "A_priority",
    type: "chips",
    max: 2,
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
  {
    id: "A_avoid",
    type: "chips",
    skippable: true,
    skipLabel: "אין, הכול פתוח",
    title: "משהו שפחות מתאים לכם?",
    options: [
      { value: "maintenance", label: "תחזוקה גבוהה" },
      { value: "shedding", label: "עצים נשירים שמלכלכים" },
      { value: "water", label: "מים עומדים (יתושים)" },
      { value: "allergy", label: "צמחייה אלרגנית" },
    ],
    apply: joinLabels("notWanted"),
  },
  {
    id: "A_photos",
    type: "upload",
    skippable: true,
    skipLabel: "אצרף אחר כך",
    maxFiles: 6,
    title: "רוצים לצרף תמונות של החלל?",
    subtitle: "עד 6 תמונות, אפשר גם תוכנית (PDF). זה עוזר לנו להגיע מוכנים, ולתת הצעה מדויקת.",
  },
  timelineStep("A_timeline"),
  {
    id: "A_budget",
    type: "single",
    skippable: true,
    skipLabel: "אעדיף שתמליצו",
    cols: 1,
    title: "יש מסגרת השקעה שנוח לכם לחשוב עליה?",
    options: [
      { value: "b25", label: "עד ‏25,000 ₪" },
      { value: "b50", label: "‏25–50 אלף ₪" },
      { value: "b100", label: "‏50–100 אלף ₪" },
      { value: "b100p", label: "מעל ‏100 אלף ₪" },
    ],
    apply: setChLabel("budgetMentioned"),
  },
  freetextStep("A_freetext"),
  contactStep("A_contact"),
  { id: "A_result", type: "result" },
];

// ---- מסלול B: גינה פרטית ----
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
    id: "B_state",
    type: "single",
    title: "מה יש בגינה היום?",
    options: [
      { value: "bare", label: "אדמה חשופה או שטח ריק", icon: "🟫" },
      { value: "neglected", label: "גינה שהוזנחה וצריך להחיות", icon: "🍂" },
      { value: "upgrade", label: "גינה מטופחת שרוצה שדרוג", icon: "🌿" },
      { value: "construction", label: "באמצע בנייה או שיפוץ", icon: "🛠️" },
    ],
    apply: setChLabel("existingState"),
  },
  {
    id: "B_existing",
    type: "chips",
    title: "מה כבר קיים בשטח?",
    options: [
      { value: "lawn", label: "דשא" },
      { value: "trees", label: "עצים בוגרים" },
      { value: "irrigation", label: "מערכת השקיה" },
      { value: "paving", label: "ריצוף או שבילים" },
      { value: "deck", label: "דק" },
      { value: "pergola", label: "פרגולה" },
      { value: "lighting", label: "תאורה" },
      { value: "hedge", label: "גדר חיה" },
      { value: "nothing", label: "כלום" },
    ],
    apply: (v, acc, st, step) => {
      const labels = (v || []).filter((x) => x !== "nothing").map((x) => labelOf(step, x));
      if (labels.length) acc.existingParts.push(...labels);
      if ((v || []).includes("irrigation")) acc.ch.irrigationExisting = "exists";
    },
  },
  {
    id: "B_photos",
    type: "upload",
    skippable: true,
    skipLabel: "אצרף אחר כך",
    maxFiles: 8,
    title: "צרפו כמה תמונות של הגינה",
    subtitle: "עד 8 תמונות מכיוונים שונים, אפשר גם תוכנית מדידה (PDF).",
  },
  {
    id: "B_pins",
    type: "photopins",
    skippable: true,
    skipLabel: "דלגו על הסימון",
    title: "סמנו על התמונה מה יהיה איפה",
    subtitle: "טאפ מוסיף נקודה. בחרו מה יקרה שם. לא מחייב, עוזר לנו להבין את החזון.",
    showIf: (s) => s.uploads.some((u) => u.kind === "image" && u.status !== "failed"),
  },
  sunStep("B_sun"),
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
    apply: chipsToScope,
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
    id: "B_budget",
    type: "single",
    skippable: true,
    skipLabel: "אעדיף שתמליצו",
    cols: 1,
    title: "יש מסגרת השקעה שנוח לכם לחשוב עליה?",
    options: [
      { value: "b40", label: "עד ‏40 אלף ₪" },
      { value: "b80", label: "‏40–80 אלף ₪" },
      { value: "b150", label: "‏80–150 אלף ₪" },
      { value: "b150p", label: "מעל ‏150 אלף ₪" },
    ],
    apply: setChLabel("budgetMentioned"),
  },
  freetextStep("B_freetext"),
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
    subtitle: "הצעות לעסקים נבנות לפי מפרט מדויק. נחזור אליכם תוך יום עסקים עם כיוון ומחיר.",
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
      "נכין הצעה מסודרת שנוח להציג לאסיפת הדיירים, עם פירוט, תמונות ומחיר ברור. נחזור אליכם תוך יום עסקים.",
  },
];

export const FLOWS = { balcony: FLOW_A, garden: FLOW_B, business: FLOW_C, building: FLOW_D };

// deep-link ?type= → בחירת מסלול מראש (מדלג על S1)
export const TYPE_MAP = {
  balcony: { flow: "balcony", propertyType: "balcony" },
  roof: { flow: "balcony", propertyType: "roof_garden" },
  penthouse: { flow: "balcony", propertyType: "penthouse" },
  garden: { flow: "garden", propertyType: "ground_garden" },
  business: { flow: "business", propertyType: "office" },
  building: { flow: "building", propertyType: "other" },
};
