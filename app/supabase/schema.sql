-- ============================================
-- מתכנן הארוחות — סכמת הסנכרון
-- להריץ ב-Supabase: SQL Editor → New query → הדבק → Run
-- ============================================
--
-- ⚠️  הפרויקט הזה חייב להיות פרויקט Supabase **נפרד** מזה של הדשבורד.
--
-- לא מדובר בהעדפת סדר. מדיניות ה-RLS של הדשבורד מתירה גישה לכל מי
-- שה-JWT שלו נושא כתובת מרשימה קבועה, ו-yarin@ganpereh.co.il נמצא בה.
-- פרויקט Supabase חותם את כל האסימונים שלו באותו סוד — ולכן אסימון
-- שנוצר כאן, בהתחברות למתכנן הארוחות, היה אסימון תקף לקריאת הלידים,
-- הצעות המחיר ופרטי חשבון הבנק שב-CRM.
--
-- פרויקט נפרד = סוד חתימה נפרד = אסימון של הארוחות פשוט לא נפרס שם.
-- זו ההפרדה היחידה שלא דורשת שאף אחד יזכור להחזיק אותה.
--
-- לפני ההרצה: ודא שאתה בפרויקט "ganpereh-meals" ולא בפרויקט הדשבורד.
-- הבדיקה: SQL Editor → `select count(*) from public.leads;`
-- אם זה מחזיר מספר במקום שגיאה — אתה בפרויקט הלא נכון. עצור.
-- ============================================

-- ============================================
-- משק בית — יחידת הסנכרון
-- ============================================
-- כל מי שחבר באותו משק בית רואה וכותב את אותה תוכנית. זו היחידה
-- שהחלוקה נעשית לפיה, ולא המשתמש: שני אנשים בבית אחד הם משק בית אחד.

create table if not exists households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'משק הבית',
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx on household_members (user_id);

-- ============================================
-- המצב המסונכרן — שורה לכל פריט, לא בלוב אחד
-- ============================================
--
-- ── למה שורה לפריט ולא הבלוב השלם ─────────────────────────────────
-- האחסון המקומי מחזיק את כל המצב כמחרוזת JSON אחת, וזה נכון שם:
-- כותב אחד, מכשיר אחד, כתיבה אטומית.
--
-- מול שרת עם שני כותבים זה נשבר. שניים בבית עורכים במקביל — אחד
-- מוסיף למזווה בזמן שהשני מתכנן ארוחה — וכל אחד שולח את הבלוב השלם
-- שלו. השני דורס את הראשון לגמרי, כולל שדות שהוא לא נגע בהם. זו לא
-- התנגשות אמיתית: הם ערכו דברים שונים. פיצול לשורות הופך אותה
-- להתנגשות שלא קיימת — כל אחד כותב רק את המפתחות שהוא שינה.
--
-- הרזולוציה נבחרה לפי מה שנערך בפועל בו-זמנית:
--   slot       — משבצת בודדת ('2026-07-30.dinner')
--   checked    — שורת קנייה מסומנת. הכי מקבילי שיש: שניים בסופר.
--   pantry     — מצרך במזווה
--   dish       — מנה בקטלוג המשתמש
--   ingredient — מצרך בקטלוג המשתמש
--   profile    — אדם במשק הבית
--   meta       — week_start / onboarded / prefs
--
-- value = null הוא **מצבה** (tombstone), לא "אין ערך". בלי זה מחיקה
-- לא הייתה מסתנכרנת: המכשיר השני פשוט לא היה שומע עליה, והיה מחזיר
-- את השורה שנמחקה בסנכרון הבא.

create table if not exists meal_state (
  household_id uuid not null references households (id) on delete cascade,
  entity       text not null,
  entity_key   text not null,
  value        jsonb,
  rev          bigint not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  primary key (household_id, entity, entity_key)
);

-- ── למה rev ולא updated_at ─────────────────────────────────────────
-- הלקוח מושך "כל מה שהשתנה מאז הביקור האחרון". להישען על שעון לצורך
-- הזה זו טעות שהקוד הזה כבר משלם עליה במקום אחר: store.js מנרמל
-- week_start דווקא בגלל שעון מוטה. טלפון שהשעון שלו מקדים בדקה היה
-- מסמן last_seen עתידי ומפספס כל שינוי אמיתי עד שהזמן ישיג אותו.
--
-- מונה עולה שהשרת מנפיק הוא חסין לזה. הוא גם חסין לשתי כתיבות באותה
-- אלפית שנייה, שחותמת זמן לא מבחינה ביניהן.
create sequence if not exists meal_state_rev_seq;

create index if not exists meal_state_rev_idx on meal_state (household_id, rev);

-- כל כתיבה מקבלת rev חדש ושעה מהשרת. הלקוח לא מספק אותם, ואם ינסה —
-- יידרס. שעון הלקוח לא קובע כאן שום דבר.
create or replace function meal_state_stamp()
returns trigger
language plpgsql
as $$
begin
  new.rev := nextval('meal_state_rev_seq');
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists meal_state_stamp_trg on meal_state;
create trigger meal_state_stamp_trg
  before insert or update on meal_state
  for each row execute function meal_state_stamp();

-- ============================================
-- אבטחה ברמת שורה
-- ============================================
--
-- אין כאן allowlist של כתובות מייל — בכוונה, וזה ההבדל מהדשבורד.
-- שם הרשימה נכונה: צוות סגור וידוע. כאן היא הייתה אומרת שכל מי
-- שברשימה רואה את כל משקי הבית, וזה בדיוק מה שלא רוצים כשמוסיפים
-- אדם שני. הקריטריון הוא חברות במשק בית, ותו לא.

alter table households        enable row level security;
alter table household_members enable row level security;
alter table meal_state        enable row level security;

-- security definer: הפונקציה קוראת את household_members בלי לעבור דרך
-- ה-RLS של הטבלה הזו. בלי זה מדיניות ש*מסתמכת* על הטבלה כדי להחליט
-- מי רשאי לקרוא אותה הייתה רקורסיה אינסופית, ו-Postgres דוחה אותה.
create or replace function is_household_member(hid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

drop policy if exists "member_reads_household" on households;
create policy "member_reads_household" on households
  for select to authenticated
  using (is_household_member(id));

-- יצירת משק בית פתוחה לכל משתמש מאומת: זה מה שקורה בהתחברות
-- הראשונה, לפני שקיימת שורת חברות שאפשר להיבדק מולה.
drop policy if exists "authenticated_creates_household" on households;
create policy "authenticated_creates_household" on households
  for insert to authenticated
  with check (true);

drop policy if exists "member_updates_household" on households;
create policy "member_updates_household" on households
  for update to authenticated
  using (is_household_member(id))
  with check (is_household_member(id));

-- כל אחד רואה את שורות החברות של עצמו, ובנוסף את אלה של משקי הבית
-- שהוא חבר בהם — כדי שאפשר יהיה להציג "מי עוד מסונכרן כאן".
drop policy if exists "member_reads_members" on household_members;
create policy "member_reads_members" on household_members
  for select to authenticated
  using (user_id = auth.uid() or is_household_member(household_id));

-- הצטרפות: רק בשם עצמך. user_id של מישהו אחר נדחה — כך שאי אפשר
-- לצרף אדם למשק בית בלי ידיעתו, וגם לא לצרף את עצמך אליו בשמו.
drop policy if exists "self_joins_household" on household_members;
create policy "self_joins_household" on household_members
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "self_leaves_household" on household_members;
create policy "self_leaves_household" on household_members
  for delete to authenticated
  using (user_id = auth.uid());

-- הנתונים עצמם: חברות במשק הבית היא התנאי היחיד, לכל הפעולות.
drop policy if exists "member_access_state" on meal_state;
create policy "member_access_state" on meal_state
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ============================================
-- הזמנת אדם שני — קוד חד-פעמי
-- ============================================
--
-- ההצטרפות היא הפעולה היחידה כאן שנותנת לאדם גישה לנתונים של אדם
-- אחר, ולכן היא היחידה שלא נשענת על RLS בלבד.
--
-- קוד קצר, פג תוך 24 שעות, נשרף בשימוש הראשון. שלושת המאפיינים
-- האלה הם מה שמאפשר קוד שנוח להקריא בטלפון: קוד שלא פג ולא נשרף
-- היה סיסמת-על קבועה למשק הבית.

create table if not exists household_invites (
  code         text primary key,
  household_id uuid not null references households (id) on delete cascade,
  created_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '24 hours',
  used_at      timestamptz,
  used_by      uuid references auth.users (id) on delete set null
);

alter table household_invites enable row level security;

-- חבר במשק הבית מנפיק הזמנה ורואה את ההזמנות שהנפיק. הוא לא רואה
-- הזמנות של משקי בית אחרים — הקוד הוא סוד, וטבלה שאפשר לסרוק אותה
-- הופכת אותו לניחוש.
drop policy if exists "member_manages_invites" on household_invites;
create policy "member_manages_invites" on household_invites
  for all to authenticated
  using (is_household_member(household_id))
  with check (is_household_member(household_id) and created_by = auth.uid());

-- המימוש: security definer, כי המצטרף **עדיין לא** חבר במשק הבית
-- ולכן שום מדיניות לא תיתן לו לקרוא את ההזמנה או לכתוב את החברות.
-- הפונקציה היא הדלת היחידה, והיא בודקת תפוגה ושריפה לפני שהיא פותחת.
create or replace function redeem_household_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- הנעילה מונעת מרוץ בין שני מימושים של אותו קוד. בלי זה שניהם היו
  -- קוראים used_at ריק ושניהם היו נכנסים.
  select household_id into target
  from household_invites
  where code = invite_code
    and used_at is null
    and expires_at > now()
  for update;

  if target is null then
    raise exception 'invalid or expired invite';
  end if;

  update household_invites
  set used_at = now(), used_by = auth.uid()
  where code = invite_code;

  insert into household_members (household_id, user_id)
  values (target, auth.uid())
  on conflict do nothing;

  return target;
end;
$$;

revoke all on function redeem_household_invite(text) from public;
grant execute on function redeem_household_invite(text) to authenticated;
