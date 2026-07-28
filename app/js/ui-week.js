/* המתכנן השבועי — ראשון עד שבת, משבצת ערב אחת ליום.
   שלב א' מרנדר ארוחת ערב בלבד; המודל ממודר לפי `תאריך.ארוחה`, כך
   שהוספת ארוחות נוספות היא תוספת ולא שינוי. */

import { getStore, weekDates, slotKey, isoLocal, DAY_NAMES } from "./store.js";
import { getDish } from "./data.js";
import { STATUS_LABELS } from "./plan.js";
import { openDishSheet } from "./ui-sheet.js";

const MAX_SERVINGS = 12;

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

function plannedCount(state) {
  const dates = weekDates(state.plan.week_start);
  return dates.filter((date) => {
    const slot = state.plan.slots[slotKey(date)];
    return slot && slot.dish_id;
  }).length;
}

export function weekSubtitle() {
  const state = getStore().state;
  const dates = weekDates(state.plan.week_start);
  const range = `${formatDate(dates[0])} – ${formatDate(dates[6])}`;
  const count = plannedCount(state);
  if (count === 0) return `${range} · עוד לא תוכנן כלום`;
  if (count === 1) return `${range} · ארוחה אחת מתוכננת`;
  return `${range} · ${count} ארוחות מתוכננות`;
}

/* ---------- פקדי משבצת ---------- */

function buildStepper(slot, key, store) {
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
      const target = s.plan.slots[key];
      if (target && target.servings > 1) target.servings -= 1;
    });
  });

  inc.addEventListener("click", () => {
    store.update((s) => {
      const target = s.plan.slots[key];
      if (target && target.servings < MAX_SERVINGS) target.servings += 1;
    });
  });

  stepper.append(dec, value, inc);
  wrap.append(label, stepper);
  return wrap;
}

function buildEaters(slot, key, store, profiles) {
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
        const target = s.plan.slots[key];
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

/* כפתור שפותח את גיליון הבחירה, במקום רשימה נפתחת של המערכת.
   ה-select הציג שם ותו לא; הגיליון מציג זמן ומאמץ, ומאפשר להשוות
   שתי מנות זו לצד זו לפני ההחלטה. */
function buildDishButton(slot, key, dayLabel, store, profiles) {
  const dish = slot ? getDish(slot.dish_id) : null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = dish ? "dish-btn" : "dish-btn is-empty";

  const name = document.createElement("span");
  name.textContent = dish ? dish.name_he : "לבחור ארוחה";
  button.append(name);

  if (dish) {
    const time = document.createElement("span");
    time.className = "dish-btn-time";
    time.textContent = `${dish.time_min} דק'`;
    button.append(time);
  }

  button.addEventListener("click", () => {
    openDishSheet({
      title: dayLabel,
      current: slot ? slot.dish_id : null,
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
          // משבצת חדשה: כל הפרופילים אוכלים כברירת מחדל, מנה לכל אחד.
          const eaters = profiles.map((p) => p.id);
          s.plan.slots[key] = {
            dish_id: dishId,
            servings: eaters.length,
            eaters,
            status: "planned",
          };
        });
      },
    });
  });

  return button;
}

/* ---------- המסך ---------- */

export function renderWeek(el) {
  const store = getStore();
  const state = store.state;
  const profiles = state.profiles;
  const today = isoLocal(new Date());

  for (const [index, date] of weekDates(state.plan.week_start).entries()) {
    const key = slotKey(date);
    const slot = state.plan.slots[key] || null;

    const card = document.createElement("article");
    card.className = date === today ? "day is-today" : "day";

    const head = document.createElement("div");
    head.className = "day-head";
    const name = document.createElement("span");
    name.className = "day-name";
    name.textContent = DAY_NAMES[index];
    const when = document.createElement("span");
    when.className = "day-date";
    when.textContent = formatDate(date);
    head.append(name, when);

    // הסימון עצמו נעשה במסך היום. כאן מוצג רק מה כבר הוכרע, כדי
    // שבמבט על השבוע יהיה ברור מה נשאר פתוח.
    if (slot && slot.status && slot.status !== "planned") {
      const status = document.createElement("span");
      status.className = "day-status";
      status.textContent = STATUS_LABELS[slot.status] || "";
      head.append(status);
    }

    const dayLabel = `${DAY_NAMES[index]} · ${formatDate(date)}`;
    card.append(head, buildDishButton(slot, key, dayLabel, store, profiles));

    if (slot && slot.dish_id) {
      const dish = getDish(slot.dish_id);
      const controls = document.createElement("div");
      controls.className = "slot-controls";
      controls.append(buildStepper(slot, key, store), buildEaters(slot, key, store, profiles));
      card.append(controls);

      if (dish && dish.prep_ahead.length) {
        const note = document.createElement("p");
        note.className = "slot-note";
        note.textContent = `אפשר מראש: ${dish.prep_ahead.join(", ")}`;
        card.append(note);
      }
    }

    el.append(card);
  }
}
