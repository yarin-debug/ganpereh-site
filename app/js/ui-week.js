/* המתכנן השבועי — ראשון עד שבת, שלוש ארוחות ליום.

   חלוקת העבודה בין המסכים: כאן מתכננים *מה* אוכלים, ובמסך היום קובעים
   כמה מנות ומי אוכל ומסמנים שזה קרה. בלי החלוקה הזו כרטיס יום היה
   נושא שלושה סטים של פקדים, והמסך היה מפסיק להיות סריק — וסריקוּת
   היא כל מה שמסך שבועי צריך לתת. */

import { getStore, weekDates, slotKey, isoLocal, addDays, DAY_NAMES } from "./store.js";
import { resolveDish } from "./catalog.js";
import { MEALS, STATUS_LABELS, dayMeals } from "./plan.js";
import { activeProfiles } from "./profiles.js";
import { copyWeek } from "./history.js";
import { openDishSheet } from "./ui-sheet.js";

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

/** כמה ארוחות תוכננו השבוע, על פני כל הימים והארוחות. */
function plannedCount(state) {
  let count = 0;
  for (const date of weekDates(state.plan.week_start)) {
    for (const entry of dayMeals(state.plan.slots, date)) {
      if (entry.state !== "empty") count++;
    }
  }
  return count;
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

/* כפתור שפותח את בורר המנה, במקום רשימה נפתחת של המערכת.
   ה-select הציג שם ותו לא; הבורר מציג זמן ומאמץ, ומאפשר להשוות
   שתי מנות זו לצד זו לפני ההחלטה. */
function buildDishButton(slot, key, title, store, profiles) {
  const dish = slot ? resolveDish(slot.dish_id) : null;

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
      title,
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

function mealRow(date, dayLabel, meal, state, store) {
  const key = slotKey(date, meal.id);
  const slot = state.plan.slots[key] || null;

  const row = document.createElement("div");
  row.className = "meal-row";

  const label = document.createElement("span");
  label.className = "meal-row-label";
  label.textContent = meal.label;

  row.append(
    label,
    buildDishButton(
      slot,
      key,
      `${dayLabel} · ${meal.label}`,
      store,
      activeProfiles(state.profiles),
    ),
  );

  // הסימון עצמו נעשה במסך היום. כאן מוצג רק מה כבר הוכרע, כדי שבמבט
  // על השבוע יהיה ברור מה נשאר פתוח.
  if (slot && slot.status && slot.status !== "planned") {
    const status = document.createElement("span");
    status.className = "day-status";
    status.textContent = STATUS_LABELS[slot.status] || "";
    row.append(status);
  }

  return row;
}

/**
 * "העתקה משבוע שעבר" — הקיצור לסשן התכנון.
 *
 * מוצג רק כשיש באמת מה להעתיק, ולכן הספירה נעשית מראש דרך אותה
 * פונקציה טהורה שתבצע בפועל. כפתור שמבטיח מספר ואז עושה משהו אחר הוא
 * כפתור שמפסיקים ללחוץ עליו.
 */
function buildCopyWeek(state, store) {
  const previous = addDays(state.plan.week_start, -7);
  const activeIds = activeProfiles(state.profiles).map((p) => p.id);
  const preview = copyWeek(state.plan.slots, previous, state.plan.week_start, activeIds);
  if (!preview.added) return null;

  const wrap = document.createElement("div");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "act act-wide";
  button.textContent =
    preview.added === 1 ? "העתקת ארוחה משבוע שעבר" : `העתקת ${preview.added} ארוחות משבוע שעבר`;
  button.addEventListener("click", () => {
    store.update((s) => {
      const ids = activeProfiles(s.profiles).map((p) => p.id);
      s.plan.slots = copyWeek(
        s.plan.slots,
        addDays(s.plan.week_start, -7),
        s.plan.week_start,
        ids,
      ).slots;
    });
  });

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = "ממלא רק משבצות ריקות. מה שכבר תכננת נשאר.";

  wrap.append(button, note);
  return wrap;
}

export function renderWeek(el) {
  const store = getStore();
  const state = store.state;
  const today = isoLocal(new Date());

  const copy = buildCopyWeek(state, store);
  if (copy) el.append(copy);

  for (const [index, date] of weekDates(state.plan.week_start).entries()) {
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
    card.append(head);

    const dayLabel = `${DAY_NAMES[index]} · ${formatDate(date)}`;
    for (const meal of MEALS) {
      card.append(mealRow(date, dayLabel, meal, state, store));
    }

    el.append(card);
  }
}
