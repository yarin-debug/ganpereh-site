/* נשנושים ומשקאות — המקטע במסך היום, והשכבה להזנה מדויקת.

   ── הכלל שמכתיב את כל השאר ─────────────────────────────────────────
   נשנוש מוזן עשרות פעמים בשבוע, וכל הזנה מתחרה מול "לא בא לי עכשיו".
   זה הפיצ'ר היחיד באפליקציה שנמדד בחיכוך של שנייה אחת: בורר שדורש
   חיפוש, כמות ובחירת אדם יינטש אחרי יומיים, ומסך המאקרו יחזור לתאר
   חצי יום ולהשוות אותו ליעד של יום שלם.

   לכן המסלול הראשי הוא צ'יפ בהקשה אחת — פריט, כמות מוכרת, נרשם
   כנאכל עכשיו. השכבה קיימת למה שהצ'יפים לא מכסים, ולא להפך.

   ── ולמה הצ'יפים אינם מילוי מלא ─────────────────────────────────────
   במסך היום כבר יש פעולה אחת בחרס ("לבחור ארוחה"). הוספת נשנוש היא
   פעולה תכופה אבל לא *הפעולה שצריך לעשות עכשיו*, ולכן היא לובשת את
   הצ'יפ הקיים: קו וגוון. חרס שני במסך היה מבטל את המשמעות של הראשון. */

import { getStore, isoLocal } from "./store.js";
import { listIngredients, resolveIngredient, unitLabel } from "./catalog.js";
import { activeProfiles } from "./profiles.js";
import {
  KINDS,
  extrasOn,
  nextExtraId,
  makeExtra,
  frequentExtras,
  starterExtras,
  extraMacrosPerEater,
} from "./extras.js";
import { ingredientMacros, formatQty, formatMacros } from "./normalize.js";
import {
  openOverlay,
  textInput,
  numberInput,
  fieldGroup,
  chipGroup,
  errorLine,
} from "./ui-overlay.js";

const QUICK_COUNT = 6;

/** כמה נשנושים מציגים לפני שמקפלים. יום עמוס לא אמור לדחוף את המסך. */
const VISIBLE_ROWS = 8;

function kindLabel(kind) {
  return KINDS.find((k) => k.id === kind)?.label || "נשנוש";
}

/**
 * תיאור הכמות לתצוגה.
 *
 * "יחידה" נאמרת כמספר בלבד ("2 תפוח") ולא כ-"2 יח' תפוח": ביחידות
 * המילה מיותרת, ובעברית היא גם נשמעת כמו טופס.
 */
function qtyLabel(extra, ingredient) {
  if (extra.unit === "unit") {
    const n = Number(extra.qty);
    return n === 1 ? "" : `${Number(n.toFixed(2))} × `;
  }
  return `${formatQty(Number(extra.qty), extra.unit)} · `;
}

/**
 * למה הפריט לא נספר — בניסוח שאומר מה לעשות.
 *
 * הגרסה הראשונה אמרה "אין ערכי תזונה" על כל כשל, וזה שלח לתקן את מה
 * שתקין: ליוגורט *יש* ערכי תזונה, ומה שחסר לו הוא משקל ליחידה. מי
 * שהלך לערוך את המצרך לא מצא שם שום דבר שבור.
 */
function unresolvedText(reason, ingredient) {
  if (!ingredient) return "מצרך לא מוכר";
  if (reason === "no_nutrition") return "אין ערכי תזונה";
  if (reason === "no_unit_weight") {
    return `להזין ב${unitLabel(ingredient.base_unit)} — אין משקל ליחידה`;
  }
  if (reason === "no_density") return "אין המרה מנפח למשקל";
  return "לא נספר במאקרו";
}

/* ---------- שורת נשנוש ---------- */

function extraRow(extra, state, store, iso) {
  const ingredient = resolveIngredient(extra.ingredient_id);
  const row = document.createElement("div");
  row.className = extra.eaten ? "extra-row" : "extra-row is-planned";

  const main = document.createElement("div");
  main.className = "extra-main";

  const name = document.createElement("span");
  name.className = "extra-name";
  name.textContent = `${qtyLabel(extra, ingredient)}${ingredient ? ingredient.name_he : extra.ingredient_id}`;
  main.append(name);

  const meta = document.createElement("span");
  meta.className = "extra-meta";
  const parts = [];

  const macros = extraMacrosPerEater(extra, ingredient);
  // פריט שאי אפשר לחשב לו מאקרו אומר זאת במקום להציג אפס. אפס קלוריות
  // אינו "לא ידוע", והצגתו כידע משקרת בדיוק במסך שכל תפקידו לתאר.
  if (macros.unresolved) {
    parts.push(unresolvedText(macros.reason, ingredient));
  } else {
    const values = formatMacros(macros);
    parts.push(`${values.kcal} קק"ל`);
    if (values.protein_g > 0) parts.push(`${values.protein_g} גרם חלבון`);
    if (macros.partial) parts.push("חלקי");
  }

  // מי אכל נאמר רק כשיש יותר מאדם אחד בבית — אחרת זו חזרה על המובן מאליו.
  const active = activeProfiles(state.profiles);
  if (active.length > 1) {
    const names = active.filter((p) => extra.eaters.includes(p.id)).map((p) => p.name_he);
    if (names.length) parts.push(names.join(" ו"));
  }

  meta.textContent = parts.join(" · ");
  main.append(meta);
  row.append(main);

  const actions = document.createElement("div");
  actions.className = "extra-actions";

  // מתוכנן שטרם נאכל מקבל את הפעולה שהופכת אותו לעובדה. זו ההקשה
  // היחידה שמזיזה אותו למאקרו.
  if (!extra.eaten) {
    const ate = document.createElement("button");
    ate.type = "button";
    ate.className = "chip";
    ate.textContent = "אכלתי";
    ate.dataset.focusKey = `extra:${iso}:${extra.id}:ate`;
    ate.addEventListener("click", () => {
      store.update((s) => {
        const item = extrasOn(s.plan.extras, iso).find((x) => x.id === extra.id);
        if (item) item.eaten = true;
      });
    });
    actions.append(ate);
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "dish-edit";
  remove.textContent = "הסרה";
  remove.setAttribute("aria-label", `הסרת ${ingredient ? ingredient.name_he : "הפריט"}`);
  remove.dataset.focusKey = `extra:${iso}:${extra.id}:remove`;
  remove.addEventListener("click", () => {
    store.update((s) => {
      const list = extrasOn(s.plan.extras, iso).filter((x) => x.id !== extra.id);
      if (list.length) s.plan.extras[iso] = list;
      else delete s.plan.extras[iso]; // יום ריק לא נשאר כמפתח ריק באחסון
    });
  });
  actions.append(remove);

  row.append(actions);
  return row;
}

/* ---------- הוספה מהירה ---------- */

/**
 * הצ'יפים שנוספים בהקשה אחת.
 *
 * מה שחוזר על עצמו עולה לראש. לפני שיש היסטוריה מוצגת רשימת פתיחה,
 * כי הוספה מהירה ריקה ביום הראשון היא בדיוק מה שגורם לוותר על
 * הפיצ'ר לפני שהוא הוכיח את עצמו.
 */
function quickAdd(state, store, iso, defaultEater) {
  const frequent = frequentExtras(state.plan.extras, resolveIngredient, QUICK_COUNT);
  const rows = frequent.length ? frequent : starterExtras(resolveIngredient);
  if (!rows.length) return null;

  const wrap = document.createElement("div");
  wrap.className = "chips extra-quick";

  for (const row of rows) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.focusKey = `extra:${iso}:quick:${row.ingredient_id}:${row.unit}`;

    const label = row.unit === "unit" && row.qty === 1 ? row.ingredient.name_he : null;
    chip.textContent = label || `${row.ingredient.name_he} · ${formatQty(row.qty, row.unit)}`;

    chip.addEventListener("click", () => {
      store.update((s) => {
        if (!s.plan.extras || typeof s.plan.extras !== "object") s.plan.extras = {};
        const list = extrasOn(s.plan.extras, iso);
        s.plan.extras[iso] = [
          ...list,
          makeExtra({
            id: nextExtraId(list),
            ingredient_id: row.ingredient_id,
            qty: row.qty,
            unit: row.unit,
            kind: row.kind,
            eaters: [defaultEater],
          }),
        ];
      });
    });

    wrap.append(chip);
  }

  return wrap;
}

/* ---------- השכבה ---------- */

/**
 * הזנה מדויקת: מצרך, כמות, מי אכל, ומתי.
 *
 * @param {object} options
 * @param {string} options.iso        לאיזה יום
 * @param {string[]} options.eaters   ברירת המחדל למי אכל
 */
export function openExtraSheet({ iso, eaters }) {
  const store = getStore();

  return openOverlay({
    label: "הוספת נשנוש או משקה",
    variant: "editor",
    build: (panel, handle) => {
      const state = store.state;
      const active = activeProfiles(state.profiles);

      let query = "";
      let picked = null;
      let qty = "1";
      let unit = "unit";
      let kind = "snack";
      let who = eaters.length ? [...eaters] : active.slice(0, 1).map((p) => p.id);
      let planned = false;
      let error = "";

      const draw = () => {
        panel.replaceChildren();

        const heading = document.createElement("h2");
        heading.className = "sheet-title";
        heading.textContent = "נשנוש או משקה";
        panel.append(heading);

        const sub = document.createElement("p");
        sub.className = "sheet-sub";
        sub.textContent = picked ? picked.name_he : "מה נאכל או נשתה?";
        panel.append(sub);

        if (!picked) {
          const search = textInput({ placeholder: "חיפוש מצרך" });
          search.type = "search";
          search.value = query;
          search.addEventListener("input", () => {
            query = search.value;
            const at = search.selectionStart;
            draw();
            const next = panel.querySelector('input[type="search"]');
            if (next) {
              next.focus();
              next.setSelectionRange(at, at);
            }
          });
          panel.append(search);

          const trimmed = query.trim();
          const all = listIngredients();
          const matches = trimmed
            ? all.filter(
                (ing) =>
                  ing.name_he.includes(trimmed) ||
                  (ing.aliases || []).some((a) => a.includes(trimmed)),
              )
            : all;

          const options = document.createElement("div");
          options.className = "sheet-options";

          for (const ing of matches.slice(0, 40)) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "dish-card";

            const name = document.createElement("span");
            name.className = "dish-card-name";
            name.textContent = ing.name_he;

            const meta = document.createElement("span");
            meta.className = "dish-card-meta";
            // אומרים מראש אם אפשר להזין "אחד", כדי שאיש לא יבחר מצרך
            // ואז יגלה שהיחידה היחידה שהוא מכיר אינה נתמכת.
            meta.textContent = ing.unit_weight_g
              ? `אפשר ביחידות · ${unitLabel(ing.base_unit)}`
              : unitLabel(ing.base_unit);
            name.append(meta);

            card.append(name);
            card.addEventListener("click", () => {
              picked = ing;
              unit = ing.unit_weight_g ? "unit" : ing.base_unit;
              qty = ing.unit_weight_g ? "1" : "100";
              kind = ing.shelf === "drinks" ? "drink" : "snack";
              error = "";
              draw();
            });
            options.append(card);
          }

          if (!matches.length) {
            const empty = document.createElement("p");
            empty.className = "empty";
            empty.textContent = `אין מצרך בשם "${trimmed}". אפשר להוסיף אותו במסך המזווה.`;
            options.append(empty);
          }

          panel.append(options);

          const close = document.createElement("button");
          close.type = "button";
          close.className = "sheet-close";
          close.textContent = "ביטול";
          close.addEventListener("click", () => handle.close());
          panel.append(close);
          return;
        }

        /* ---- שלב הכמות ---- */

        const qtyInput = numberInput({ value: qty, min: 0 });
        qtyInput.dataset.autofocus = "true";
        qtyInput.addEventListener("input", () => {
          qty = qtyInput.value;
        });
        panel.append(fieldGroup("כמות", qtyInput));

        // רק יחידות שהמצרך באמת יודע להמיר. הצגת "יחידה" למצרך בלי
        // unit_weight_g הייתה מייצרת רשומה שאי אפשר לחשב לה מאקרו.
        const units = [{ id: picked.base_unit, label: unitLabel(picked.base_unit) }];
        if (picked.unit_weight_g) units.unshift({ id: "unit", label: "יחידה" });
        if (units.length > 1) {
          panel.append(
            fieldGroup(
              "יחידה",
              chipGroup({
                options: units,
                value: unit,
                label: "יחידה",
                onChange: (id) => {
                  unit = id;
                },
              }),
            ),
          );
        }

        panel.append(
          fieldGroup(
            "סוג",
            chipGroup({
              options: KINDS,
              value: kind,
              label: "סוג",
              onChange: (id) => {
                kind = id;
              },
            }),
          ),
        );

        // בחירת אוכלים מוצגת רק כשיש במי לבחור.
        if (active.length > 1) {
          const group = document.createElement("div");
          group.className = "chips";
          for (const profile of active) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = who.includes(profile.id) ? "chip is-on" : "chip";
            chip.setAttribute("aria-pressed", who.includes(profile.id) ? "true" : "false");
            chip.textContent = profile.name_he;
            chip.addEventListener("click", () => {
              who = who.includes(profile.id)
                ? who.filter((id) => id !== profile.id)
                : [...who, profile.id];
              draw();
            });
            group.append(chip);
          }
          panel.append(fieldGroup("מי אכל", group));
        }

        panel.append(
          fieldGroup(
            "מתי",
            chipGroup({
              options: [
                { id: "now", label: "נאכל עכשיו" },
                { id: "planned", label: "מתוכנן" },
              ],
              value: planned ? "planned" : "now",
              label: "מתי",
              onChange: (id) => {
                planned = id === "planned";
              },
            }),
          ),
        );

        // תצוגה מקדימה של המאקרו. היא גם התשובה לשאלה "כמה זה" וגם
        // האזהרה היחידה שמצרך חסר ערכים לא ייספר — לפני השמירה.
        const preview = ingredientMacros(picked, Number(qty), unit);
        const note = document.createElement("p");
        note.className = "field-note";
        if (preview.unresolved) {
          note.textContent = "לפריט הזה אין ערכי תזונה, ולכן הוא לא ייספר במאקרו.";
        } else {
          const values = formatMacros(preview);
          const per = who.length > 1 ? ` · ${who.length} חולקים` : "";
          note.textContent = `${values.kcal} קק"ל · ${values.protein_g} גרם חלבון${per}`;
          if (preview.partial) note.textContent += " · ערכים חלקיים";
        }
        panel.append(note);

        if (error) panel.append(errorLine(error));

        const save = document.createElement("button");
        save.type = "button";
        save.className = "act act-wide act-primary";
        save.textContent = planned ? "להוסיף לתוכנית" : "להוסיף למה שנאכל";
        save.addEventListener("click", () => {
          const amount = Number(qty);
          if (!Number.isFinite(amount) || amount <= 0) {
            error = "כמות חייבת להיות גדולה מאפס.";
            draw();
            return;
          }
          if (!who.length) {
            error = "צריך לבחור מי אכל.";
            draw();
            return;
          }
          store.update((s) => {
            if (!s.plan.extras || typeof s.plan.extras !== "object") s.plan.extras = {};
            const list = extrasOn(s.plan.extras, iso);
            s.plan.extras[iso] = [
              ...list,
              makeExtra({
                id: nextExtraId(list),
                ingredient_id: picked.id,
                qty: amount,
                unit,
                kind,
                eaters: who,
                planned,
              }),
            ];
          });
          handle.close();
        });
        panel.append(save);

        const back = document.createElement("button");
        back.type = "button";
        back.className = "sheet-close";
        back.textContent = "מצרך אחר";
        back.addEventListener("click", () => {
          picked = null;
          error = "";
          draw();
        });
        panel.append(back);
      };

      draw();
    },
  });
}

/* ---------- המקטע ---------- */

/**
 * מקטע הנשנושים במסך היום.
 *
 * @returns {HTMLElement|null} null כשאין מה להציג *ואין* מה להציע
 */
export function buildExtras(state, store, iso) {
  const list = extrasOn(state.plan.extras, iso);
  const active = activeProfiles(state.profiles);
  const defaultEater = active.length ? active[0].id : null;

  // בלי אף אדם במשק הבית אין למי לייחס נשנוש, והמאקרו לא היה מתחלק.
  if (!defaultEater) return null;

  const wrap = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "נשנושים ומשקאות";

  // סכום היום נאמר בכותרת ולא בשורה נפרדת: זו התשובה שבגללה פותחים
  // את המקטע, ומי שלא הזין כלום לא צריך לראות "0 קק״ל".
  const eatenToday = list.filter((extra) => extra.eaten);
  if (eatenToday.length) {
    let kcal = 0;
    let counted = 0;
    let unresolved = 0;
    for (const extra of eatenToday) {
      const macros = extraMacrosPerEater(extra, resolveIngredient(extra.ingredient_id));
      if (macros.unresolved) unresolved++;
      else {
        kcal += macros.kcal;
        counted++;
      }
    }

    const tag = document.createElement("span");
    tag.className = "tag";
    // כשאף פריט לא נספר, "0 קק״ל" נקרא כ"לא אכלת" ולא כ"לא ידענו
    // לחשב" — בדיוק ההיפוך שכל המנוע נמנע ממנו. במקרה הזה נאמר רק
    // כמה פריטים לא נספרו, בלי מספר שנראה כמו ידיעה.
    if (!counted) {
      tag.textContent = unresolved === 1 ? "פריט אחד בלי ערכים" : `${unresolved} בלי ערכים`;
    } else {
      tag.textContent = unresolved
        ? `${Math.round(kcal)} קק"ל · ${unresolved} בלי ערכים`
        : `${Math.round(kcal)} קק"ל`;
    }
    title.append(tag);
  }

  wrap.append(title);

  const quick = quickAdd(state, store, iso, defaultEater);
  if (quick) wrap.append(quick);

  if (list.length) {
    const rows = document.createElement("div");
    rows.className = "extra-list";
    // מתוכנן קודם: הוא הדבר היחיד ברשימה שעוד מחכה לפעולה.
    const ordered = [...list].sort((a, b) => Number(a.eaten) - Number(b.eaten));
    for (const extra of ordered.slice(0, VISIBLE_ROWS)) {
      rows.append(extraRow(extra, state, store, iso));
    }
    wrap.append(rows);

    if (ordered.length > VISIBLE_ROWS) {
      const more = document.createElement("p");
      more.className = "field-note";
      const hidden = ordered.length - VISIBLE_ROWS;
      more.textContent = hidden === 1 ? "ועוד פריט אחד." : `ועוד ${hidden} פריטים.`;
      wrap.append(more);
    }
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "act act-wide";
  add.dataset.focusKey = `extra:${iso}:add`;
  add.textContent = "הוספה מדויקת";
  add.addEventListener("click", () => openExtraSheet({ iso, eaters: [defaultEater] }));
  wrap.append(add);

  return wrap;
}
