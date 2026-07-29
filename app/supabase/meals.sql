-- ============================================
-- מתכנן הארוחות — משק בית משותף
--
-- להריץ ב-Supabase: SQL Editor → New query → הדבק → Run.
-- idempotent — בטוח להריץ שוב אחרי עריכה.
--
-- להוספת אדם למשק הבית: שורה ב-meals_allowlist (בתחתית הקובץ), והרצה
-- חוזרת. אין זרימת הזמנות ואין ניהול משתמשים — לשני אנשים, טבלה עם
-- שתי שורות היא התשובה הנכונה.
-- ============================================

-- ---------- טבלאות ----------

-- מי רשאי להיכנס, ולאיזה משק בית הוא שייך.
-- household_key הוא שם לוגי ולא מזהה: הוא מאפשר לרשום אדם למשק בית
-- שעדיין לא נוצר, וההתחברות הראשונה היא זו שתיצור אותו.
create table if not exists meals_allowlist (
  email          text primary key,
  household_key  text not null default 'home',
  profile_id     text,
  created_at     timestamptz not null default now()
);

-- מצב האפליקציה כמסמך אחד למשק בית.
--
-- ── למה מסמך ולא טבלה לכל ישות ──────────────────────────────────────
-- הפירוק ל-slots/pantry/dishes בטבלאות נפרדות נשמע נכון, אבל הוא היה
-- מחייב כתיבה מחדש של כל האפליקציה: כל המסכים קוראים מ-store.state
-- באופן סינכרוני, וזה מה שמאפשר להם לעבוד בלי רשת.
--
-- המחיר של מסמך אחד הוא איבוד המיזוג של Postgres — ולכן המיזוג נעשה
-- בקליינט לפי מפתח (app/js/merge.js), ו-meta מחזיק חותמת זמן לכל
-- מפתח. rev הוא מונה גרסה: כל כתיבה מותנית בערך שממנו היא נגזרה,
-- וכך שתי כתיבות מקבילות אינן דורסות זו את זו.
create table if not exists meals_households (
  id             uuid primary key default gen_random_uuid(),
  household_key  text unique not null,
  doc            jsonb not null default '{}'::jsonb,
  meta           jsonb not null default '{}'::jsonb,
  rev            bigint not null default 0,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

create table if not exists meals_members (
  household_id   uuid not null references meals_households(id) on delete cascade,
  email          text not null,
  profile_id     text,
  joined_at      timestamptz not null default now(),
  primary key (household_id, email)
);

create index if not exists meals_members_email_idx on meals_members (email);

-- ---------- RLS ----------

alter table meals_allowlist  enable row level security;
alter table meals_households enable row level security;
alter table meals_members    enable row level security;

-- המייל מתוך ה-JWT, מנורמל. stable ולא volatile כדי ש-Postgres יוכל
-- להריץ אותו פעם אחת לשאילתה במקום לכל שורה.
create or replace function meals_my_email() returns text
  language sql stable
  set search_path = public
as $$ select lower(auth.jwt() ->> 'email') $$;

create or replace function meals_is_member(p_household uuid) returns boolean
  language sql stable security definer
  set search_path = public
as $$
  select exists (
    select 1 from meals_members
    where household_id = p_household and email = meals_my_email()
  )
$$;

drop policy if exists "member_read"  on meals_households;
drop policy if exists "member_write" on meals_households;

create policy "member_read" on meals_households for select to authenticated
  using (meals_is_member(id));

-- אין policy ל-insert ול-delete בכוונה: משק בית נוצר אך ורק דרך
-- meals_bootstrap, ואינו נמחק מהאפליקציה כלל.
create policy "member_write" on meals_households for update to authenticated
  using (meals_is_member(id))
  with check (meals_is_member(id));

drop policy if exists "self_read" on meals_members;
create policy "self_read" on meals_members for select to authenticated
  using (email = meals_my_email());

-- meals_allowlist נשארת בלי אף policy: RLS פעיל ואין היתר, כלומר אף
-- קליינט אינו קורא או כותב אותה. רק meals_bootstrap ניגש אליה, והוא
-- security definer.
revoke all on meals_allowlist from anon, authenticated;

-- ---------- הצטרפות ----------

-- מחזיר את משק הבית של המשתמש, ויוצר אותו בהתחברות הראשונה.
--
-- הפונקציה היא security definer מסיבה אחת: משתמש חדש עדיין אינו חבר
-- באף משק בית, ולכן ה-RLS שמגן על הטבלה חוסם ממנו גם את ההצטרפות
-- אליה. זו ביצה ותרנגולת שרק פונקציה בהרשאות מוגברות פותרת — והיא
-- מצומצמת בדיוק לכך: קוראת את רשימת ההרשאה, ואם המייל אינו שם היא
-- נכשלת.
create or replace function meals_bootstrap()
returns table (household_id uuid, profile_id text)
  language plpgsql security definer
  set search_path = public
as $$
declare
  v_email     text := meals_my_email();
  v_key       text;
  v_profile   text;
  v_household uuid;
begin
  if v_email is null or v_email = '' then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select a.household_key, a.profile_id into v_key, v_profile
  from meals_allowlist a where a.email = v_email;

  if v_key is null then
    raise exception 'email not on allowlist' using errcode = '42501';
  end if;

  -- on conflict ולא "בדוק ואז הוסף": שתי התחברויות ראשונות במקביל היו
  -- מנסות ליצור את אותו משק בית, ואחת מהן הייתה נופלת על מפתח כפול.
  insert into meals_households (household_key) values (v_key)
  on conflict (household_key) do nothing;

  select h.id into v_household from meals_households h where h.household_key = v_key;

  insert into meals_members (household_id, email, profile_id)
  values (v_household, v_email, v_profile)
  on conflict (household_id, email) do update set profile_id = excluded.profile_id;

  return query select v_household, v_profile;
end $$;

revoke all on function meals_bootstrap() from public, anon;
grant execute on function meals_bootstrap() to authenticated;

-- ---------- מי במשק הבית ----------
--
-- profile_id מקשר חשבון גוגל לפרופיל באפליקציה (p1, p2 …), כך שהמאקרו
-- יודע מי מסתכל. אפשר להשאיר null — הקישור אינו נדרש לשום דבר אחר.
--
-- ⚠️ להחליף את הכתובת של גילי בכתובת האמיתית לפני ההרצה.

insert into meals_allowlist (email, household_key, profile_id) values
  ('yarin@ganpereh.co.il', 'home', 'p1'),
  ('gili@example.com',     'home', 'p2')
on conflict (email) do update
  set household_key = excluded.household_key,
      profile_id    = excluded.profile_id;
