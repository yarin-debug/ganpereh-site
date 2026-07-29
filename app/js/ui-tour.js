/* התדריך הראשוני — חמישה טאבים וצורת ההתנהלות.

   ── שלוש החלטות שקל להפוך ──────────────────────────────────────────

   1. **אין נקודות התקדמות, כי סרגל הטאבים הוא המד.**
      קרוסלה עם נקודות הייתה מוסיפה מד שני למסך שכבר יש בו אחד. במקום
      זה הכרטיס מצביע מטה על הטאב האמיתי, והטאב עצמו נדלק. מה שמסמן
      "איפה אנחנו" הוא בדיוק הפקד שהתדריך מלמד להשתמש בו.

   2. **התדריך מחליף טאבים באמת.**
      הוא לא מתאר את המסכים — הוא פותח אותם. המשתמש רואה את מסך היום
      הריק שלו, לא צילום מסך של מסך של מישהו אחר. מצבי הריק כאן
      נכתבו כהזמנה לפעולה, וזה הרגע שבו הם עושים את העבודה.

   3. **התוכן מעומעם, לא מוצלל.**
      הצללה כהה הייתה מסתירה בדיוק את המסך שהכרטיס מבקש להסתכל בו.
      עמעום משאיר אותו קריא, אומר "עוד לא תורך" — וגם פותר את שני
      המילויים המלאים במסך אחד, כי לחלק מהמסכים יש כפתור חרס משלהם. */

const SEEN_KEY = "gp_meals_tour_seen";

/** האם המכשיר הזה כבר ראה את התדריך. */
export function tourSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // אחסון חסום — עדיף להראות תדריך פעם נוספת מאשר לחסום אותו לגמרי.
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* אחסון חסום — התדריך יופיע שוב בפעם הבאה, וזה המחיר הזול */
  }
}

/* הכרטיסים. חמישה מוצמדים לטאב, והאחרון — צורת ההתנהלות — עומד לבדו
   ולכן אין לו `tab`. */
const CARDS = [
  {
    tab: "today",
    title: "היום",
    body: "מה אוכלים עכשיו, ושני לחצנים לסמן שזה קרה. זה הטאב שנפתח כשפותחים את האפליקציה, כי זו השאלה שבגללה פותחים אותה.",
  },
  {
    tab: "week",
    title: "השבוע",
    body: "כאן מחליטים מה נכנס לכל משבצת. הפס העליון מראה את השבוע במבט אחד — מקווקו זה יום שעוד לא תוכנן, ואריח עם וי זה יום שבישלנו בו.",
  },
  {
    tab: "list",
    title: "קניות",
    body: "נבנית לבד ממה שתוכנן, מקובצת לפי מדפי הסופר. עובדת בלי קליטה — היא נכתבה בשביל המרתף של הסופר.",
  },
  {
    tab: "pantry",
    title: "מזווה",
    body: "מה שכבר בבית יורד מרשימת הקניות. מתעדכן ידנית בלבד: הוא לא ינחש כמה בצל נשאר אחרי שבישלת.",
  },
  {
    tab: "score",
    title: "מאקרו",
    body: "מה נאכל בפועל מול היעדים, לכל אדם. כאן גם עורכים את היעדים ואת מי שבמשק הבית.",
  },
  {
    tab: null,
    title: "עוד שני דברים",
    body: "המסכים מתארים, הם לא שופטים — חריגה היא מידע ולא נזיפה. וכלום לא נמחק: מנה או אדם שמוציאים יורדים מהבחירה, וההיסטוריה נשארת נכונה.",
  },
];

/**
 * מריץ את התדריך.
 *
 * @param {object} options
 * @param {(screen: string) => void} options.onShow  מחליף טאב באמת
 * @param {() => void} options.onDone
 */
export function startTour({ onShow, onDone }) {
  const root = document.getElementById("tour");
  let index = 0;

  const finish = () => {
    markSeen();
    root.hidden = true;
    root.replaceChildren();
    removeEventListener("resize", place);
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("is-touring");
    for (const tab of document.querySelectorAll(".tab")) tab.classList.remove("is-tour");
    onDone();
  };

  function onKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    finish();
  }

  /* מיקום החץ נגזר מהמלבן האמיתי של הטאב ולא מחשבון של אחוזים. זו
     הצורה היחידה שנכונה גם ב-RTL, גם כשמספר הטאבים ישתנה, וגם כשגופן
     המערכת מרחיב תווית אחת יותר מהאחרות. */
  function place() {
    const card = root.querySelector(".tour-card");
    const notch = root.querySelector(".tour-notch");
    if (!card || !notch) return;

    const target = CARDS[index].tab;
    if (!target) {
      notch.hidden = true;
      return;
    }
    const tab = document.getElementById(`tab-${target}`);
    if (!tab) {
      notch.hidden = true;
      return;
    }
    const rect = tab.getBoundingClientRect();
    notch.hidden = false;
    notch.style.left = `${rect.left + rect.width / 2}px`;
    /* מרכזו יושב מעט *מעל* קצה הכרטיס. החץ מצויר מעליו בערימה, כך
       שהרקע שלו מוחק את קטע הגבול התחתון ושתי צלעותיו ממשיכות את
       קו המתאר — זנב של בועה, לא שברון שמרחף מתחת לקו ישר. */
    notch.style.top = `${card.getBoundingClientRect().bottom - 5}px`;
  }

  function render() {
    const card = CARDS[index];

    for (const tab of document.querySelectorAll(".tab")) {
      tab.classList.toggle("is-tour", !!card.tab && tab.dataset.screen === card.tab);
    }
    if (card.tab) onShow(card.tab);

    const panel = document.createElement("div");
    panel.className = "tour-card";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "תדריך");

    const count = document.createElement("p");
    count.className = "tour-count";
    count.textContent = `${index + 1} מתוך ${CARDS.length}`;

    const title = document.createElement("h2");
    title.className = "tour-title";
    title.textContent = card.title;
    title.tabIndex = -1;

    const body = document.createElement("p");
    body.className = "tour-body";
    body.textContent = card.body;

    const next = document.createElement("button");
    next.type = "button";
    next.className = "act act-primary act-wide";
    next.textContent = index === CARDS.length - 1 ? "מתחילים" : "הבא";
    next.addEventListener("click", () => {
      if (index === CARDS.length - 1) return finish();
      index++;
      render();
    });

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "tour-skip";
    skip.textContent = "לדלג על התדריך";
    skip.addEventListener("click", finish);

    panel.append(count, title, body, next);
    // בכרטיס האחרון אין על מה לדלג — "מתחילים" הוא אותה פעולה בדיוק,
    // ושני כפתורים לאותו דבר הם שאלה מיותרת.
    if (index < CARDS.length - 1) panel.append(skip);

    const notch = document.createElement("span");
    notch.className = "tour-notch";
    notch.setAttribute("aria-hidden", "true");

    const block = document.createElement("div");
    block.className = "tour-block";

    root.replaceChildren(block, panel, notch);
    place();
    title.focus({ preventScroll: true });
  }

  root.hidden = false;
  document.body.classList.add("is-touring");
  addEventListener("resize", place);
  document.addEventListener("keydown", onKey);
  render();
}
