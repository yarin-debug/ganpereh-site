/* עטיפת PostgREST — הקריאות היחידות שהאפליקציה עושה לשרת.

   כל קריאה נושאת את אסימון המשתמש, ולכן ה-RLS הוא מה שקובע מה
   מוחזר. אין כאן שום סינון אבטחתי מצד הלקוח: מה שהלקוח מבקש והשרת
   מסרב לו — פשוט לא חוזר. סינון בצד הלקוח היה יוצר אשליה של הגנה
   במקום שבו ההגנה האמיתית יושבת במסד. */

import { SUPABASE_URL, SUPABASE_ANON_KEY, REQUEST_TIMEOUT_MS } from "./config.js";
import { accessToken, currentUser } from "./auth.js";

/** נזרקת כשהשרת דחה את האסימון — המתקשר יודע שצריך התחברות מחדש. */
export class AuthError extends Error {}

async function request(path, { method = "GET", body, prefer } = {}) {
  const token = await accessToken();
  if (!token) throw new AuthError("לא מחוברים.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthError("ההרשאה פגה. יש להתחבר מחדש.");
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(data?.message || data?.hint || `שגיאת שרת ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- משק הבית ---------- */

/** משקי הבית שהמשתמש חבר בהם. בפועל אחד, אבל הסכמה לא מגבילה. */
export async function myHouseholds() {
  const rows = await request("household_members?select=household_id");
  return (rows || []).map((row) => row.household_id);
}

/** יוצר משק בית ומצרף את היוצר כחבר ראשון. */
export async function createHousehold(name = "משק הבית") {
  const created = await request("households", {
    method: "POST",
    body: { name },
    prefer: "return=representation",
  });
  const id = created?.[0]?.id;
  if (!id) throw new Error("יצירת משק הבית נכשלה.");
  // אין כאן טרנזקציה: משק בית בלי חברים הוא שורה יתומה בלתי מזיקה,
  // והניסיון הבא ייצור אחד חדש. חבר בלי משק בית, לעומת זאת, בלתי
  // אפשרי — מפתח זר חוסם אותו. הסדר נבחר כך בכוונה.
  await request("household_members", { method: "POST", body: { household_id: id } });
  return id;
}

/* ---------- הזמנת אדם שני ---------- */

/* אותיות וספרות בלי התווים שמתבלבלים כשמקריאים אותם בטלפון: 0/O,
   1/I/L. קוד ההזמנה נועד להיאמר בקול, לא להיות מודבק. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export async function createInvite(householdId) {
  // created_by נלקח מהסשן ולא משאילתה. מדיניות ה-RLS דורשת שהוא יהיה
  // auth.uid(), ושאילתת חברות הייתה עלולה להחזיר דווקא את האדם השני.
  const user = currentUser();
  if (!user?.id) throw new AuthError("לא מחוברים.");
  const code = generateCode();
  await request("household_invites", {
    method: "POST",
    body: { code, household_id: householdId, created_by: user.id },
  });
  return code;
}

/** מממש קוד הזמנה. מחזיר את מזהה משק הבית שהצטרפנו אליו. */
export async function redeemInvite(code) {
  const clean = String(code || "")
    .trim()
    .toUpperCase();
  if (!clean) throw new Error("לא הוזן קוד.");
  return request("rpc/redeem_household_invite", {
    method: "POST",
    body: { invite_code: clean },
  });
}

/* ---------- המצב ---------- */

/**
 * כל מה שהשתנה מאז ה-rev שנמסר.
 *
 * `rev=gt` ולא חותמת זמן — הנימוק המלא יושב ליד הסיקוונס בסכמה,
 * ובקצרה: שעון לקוח מוטה היה מדלג על שינויים לצמיתות.
 */
export async function pullSince(householdId, sinceRev) {
  const query = [
    `household_id=eq.${householdId}`,
    `rev=gt.${Number(sinceRev) || 0}`,
    "select=entity,entity_key,value,rev",
    "order=rev.asc",
  ].join("&");
  return (await request(`meal_state?${query}`)) || [];
}

/**
 * דוחף שינויים. מחזיר את ה-rev הגבוה ביותר שנכתב.
 *
 * merge-duplicates הוא upsert: שורה קיימת מתעדכנת במקום להתנגש.
 * הטריגר בשרת קובע rev, updated_at ו-updated_by — הלקוח לא שולח
 * אותם, וגם אם ישלח הם יידרסו. שעון הלקוח לא קובע כאן דבר.
 */
export async function pushChanges(householdId, changes) {
  if (!changes.length) return 0;
  const rows = changes.map((change) => ({
    household_id: householdId,
    entity: change.entity,
    entity_key: change.entity_key,
    value: change.value === undefined ? null : change.value,
    // rev חייב להישלח כי העמודה NOT NULL, אבל הטריגר דורס אותו
    // מיד. אפס הוא ערך ממלא־מקום שלא מגיע לטבלה לעולם.
    rev: 0,
  }));

  const written = await request("meal_state", {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return (written || []).reduce((max, row) => Math.max(max, Number(row.rev) || 0), 0);
}
