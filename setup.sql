-- ===== Aquestoria database setup. Paste this whole file into Supabase → SQL Editor → Run. =====
-- The 168-hour trial and the "paid" flag live HERE, so users cannot change them from the browser.

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  trial_seconds  integer     not null default 604800,                       -- <- free USE allowance: 168 hours = 604800 seconds
  used_seconds   integer     not null default 0,                            -- seconds of real use so far (only the server can change this)
  last_heartbeat_at timestamptz,
  trial_ends_at  timestamptz not null default (now() + interval '180 days'),-- <- backstop: free hours also expire 180 days after sign-up
  paid           boolean     not null default false,
  paid_at        timestamptz,
  stripe_session text,
  created_at     timestamptz not null default now()
);
-- (safe to re-run on a project that used the older wall-clock version)
alter table public.profiles add column if not exists trial_seconds integer not null default 604800;
alter table public.profiles add column if not exists used_seconds integer not null default 0;
alter table public.profiles add column if not exists last_heartbeat_at timestamptz;

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,                  -- the whole planner (quests, Gold, classes, cosmetics…)
  updated_at timestamptz not null default now()
);

alter table public.profiles  enable row level security;
alter table public.user_data enable row level security;

-- Users may only READ their own profile. There is no update policy, so the browser can never change paid / trial_ends_at.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

-- Does the signed-in user still have access? (paid, OR free use left AND the 180-day backstop not reached)
create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and (p.paid or (p.used_seconds < p.trial_seconds and p.trial_ends_at > now())));
$$;

-- Usage meter: the app calls this about once a minute while someone is actually using Aquestoria (tab visible + recent activity).
-- The server decides how much time to credit: never more than the real time since the last call, and at most 70 seconds per call.
-- fresh = true means "I just started/resumed using it", which credits nothing (so idle gaps are never counted).
create or replace function public.record_usage(fresh boolean default false)
returns table (used_seconds integer, trial_seconds integer, paid boolean)
language plpgsql security definer set search_path = public as $$
declare p public.profiles; credit integer := 0;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'no profile'; end if;
  if not p.paid and not fresh and p.last_heartbeat_at is not null then
    credit := least(greatest(extract(epoch from (now() - p.last_heartbeat_at))::integer, 0), 70);
  end if;
  update public.profiles set used_seconds = least(p.used_seconds + credit, p.trial_seconds), last_heartbeat_at = now()
    where id = p.id returning profiles.used_seconds into p.used_seconds;
  return query select p.used_seconds, p.trial_seconds, p.paid;
end; $$;
revoke all on function public.record_usage(boolean) from public, anon;
grant execute on function public.record_usage(boolean) to authenticated;

-- Data: you can always READ your own data (so you can download it after the trial) but only WRITE while you have access.
drop policy if exists "read own data"   on public.user_data;
drop policy if exists "insert own data" on public.user_data;
drop policy if exists "update own data" on public.user_data;
create policy "read own data"   on public.user_data for select using (auth.uid() = user_id);
create policy "insert own data" on public.user_data for insert with check (auth.uid() = user_id and public.has_access());
create policy "update own data" on public.user_data for update using (auth.uid() = user_id and public.has_access())
                                                              with check (auth.uid() = user_id and public.has_access());

-- Every new sign-up gets a profile row, which starts the trial clock.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Lets a signed-in user permanently delete THEIR OWN account. Deleting the login also deletes their profile and saved
-- planner data automatically (the tables above use "on delete cascade"). Safe to re-run.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================================================
-- ===================== FREE ACCESS (bypass payment) — added section, safe to re-run =====================
-- Two ways to give someone a free, permanent account. Both just set paid = true, which the rest of the
-- app already treats as "unlocked forever" (no trial clock, no paywall).
--
-- WAY 1: GRANT BY EMAIL (they must have signed up first). Run this in the SQL Editor:
--   update public.profiles set paid = true, paid_at = now(), stripe_session = 'free-grant'
--   where email = 'friend@example.com';
--   -- to take it back:  update public.profiles set paid = false, paid_at = null, stripe_session = null where email = '...';
--
-- WAY 2: ACCESS CODES you hand out. Create codes in the SQL Editor (use long random codes, never short words):
--   insert into public.access_codes (code, max_uses, note) values ('AQ-7KD2-9XPM-4TQW', 1, 'for Sam');      -- one person
--   insert into public.access_codes (code, max_uses, expires_at, note)
--     values ('AQ-CLASSROOM-2026-Q8Z3', 30, now() + interval '60 days', 'class of 30');                   -- many people
--   -- see who used what:  select code, uses, max_uses, note from public.access_codes;
--   -- turn a code off:    update public.access_codes set disabled = true where code = '...';
-- People type the code in the app (paywall or Settings → "Have a free-access code?").
-- =====================================================================================================
create table if not exists public.access_codes (
  code       text primary key,
  max_uses   integer     not null default 1,
  uses       integer     not null default 0,
  expires_at timestamptz,
  disabled   boolean     not null default false,
  note       text,
  created_at timestamptz not null default now()
);
-- RLS on with NO policies = browsers can never read or list the codes. Only the function below (and you) can.
alter table public.access_codes enable row level security;

alter table public.profiles add column if not exists code_attempts integer not null default 0;

-- Returns true if the code worked. Wrong guesses are counted; after 10 wrong guesses the account can no longer
-- redeem codes (you can reset it: update public.profiles set code_attempts = 0 where email = '...';).
create or replace function public.redeem_access_code(input_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.profiles; c public.access_codes;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'no profile'; end if;
  if p.paid then return true; end if;                       -- already unlocked: nothing to do
  if p.code_attempts >= 10 then return false; end if;       -- too many wrong guesses
  select * into c from public.access_codes
    where code = upper(trim(input_code)) and not disabled
      and uses < max_uses and (expires_at is null or expires_at > now())
    for update;
  if not found then
    update public.profiles set code_attempts = code_attempts + 1 where id = p.id;
    return false;
  end if;
  update public.access_codes set uses = uses + 1 where code = c.code;
  update public.profiles set paid = true, paid_at = now(), stripe_session = 'free-code:' || c.code where id = p.id;
  return true;
end; $$;
revoke all on function public.redeem_access_code(text) from public, anon;
grant execute on function public.redeem_access_code(text) to authenticated;