/* מסך היום — המסך שנפתח ראשון.

   האפליקציה נפתחת עם תשובה, לא עם טופס: מה אוכלים עכשיו, וכפתור אחד
   לסמן שזה קרה.

   שני בוררים, כרטיס אחד: פס השבוע בוחר יום, שורת הארוחות בוחרת ארוחה.
   ברירת המחדל היא הארוחה הראשונה שעוד לא הוכרעה — כך שהמסך פותח על מה
   שדורש תשומת לב, אבל אפשר לגשת לכל ארוחה במפורש ולא רק לזו שהמסך
   בחר. בורר שקופץ לבד למקומות שהמשתמש לא ביקש הוא בדיוק מה שהופך כלי
   יומיומי לבלתי צפוי. */

import { getStore, weekDates, slotKey, isoLocal, DAY_NAMES } from "./store.js";
import { resolveDish } from "./catalog.js";
import { cookedStreak, toggleStatus, dayMeals, MEALS, STATUS_LABELS } from "./plan.js";
import { activeProfiles } from "./profiles.js";
import { buildStrip } from "./ui-strip.js";
import { openDishSheet } from "./ui-sheet.js";

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" });

/* היום והארוחה שבמוקד. בזיכרון בלבד — פתיחה חדשה של האפליקציה תמיד
   מתחילה מהיום ומהארוחה הפתוחה, כי זו השאלה שבגללה נכנסו. */
let selectedIso = null;
let selectedMeal = null;

function formatLong(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

function dayIndexOf(state, isoDate) {
  return weekDates(state.plan.week_start).indexOf(isoDate);
}

/** היום שבמוקד, אחרי שמוודאים שהוא עדיין בשבוע המוצג. */
function resolveSelectedDay(state, todayIso) {
  const dates = weekDates(state.plan.week_start);
  if (selectedIso && dates.includes(selectedIso)) return selectedIso;
  // גלגול שבוע (או בחירה משבוע קודם) מחזיר את המוקד להיום. אם היום
  // עצמו מחוץ לשבוע המוצג — מקרה קצה של שעון מוטה — נופלים לראשון.
  return dates.includes(todayIso) ? todayIso : dates[0];
}

/**
 * הארוחה שבמוקד: הראשונה שתוכננה ועוד לא הוכרעה, ואם אין כזו — הערב.
 * הערב הוא נקודת העוגן של היום, ולכן הוא ברירת המחדל כשאין מה להכריע.
 */
function defaultMeal(slots, isoDate) {
  const open = dayMeals(slots, isoDate).find((entry) => entry.state === "planned");
  return open ? open.meal : "dinner";
}

/* ---------- בורר הארוחה ---------- */

function buildMealPicker(state, iso, current, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "meals";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "ארוחות היום");

  const meals = dayMeals(state.plan.slots, iso);

  for (const entry of meals) {
    const on = entry.meal === current;
    const button = document.createElement("button");
    button.type = "button";
    button.className = on ? "meal is-on" : "meal";
    button.dataset.state = entry.state;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.setAttribute(
      "aria-label",
      `${entry.label} · ${entry.state === "empty" ? "לא תוכנן" : STATUS_LABELS[entry.state]}`,
    );

    const dot = document.createElement("span");
    dot.className = "meal-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = entry.label;

    button.append(dot, label);
    button.addEventListener("click", () => onPick(entry.meal));
    wrap.append(button);
  }

  return wrap;
}

/* ---------- כמה מנות ומי אוכל ----------
   הפקדים האלה חיים כאן ולא במתכנן השבועי: כרטיס אחד לארוחה אחת יש בו
   מקום להם, ובכרטיס יום עם שלוש ארוחות הם היו הופכים את המסך השבועי
   לבלתי סריק. */

const MAX_SERVINGS = 12;

function buildStepper(iso, meal, slot, store) {
  const wrap = document.createElement("div");
  wrap.className = "control";

  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = "מנות";

  const stepper = document.createElement("div");
  stepper.className = "stepper";

  const dec = document.createElement("button");
  dec.type = "button";
  dec.textContent = "−";
  dec.setAttribute("aria-label", "פחות מנות");
  dec.disabled = slot.servings <= 1;

  // bdi מונע מהספרה להתהפך בתוך שורה בכיוון ימין-לשמאל
  const value = document.createElement("bdi");
  value.className = "stepper-value";
  value.textContent = String(slot.servings);

  const inc = document.createElement("button");
  inc.type = "button";
  inc.textContent = "+";
  inc.setAttribute("aria-label", "עוד מנות");
  inc.disabled = slot.servings >= MAX_SERVINGS;

  dec.addEventListener("click", () => {
    store.update((s) => {
      const target = s.plan.slots[slotKey(iso, meal)];
      if (target && target.servings > 1) target.servings -= 1;
    });
  });

  inc.addEventListener("click", () => {
    store.update((s) => {
      const target = s.plan.slots[slotKey(iso, meal)];
      if (target && target.servings < MAX_SERVINGS) target.servings += 1;
    });
  });

  stepper.append(dec, value, inc);
  wrap.append(label, stepper);
  return wrap;
}

function buildEaters(iso, meal, slot, store, profiles) {
  const wrap = document.createElement("div");
  wrap.className = "control";

  const label = document.createElement("span");
  label.className = "control-label";
  label.textContent = "מי אוכל";

  const chips = document.createElement("div");
  chips.className = "chips";

  for (const profile of profiles) {
    const on = slot.eaters.includes(profile.id);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = on ? "chip is-on" : "chip";
    chip.textContent = profile.name_he;
    chip.setAttribute("aria-pressed", on ? "true" : "false");

    // האוכל האחרון לא ניתן לכיבוי — משבצת בלי אוכלים תשבור את חישוב המאקרו.
    const isLastOn = on && slot.eaters.length === 1;
    chip.disabled = isLastOn;
    if (isLastOn) chip.title = "צריך לפחות אוכל אחד במשבצת";

    chip.addEventListener("click", () => {
      store.update((s) => {
        const target = s.plan.slots[slotKey(iso, meal)];
        if (!target) return;
        const idx = target.eaters.indexOf(profile.id);
        if (idx >= 0) {
          if (target.eaters.length === 1) return;
          target.eaters.splice(idx, 1);
        } else {
          target.eaters.push(profile.id);
        }
        if (target.servings < target.eaters.length) target.servings = target.eaters.length;
      });
    });

    chips.append(chip);
  }

  wrap.append(label, chips);
  return wrap;
}

/* ---------- פעולות ---------- */

const ACTIONS = [
  { status: "cooked", label: "בישלתי", primary: true },
  { status: "ate_out", label: "אכלנו בחוץ", primary: false },
  { status: "skipped", label: "דילגנו", primary: false },
];

function buildActions(iso, meal, slot, store) {
  const wrap = document.createElement("div");
  wrap.className = "today-actions";

  for (const action of ACTIONS) {
    const on = slot.status === action.status;
    const button = document.createElement("button");
    button.type = "button";
    // act-wide הוא פריסה ו-act-primary הוא צבע. הפרדה ביניהם מונעת
    // מהכפתור לקפוץ לחצי שורה בדיוק ברגע ההקשה.
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
        const target = s.plan.slots[slotKey(iso, meal)];
        if (target) target.status = toggleStatus(target.status, action.status);
      });
    });

    wrap.append(button);
  }

  return wrap;
}

function pickDish(iso, meal, state, store) {
  const key = slotKey(iso, meal);
  const index = dayIndexOf(state, iso);
  const mealLabel = MEALS.find((m) => m.id === meal)?.label || "";
  openDishSheet({
    title: `${DAY_NAMES[index] || ""} · ${mealLabel} · ${formatLong(iso)}`,
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
        const eaters = activeProfiles(s.profiles).map((p) => p.id);
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

/* ---------- הכרטיס ---------- */

function eyebrowText(state, iso, meal, isToday) {
  const mealLabel = MEALS.find((m) => m.id === meal)?.label || "";
  const dayLabel = isToday ? "היום" : DAY_NAMES[dayIndexOf(state, iso)] || "";
  return `${dayLabel} · ${mealLabel}`;
}

function emptyCard(iso, meal, state, store, isToday) {
  const card = document.createElement("section");
  card.className = "today";

  const eyebrow = document.createElement("p");
  eyebrow.className = "today-eyebrow";
  eyebrow.textContent = eyebrowText(state, iso, meal, isToday);

  const title = document.createElement("h2");
  title.className = "today-dish";
  title.textContent = "עוד לא תוכנן";

  const note = document.createElement("p");
  note.className = "today-meta";
  note.textContent = "בחר מנה, והרשימה תתעדכן לבד.";

  const actions = document.createElement("div");
  actions.className = "today-actions";
  const plan = document.createElement("button");
  plan.type = "button";
  plan.className = "act act-wide act-primary";
  plan.textContent = "לבחור ארוחה";
  plan.addEventListener("click", () => pickDish(iso, meal, state, store));
  actions.append(plan);

  card.append(eyebrow, title, note, actions);
  return card;
}

function plannedCard(iso, meal, slot, state, store, isToday) {
  const dish = resolveDish(slot.dish_id);
  const card = document.createElement("section");
  card.className = slot.status === "cooked" ? "today is-done" : "today";

  const eyebrow = document.createElement("p");
  eyebrow.className = "today-eyebrow";
  eyebrow.textContent = eyebrowText(state, iso, meal, isToday);

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
  title.addEventListener("click", () => pickDish(iso, meal, state, store));

  const eaters = state.profiles.filter((p) => slot.eaters.includes(p.id)).map((p) => p.name_he);
  const metaEl = document.createElement("p");
  metaEl.className = "today-meta";
  const parts = [];
  if (dish) parts.push(`${dish.time_min} דק'`);
  parts.push(slot.servings === 1 ? "מנה אחת" : `${slot.servings} מנות`);
  if (eaters.length) parts.push(eaters.join(" ו"));
  metaEl.textContent = parts.join(" · ");

  card.append(eyebrow, title, metaEl);

  if (dish && dish.prep_ahead.length) {
    const prep = document.createElement("p");
    prep.className = "today-prep";
    prep.textContent = `אפשר מראש: ${dish.prep_ahead.join(", ")}`;
    card.append(prep);
  }

  const controls = document.createElement("div");
  controls.className = "slot-controls";
  controls.append(
    buildStepper(iso, meal, slot, store),
    buildEaters(iso, meal, slot, store, activeProfiles(state.profiles)),
  );

  card.append(controls, buildActions(iso, meal, slot, store));
  return card;
}

/* ---------- שאר השבוע ---------- */

/** תקציר יום אחד בשורה: מה מתוכנן, או כמה ארוחות. */
function daySummary(slots, isoDate) {
  const planned = dayMeals(slots, isoDate).filter((entry) => entry.state !== "empty");
  if (!planned.length) return { text: "לא תוכנן", empty: true };
  if (planned.length === 1) {
    const dish = resolveDish(planned[0].slot.dish_id);
    return { text: dish ? dish.name_he : "מנה לא מוכרת", empty: false };
  }
  return { text: `${planned.length} ארוחות`, empty: false };
}

function buildUpNext(state, selected, onPick) {
  const rows = weekDates(state.plan.week_start)
    .map((date, index) => ({ date, index }))
    .filter((row) => row.date !== selected);
  if (!rows.length) return null;

  const list = document.createElement("ul");
  list.className = "upnext";

  for (const { date, index } of rows) {
    const summary = daySummary(state.plan.slots, date);

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "upnext-row";

    const day = document.createElement("span");
    day.className = "upnext-day";
    day.textContent = DAY_NAMES[index];

    const name = document.createElement("span");
    name.className = summary.empty ? "upnext-dish is-empty" : "upnext-dish";
    name.textContent = summary.text;

    button.append(day, name);
    button.addEventListener("click", () => onPick(date));
    li.append(button);
    list.append(li);
  }

  return list;
}

/* ---------- המסך ---------- */

export function todaySubtitle() {
  const state = getStore().state;
  const todayIso = isoLocal(new Date());
  const iso = resolveSelectedDay(state, todayIso);
  const dayName = DAY_NAMES[dayIndexOf(state, iso)] || "";
  return `${dayName} · ${formatLong(iso)}`;
}

export function renderToday(el) {
  const store = getStore();
  const state = store.state;
  const todayIso = isoLocal(new Date());

  const iso = resolveSelectedDay(state, todayIso);
  if (iso !== selectedIso) selectedMeal = null; // יום חדש — בורר ארוחה מתאפס
  selectedIso = iso;

  const meal = selectedMeal || defaultMeal(state.plan.slots, iso);
  selectedMeal = meal;

  // בחירת יום או ארוחה אינה שינוי מצב, ולכן ה-store לא יודיע ואף אחד
  // לא ירנדר. המסך מרענן את עצמו.
  const redraw = () => {
    el.replaceChildren();
    renderToday(el);
  };
  const focusDay = (date) => {
    selectedIso = date;
    selectedMeal = null;
    redraw();
  };
  const focusMeal = (id) => {
    selectedMeal = id;
    redraw();
  };

  el.append(buildStrip({ state, todayIso, selectedIso: iso, onPick: focusDay }));

  const streak = cookedStreak(state.plan.slots, todayIso);
  if (streak >= 2) {
    const line = document.createElement("p");
    line.className = "strip-streak";
    const count = document.createElement("b");
    count.textContent = String(streak);
    line.append(count, document.createTextNode(" ימים ברצף שבישלתם בבית"));
    el.append(line);
  }

  el.append(buildMealPicker(state, iso, meal, focusMeal));

  const slot = state.plan.slots[slotKey(iso, meal)];
  const isToday = iso === todayIso;

  el.append(
    !slot || !slot.dish_id
      ? emptyCard(iso, meal, state, store, isToday)
      : plannedCard(iso, meal, slot, state, store, isToday),
  );

  const upNext = buildUpNext(state, iso, focusDay);
  if (upNext) {
    const title = document.createElement("h2");
    title.className = "section-title";
    title.textContent = "שאר השבוע";
    el.append(title, upNext);
  }
}
