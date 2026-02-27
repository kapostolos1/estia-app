-- 20260122_subscriptions_trial.sql

-- 0) Safety
create extension if not exists "pgcrypto";

-- 1) Profiles: admin free access (whitelist) + optional expiry
alter table public.profiles
  add column if not exists is_free boolean not null default false;

alter table public.profiles
  add column if not exists free_until timestamptz null;

alter table public.profiles
  add column if not exists free_note text null;

-- 2) Subscriptions: 1 row per business
create table if not exists public.subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,

  paid_until timestamptz null,         -- set later by Google Play webhook / manual admin
  provider text not null default 'googleplay',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_owner_id_idx on public.subscriptions(owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_subscriptions_touch on public.subscriptions;
create trigger trg_subscriptions_touch
before update on public.subscriptions
for each row execute function public.touch_updated_at();

-- 3) Trigger: when a business is created, start a 15-day trial
create or replace function public.init_subscription_on_business_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (business_id, owner_id, trial_started_at, trial_ends_at, provider)
  values (new.id, new.owner_id, now(), now() + interval '15 days', 'googleplay')
  on conflict (business_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_init_subscription_on_business on public.businesses;
create trigger trg_init_subscription_on_business
after insert on public.businesses
for each row execute function public.init_subscription_on_business_insert();

-- 4) RPC: get_access_status(business_id)
-- Returns everything the app needs (including 24h warning)
create or replace function public.get_access_status(p_business_id uuid)
returns table (
  business_id uuid,
  my_role text,
  is_owner boolean,
  is_free boolean,
  allowed boolean,
  status text,           -- free | trial | active | grace | expired
  ends_at timestamptz,   -- trial_ends_at or paid_until (the "paid/trial" end)
  grace_until timestamptz,
  lock_at timestamptz,   -- when it fully locks (end + 24h grace)
  warn_24h boolean,
  hours_left integer     -- hours left until ends_at (not lock_at)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles%rowtype;
  sub public.subscriptions%rowtype;
  now_ts timestamptz := now();
  free_ok boolean := false;
  effective_end timestamptz;
  effective_grace timestamptz;
  effective_lock timestamptz;
  hleft integer;
  warn boolean := false;
  st text;
  allow boolean := false;
begin
  -- find my profile (must belong to this business)
  select * into me
  from public.profiles
  where id = auth.uid()
  limit 1;

  if me.id is null then
    raise exception 'No profile for current user';
  end if;

  if me.business_id is distinct from p_business_id then
    raise exception 'Not member of this business';
  end if;

  -- free override
  free_ok := (me.is_free = true) and (me.free_until is null or me.free_until > now_ts);

  -- subscription row must exist (created by trigger on businesses)
  select * into sub
  from public.subscriptions
  where business_id = p_business_id
  limit 1;

  if sub.business_id is null then
    -- fallback: create a trial if missing (rare)
    insert into public.subscriptions (business_id, owner_id, trial_started_at, trial_ends_at, provider)
    values (p_business_id, coalesce(me.id, auth.uid()), now_ts, now_ts + interval '15 days', 'googleplay')
    on conflict (business_id) do nothing;

    select * into sub from public.subscriptions where business_id = p_business_id limit 1;
  end if;

  -- determine end/grace/lock
  effective_end := coalesce(sub.paid_until, sub.trial_ends_at);
  effective_grace := effective_end + interval '24 hours';
  effective_lock := effective_grace;

  -- hours left until effective_end (for 24h warning)
  hleft := greatest(0, floor(extract(epoch from (effective_end - now_ts)) / 3600)::int);

  if free_ok then
    st := 'free';
    allow := true;
    warn := false;
  else
    if now_ts < sub.trial_ends_at and sub.paid_until is null then
      st := 'trial';
      allow := true;
      warn := (sub.trial_ends_at - now_ts) <= interval '24 hours';
    elsif sub.paid_until is not null and now_ts < sub.paid_until then
      st := 'active';
      allow := true;
      warn := (sub.paid_until - now_ts) <= interval '24 hours';
    elsif now_ts >= effective_end and now_ts < effective_grace then
      st := 'grace';
      allow := true;
      warn := false; -- εδώ ήδη έχει λήξει, δεν χρειάζεται “24h πριν”
    else
      st := 'expired';
      allow := false;
      warn := false;
    end if;
  end if;

  return query
  select
    p_business_id,
    coalesce(me.role, 'staff') as my_role,
    (coalesce(me.role,'') = 'owner') as is_owner,
    free_ok as is_free,
    allow as allowed,
    st as status,
    effective_end as ends_at,
    effective_grace as grace_until,
    effective_lock as lock_at,
    warn as warn_24h,
    hleft as hours_left;
end;
$$;

-- 5) RLS for subscriptions (safe)
alter table public.subscriptions enable row level security;

drop policy if exists "subs_select_member" on public.subscriptions;
create policy "subs_select_member"
on public.subscriptions for select
using (
  exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.business_id = public.subscriptions.business_id
  )
);

-- Updates only by owner (for now).
-- Later, Google Play webhook will use service role (bypasses RLS anyway).
drop policy if exists "subs_update_owner" on public.subscriptions;
create policy "subs_update_owner"
on public.subscriptions for update
using (
  exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.role = 'owner'
      and me.business_id = public.subscriptions.business_id
  )
)
with check (
  exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and me.role = 'owner'
      and me.business_id = public.subscriptions.business_id
  )
);

-- 6) Purge helper (call later via cron/edge function)
-- Deletes businesses whose lock_at is older than 6 months (and not free)
create or replace function public.purge_inactive_businesses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt integer := 0;
begin
  -- delete businesses where:
  -- - not free (no owner with is_free true)
  -- - lock_at older than 6 months
  with doomed as (
    select s.business_id
    from public.subscriptions s
    where (coalesce(s.paid_until, s.trial_ends_at) + interval '24 hours') < (now() - interval '6 months')
      and not exists (
        select 1 from public.profiles p
        where p.business_id = s.business_id
          and p.role = 'owner'
          and p.is_free = true
          and (p.free_until is null or p.free_until > now())
      )
  )
  delete from public.businesses b
  using doomed d
  where b.id = d.business_id;

  get diagnostics cnt = row_count;
  return cnt;
end;
$$;
