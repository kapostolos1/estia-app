-- Hardening subscriptions table (no client insert/delete)
alter table public.subscriptions enable row level security;

-- explicit: forbid insert/delete from client roles
drop policy if exists "subs_no_insert" on public.subscriptions;
create policy "subs_no_insert"
on public.subscriptions
for insert
to public
with check (false);

drop policy if exists "subs_no_delete" on public.subscriptions;
create policy "subs_no_delete"
on public.subscriptions
for delete
to public
using (false);

-- Optional: ensure only ONE subscription per business (already PK if business_id is PK)
-- (If business_id is already primary key, nothing to do)

-- Ensure trial_ends_at always >= trial_started_at (basic sanity)
alter table public.subscriptions
  drop constraint if exists subscriptions_trial_check;

alter table public.subscriptions
  add constraint subscriptions_trial_check
  check (trial_ends_at >= trial_started_at);

-- Optional: provider non-empty
alter table public.subscriptions
  drop constraint if exists subscriptions_provider_check;

alter table public.subscriptions
  add constraint subscriptions_provider_check
  check (length(trim(provider)) > 0);
