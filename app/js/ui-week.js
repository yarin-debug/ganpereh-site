/* המתכנן השבועי — ראשון עד שבת, שלוש ארוחות ליום.

   חלוקת העבודה בין המסכים: כאן מתכננים *מה* אוכלים, ובמסך היום קובעים
   כמה מנות ומי אוכל ומסמנים שזה קרה. בלי החלוקה הזו כרטיס יום היה
   נושא שלושה סטים של פקדים, והמסך היה מפסיק להיות סריק — וסריקוּת
   היא כל מה שמסך שבועי צריך לתת.

   כל פקד נושא data-focus-key יציב. המסך נבנה מחדש בכל שינוי מצב,
   ובלי המפתח הזה app.js לא מצליח להחזיר את הפוקוס לאלמנט שנהרס —
   כלומר במקלדת אי אפשר ללחוץ על אותו כפתור פעמיים ברצף. */

import { getStore, weekDates, slotKey, isoLocal, addDays, DAY_NAMES } from "./store.js";
import { resolveDish } from "./catalog.js";
import { MEALS, STATUS_LABELS, visibleMeals } from "./plan.js";
import { activeProfiles } from "./profiles.js";
import { copyWeek } from "./history.js";
import { openDishSheet } from "./ui-sheet.js";
import { openSuggestSheet, countSuggestions } from "./ui-suggest.js";

const dayFormat = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short" });

/** ארוחה שיצאה מהתוכנית — לא נכנסת לרשימת הקניות ולא לסיכום המאקרו. */
const OFF_STATUSES = new Set(["skipped", "ate_out"]);

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return dayFormat.format(new Date(y, m - 1, d));
}

function makeTag(text, variant) {
  const tag = document.createElement("span");
  tag.className = variant ? `tag ${variant}` : "tag";
  tag.textContent = text;
  return tag;
}

/**
 * מפריד בין מה שעדיין בתוכנית לבין מה שיצא ממנה — שני מספרים שונים.
 * טהורה ומיוצאת כדי שתיבדק בלי DOM ובלי לגעת ב-store של הייצור.
 */
export function weekCounts(dates, slots) {
  let active = 0;
  let off = 0;
  for (const date of dates) {
    for (const meal of MEALS) {
      const slot = (slots || {})[slotKey(date, meal.id)];
      if (!slot || !slot.dish_id) continue;
      if (OFF_STATUSES.has(slot.status)) off += 1;
      else active += 1;
    }
  }
  return { active, off };
}

export function weekSubtitle() {
  const state = getStore().state;
  const dates = weekDates(state.plan.week_start);
  const range = `${formatDate(dates[0])} – ${formatDate(dates[6])}`;
  const { active, off } = weekCounts(dates, state.plan.slots);

  if (active === 0 && off === 0) return `${range} · עוד לא תוכנן כלום`;
  const planned = active === 1 ? "ארוחה אחת מתוכננת" : `${active} ארוחות מתוכננות`;
  // מה שיצא מהתוכנית נספר בנפרד ולא נבלע בסך הכול, אחרת המספר בכותרת
  // לא מסתדר עם מה שרשימת הקניות מראה.
  return off ? `${range} · ${planned} · ${off} יצאו` : `${range} · ${planned}`;
}

/* כפתור שפותח את בורר המנה, במקום רשימה נפתחת של המערכת.
   ה-select הציג שם ותו לא; הבורר מציג זמן ומאמץ, ומאפשר להשוות
   שתי מנות זו לצד זו לפני ההחלטה. */
function buildDishButton(slot, key, meal, title, store, profiles) {
  const dish = slot ? resolveDish(slot.dish_id) : null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = dish ? "dish-btn" : "dish-btn is-empty";
  button.dataset.focusKey = `week:${key}:dish`;

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
      slot: { key, meal, servings: Number(slot?.servings) || profiles.length || 1 },
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
          // משבצת חדשה: כל מי שבמשק הבית אוכל כברירת מחדל, מנה לכל אחד.
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
  const isOff = !!slot && OFF_STATUSES.has(slot.status);

  const row = document.createElement("div");
  row.className = isOff ? "meal-row is-off" : "meal-row";

  const label = document.createElement("span");
  label.className = "meal-row-label";
  label.textContent = meal.label;

  row.append(
    label,
    buildDishButton(
      slot,
      key,
      meal.id,
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

    // המשבצת נשארת על המסך עם המנה שלה, אבל אומרים במפורש מה זה עשה
    // לשאר המסכים — אחרת הרשימה מתקצרת בלי הסבר.
    if (isOff) {
      const note = document.createElement("p");
      note.className = "slot-note";
      note.textContent = "לא נכנס לרשימת הקניות ולא לסיכום המאקרו.";
      row.append(note);
    }
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
  button.dataset.focusKey = "week:copy";
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

/**
 * אילו ארוחות מתכננים.
 *
 * ההעדפה נקבעת במסך הפתיחה, וכאן היא ניתנת לשינוי. בלי הפקד הזה היא
 * הייתה דלת חד-כיוונית: משק בית שסימן "ערב" בהתקנה לא היה יכול להוסיף
 * ארוחת בוקר לעולם.
 *
 * והמקום הוא כאן ולא במסך הגדרות, מאותו נימוק שבגללו עורך הפרופיל יושב
 * במסך המאקרו: "אילו ארוחות מתכננים" היא בדיוק השאלה של המסך הזה, ומסך
 * הגדרות הוא מקום שצריך לזכור שהוא קיים.
 */
function buildMealPrefs(state, store) {
  const wrap = document.createElement("div");
  wrap.className = "week-prefs";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.id = "week-prefs-title";
  title.textContent = "ארוחות שמתכננים";

  const group = document.createElement("div");
  group.className = "ob-meals";
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", "week-prefs-title");

  const chosen = new Set(state.prefs?.meals || MEALS.map((meal) => meal.id));

  for (const meal of MEALS) {
    const on = chosen.has(meal.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "act ob-meal";
    button.dataset.focusKey = `week:meal:${meal.id}`;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = meal.label;
    button.addEventListener("click", () => {
      const next = new Set(chosen);
      if (on) next.delete(meal.id);
      else next.add(meal.id);
      // בלי אף ארוחה אין מה לתכנן ואין מה להציג במסך היום. ההסרה
      // האחרונה פשוט לא נתפסת, במקום להפיל את המסך למצב ריק.
      if (!next.size) return;
      store.update((s) => {
        s.prefs = { ...s.prefs, meals: MEALS.map((m) => m.id).filter((id) => next.has(id)) };
      });
    });
    group.append(button);
  }

  const note = document.createElement("p");
  note.className = "field-note";
  note.textContent = "ארוחה שכבר תוכננה ממשיכה להופיע גם אחרי שמורידים אותה מכאן.";

  wrap.append(title, group, note);
  return wrap;
}

/**
 * "מוצע לשבוע" — הכניסה לשכבת ההצעות.
 *
 * מוצג רק כשיש משבצת ריקה וגם מנה להציע לה. הכפתור נשאר משני (קו,
 * לא מילוי): המילוי המלא היחיד בזרימה הזו יושב על האישור בתוך
 * השכבה, במקום שבו באמת קורה משהו.
 */
function buildSuggest(state, store) {
  const pending = countSuggestions(state);
  if (!pending) return null;

  const wrap = document.createElement("div");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "act act-wide";
  button.dataset.focusKey = "week:suggest";
  button.textContent = pending === 1 ? "הצעה למשבצת הריקה" : `הצעות ל-${pending} משבצות ריקות`;
  // אין צורך לרענן ידנית: כל אישור בשכבה עובר דרך store.update, וזה
  // כבר מרנדר מחדש את המסך שמאחוריה.
  button.addEventListener("click", () => openSuggestSheet());

  const note = document.createElement("p");
  note.className = "field-note";
  // אותו מבנה כמו ההערה של "העתקה משבוע שעבר": שתי עובדות קצרות,
  // בלי הבטחות ובלי שכנוע.
  note.textContent = "שום משבצת לא מתמלאת בלי אישור. מה שכבר תכננת נשאר.";

  wrap.append(button, note);
  return wrap;
}

export function renderWeek(el) {
  const store = getStore();
  const state = store.state;
  const today = isoLocal(new Date());

  const copy = buildCopyWeek(state, store);
  if (copy) el.append(copy);

  const suggest = buildSuggest(state, store);
  if (suggest) el.append(suggest);
  el.append(buildMealPrefs(state, store));

  for (const [index, date] of weekDates(state.plan.week_start).entries()) {
    const isToday = date === today;

    const card = document.createElement("article");
    card.className = isToday ? "day is-today" : "day";

    const head = document.createElement("div");
    head.className = "day-head";
    const name = document.createElement("span");
    name.className = "day-name";
    name.textContent = DAY_NAMES[index];
    const when = document.createElement("span");
    when.className = "day-date";
    when.textContent = formatDate(date);
    head.append(name, when);

    // "היום" נאמר במילה ולא רק במסגרת: מסגרת המבטא לבדה אינה נקראת
    // בקורא מסך, ואינה נקראת גם בעין כשהכרטיס ממילא מודגש מסיבה אחרת.
    if (isToday) head.append(makeTag("היום", "tag-today"));

    card.append(head);

    const dayLabel = `${DAY_NAMES[index]} · ${formatDate(date)}`;
    for (const entry of visibleMeals(state.plan.slots, date, state.prefs?.meals)) {
      card.append(mealRow(date, dayLabel, { id: entry.meal, label: entry.label }, state, store));
    }

    el.append(card);
  }
}
