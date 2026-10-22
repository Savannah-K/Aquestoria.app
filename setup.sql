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