-- Aquestoria database setup
-- Free trial: 7 consecutive days from account creation.
-- Paid accounts and redeemed free-access codes remain unlocked permanently.

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  trial_ends_at  timestamptz not null default (now() + interval '7 days'),
  paid           boolean not null default false,
  paid_at        timestamptz,
  stripe_session text,
  code_attempts  integer not null default 0,
  created_at     timestamptz not null default now()
);

-- Update the default for projects where profiles already existed.
alter table public.profiles
  alter column trial_ends_at set default (now() + interval '7 days');

-- Existing unpaid accounts get an end date 7 days after their original sign-up.
-- Paid accounts are left untouched.
update public.profiles
set trial_ends_at = created_at + interval '7 days'
where paid = false;

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;

-- Users can read only their own profile. They cannot change paid or trial dates.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Access lasts until the 7-day trial expires, unless the account is paid.
create or replace function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.paid or p.trial_ends_at > now())
  );
$$;

-- Users can always read their own planner data, including after the trial.
-- They can insert or update it only while they have access.
drop policy if exists "read own data" on public.user_data;
drop policy if exists "insert own data" on public.user_data;
drop policy if exists "update own data" on public.user_data;

create policy "read own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "insert own data"
  on public.user_data for insert
  with check (auth.uid() = user_id and public.has_access());

create policy "update own data"
  on public.user_data for update
  using (auth.uid() = user_id and public.has_access())
  with check (auth.uid() = user_id and public.has_access());

-- Every new sign-up gets a profile row; the 7-day trial starts at sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets a signed-in user permanently delete their own account.
-- Deleting the auth user also deletes their profile and planner data.