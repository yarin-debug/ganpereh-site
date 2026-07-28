/* מסך היום — המסך שנפתח ראשון.

   האפליקציה נפתחת עם תשובה, לא עם טופס: מה אוכלים היום, וכפתור אחד
   לסמן שזה קרה. פס השבוע למעלה נותן הקשר ומאפשר לקפוץ ליום אחר בלי
   לעבור למתכנן.

   כל שאר המסכים מתארים את השבוע. זה המסך היחיד שמתאר רגע. */

import { getStore, weekDates, slotKey, isoLocal, DAY_NAMES } from "./store.js";
import { getDish } from "./data.js";
import { cookedStreak, toggleStatus, STATUS_LABELS } from "./plan.js";
import { buildStrip } from "./ui-strip.js";
import { openDishSheet } from "./ui-sheet.js";

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" });

/* היום שבמוקד. נשמר בזיכרון בלבד — פתיחה חדשה של האפליקציה תמיד
   מתחילה מהיום, כי זו השאלה שבגללה נכנסו. */
let selectedIso = null;

function formatLong(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

function dayIndexOf(state, isoDate) {
  return weekDates(state.plan.week_start).indexOf(isoDate);
}

/** היום שבמוקד, אחרי שמוודאים שהוא עדיין בשבוע המוצג. */
function resolveSelected(state, todayIso) {
  const dates = weekDates(state.plan.week_start);
  if (selectedIso && dates.includes(selectedIso)) return selectedIso;
  // גלגול שבוע (או בחירה משבוע קודם) מחזיר את המוקד להיום. אם היום
  // עצמו מחוץ לשבוע המוצג — מקרה קצה של שעון מוטה — נופלים לראשון.
  return dates.includes(todayIso) ? todayIso : dates[0];
}

const ACTIONS = [
  { status: "cooked", label: "בישלתי", primary: true },
  { status: "ate_out", label: "אכלנו בחוץ", primary: false },
  { status: "skipped", label: "דילגנו", primary: false },
];

function buildActions(iso, slot, store) {
  const wrap = document.createElement("div");
  wrap.className = "today-actions";

  for (const action of ACTIONS) {
    const on = slot.status === action.status;
    const button = document.createElement("button");
    button.type = "button";
    // act-wide הוא פריסה ו-act-primary הוא צבע. הפרדה ביניהם מונעת
    // מהכפתור לקפוץ לחצי שורה ברגע שמסמנים אותו.
    button.className = [
      "act",
      action.primary ? "act-wide" : "",
      action.primary && !on ? "act-primary" : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.textContent = action.label;
    button.setAttribute("aria-pressed", on ? "true" : "false");

    button.addEventListener("click", () => {
      store.update((s) => {
        const target = s.plan.slots[slotKey(iso)];
        if (target) target.status = toggleStatus(target.status, action.status);
      });
    });

    wrap.append(button);
  }

  return wrap;
}

function pickDish(iso, state, store) {
  const key = slotKey(iso);
  const index = dayIndexOf(state, iso);
  openDishSheet({
    title: `${DAY_NAMES[index] || ""} · ${formatLong(iso)}`.trim(),
    current: state.plan.slots[key]?.dish_id || null,
    onSelect: (dishId) => {
      store.update((s) => {
        if (!dishId) {
          delete s.plan.slots[key];
          return;
        }
        const existing = s.plan.slots[key];
        if (existing) {
          existing.dish_id = dishId;
          return;
        }
        const eaters = s.profiles.map((p) => p.id);
        s.plan.slots[key] = {
          dish_id: dishId,
          servings: eaters.length,
          eaters,
          status: "planned",
        };
      });
    },
  });
}

function emptyCard(iso, state, store, isToday) {
  const card = document.createElement("section");
  card.className = "today";

  const eyebrow = document.createElement("p");
  eyebrow.className = "today-eyebrow";
  eyebrow.textContent = isToday ? "היום" : DAY_NAMES[dayIndexOf(state, iso)] || "";

  const title = document.createElement("h2");
  title.className = "today-dish";
  title.textContent = "עוד לא תוכנן";

  const meta = document.createElement("p");
  meta.className = "today-meta";
  meta.textContent = isToday
    ? "בחר מה מבשלים היום, והרשימה תתעדכן לבד."
    : "בחר מנה ליום הזה, והרשימה תתעדכן לבד.";

  const actions = document.createElement("div");
  actions.className = "today-actions";
  const plan = document.createElement("button");
  plan.type = "button";
  plan.className = "act act-wide act-primary";
  plan.textContent = "לבחור ארוחה";
  plan.addEventListener("click", () => pickDish(iso, state, store));
  actions.append(plan);

  card.append(eyebrow, title, meta, actions);
  return card;
}

function plannedCard(iso, slot, state, store, isToday) {
  const dish = getDish(slot.dish_id);
  const card = document.createElement("section");
  card.className = slot.status === "cooked" ? "today is-done" : "today";

  const eyebrow = document.createElement("p");
  eyebrow.className = "today-eyebrow";
  eyebrow.textContent = isToday ? "היום" : DAY_NAMES[dayIndexOf(state, iso)] || "";

  // שם המנה הוא גם כפתור ההחלפה: זה האזור הגדול ביותר בכרטיס, וזו
  // הפעולה היחידה שרוצים לעשות עליו.
  const title = document.createElement("button");
  title.type = "button";
  title.className = "today-dish-btn";
  const name = document.createElement("span");
  name.className = "today-dish";
  name.textContent = dish ? dish.name_he : "מנה לא מוכרת";
  const swap = document.createElement("span");
  swap.className = "today-swap";
  swap.textContent = "החלפה";
  title.append(name, swap);
  title.addEventListener("click", () => pickDish(iso, state, store));

  const eaters = state.profiles.filter((p) => slot.eaters.includes(p.id)).map((p) => p.name_he);
  const meta = document.createElement("p");
  meta.className = "today-meta";
  const parts = [];
  if (dish) parts.push(`${dish.time_min} דק'`);
  parts.push(slot.servings === 1 ? "מנה אחת" : `${slot.servings} מנות`);
  if (eaters.length) parts.push(eaters.join(" ו"));
  meta.textContent = parts.join(" · ");

  card.append(eyebrow, title, meta);

  if (dish && dish.prep_ahead.length) {
    const prep = document.createElement("p");
    prep.className = "today-prep";
    prep.textContent = `אפשר מראש: ${dish.prep_ahead.join(", ")}`;
    card.append(prep);
  }

  card.append(buildActions(iso, slot, store));
  return card;
}

export function todaySubtitle() {
  const state = getStore().state;
  const todayIso = isoLocal(new Date());
  const iso = resolveSelected(state, todayIso);
  const index = dayIndexOf(state, iso);
  const dayName = DAY_NAMES[index] || "";
  return `${dayName} · ${formatLong(iso)}`;
}

/* שאר ימי השבוע כשורות דקות. שתי מטרות: המסך לא נשאר ריק מתחת
   לכרטיס אחד, ובחירת יום אחר מקבלת סימן גלוי — הקשה על ריבוע בפס
   לבדה היא פעולה שאי אפשר לנחש שהיא קיימת. */
function buildUpNext(state, selected, onPick) {
  const rows = weekDates(state.plan.week_start)
    .map((date, index) => ({ date, index }))
    .filter((row) => row.date !== selected);
  if (!rows.length) return null;

  const list = document.createElement("ul");
  list.className = "upnext";

  for (const { date, index } of rows) {
    const slot = state.plan.slots[slotKey(date)];
    const dish = slot ? getDish(slot.dish_id) : null;

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upnext-row";

    const day = document.createElement("span");
    day.className = "upnext-day";
    day.textContent = DAY_NAMES[index];

    const name = document.createElement("span");
    name.className = dish ? "upnext-dish" : "upnext-dish is-empty";
    name.textContent = dish ? dish.name_he : "לא תוכנן";

    button.append(day, name);

    if (slot && slot.status && slot.status !== "planned") {
      const mark = document.createElement("span");
      mark.className = "upnext-mark";
      mark.textContent = STATUS_LABELS[slot.status] || "";
      button.append(mark);
    }

    button.addEventListener("click", () => onPick(date));
    li.append(button);
    list.append(li);
  }

  return list;
}

export function renderToday(el) {
  const store = getStore();
  const state = store.state;
  const todayIso = isoLocal(new Date());
  const iso = resolveSelected(state, todayIso);
  selectedIso = iso;

  // בחירת יום אחר אינה שינוי מצב, ולכן ה-store לא יודיע ואף אחד לא
  // ירנדר. המסך מרענן את עצמו.
  const focus = (date) => {
    selectedIso = date;
    el.replaceChildren();
    renderToday(el);
  };

  el.append(buildStrip({ state, todayIso, selectedIso: iso, onPick: focus }));

  const streak = cookedStreak(state.plan.slots, todayIso);
  if (streak >= 2) {
    const line = document.createElement("p");
    line.className = "strip-streak";
    const count = document.createElement("b");
    count.textContent = String(streak);
    line.append(count, document.createTextNode(" ימים ברצף שבישלתם בבית"));
    el.append(line);
  }

  const slot = state.plan.slots[slotKey(iso)];
  const isToday = iso === todayIso;

  el.append(
    !slot || !slot.dish_id
      ? emptyCard(iso, state, store, isToday)
      : plannedCard(iso, slot, state, store, isToday),
  );

  const upNext = buildUpNext(state, iso, focus);
  if (upNext) {
    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = "שאר השבוע";
    el.append(title, upNext);
  }
}
