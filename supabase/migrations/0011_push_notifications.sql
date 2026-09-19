-- =====================================================================
-- Snatzee — Web Push subscriptions
--
-- A subscription is a per-device, per-browser handle the push service
-- hands out. One person can have several (phone on the homescreen, a
-- desktop browser), so the endpoint is the identity here, not the user.
--
-- Endpoints expire and are recycled by the push services, which is why
-- the endpoint is unique across the whole table and re-registering the
-- same endpoint moves it to whoever is signed in now.
-- =====================================================================

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ---------------------------------------------------------------------
-- RLS — a subscription is only ever visible to the person it belongs to.
-- The sender reads these with the service role, which bypasses RLS.
-- ---------------------------------------------------------------------
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = (select auth.uid()));

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = (select auth.uid()));

-- No insert or update policy: registration goes through the RPC below so
-- the row can never be written with someone else's user_id. The privileges
-- are spelled out rather than left to the stack's defaults, so the table is
-- append-only-through-the-RPC on any deployment.
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------
-- Register (or refresh) this device's subscription.
--
-- Called on every launch of the installed app, so an endpoint that the
-- browser silently rotated is picked up without the user doing anything.
-- ---------------------------------------------------------------------
create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.push_subscriptions;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = '' then
    raise exception 'Onvolledige push-subscription';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id      = excluded.user_id,
        p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        user_agent   = excluded.user_agent,
        last_seen_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Unregister this device.
--
-- Deleting by endpoint rather than by id keeps the client simple: it only
-- ever has the PushSubscription object the browser gave it.
-- ---------------------------------------------------------------------
create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  delete from public.push_subscriptions
  where endpoint = btrim(p_endpoint)
    and user_id = v_me;

  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- Does this account have any device registered?
-- The Settings toggle asks this so it reflects the account, not just the
-- permission state of the browser it happens to be open in.
-- ---------------------------------------------------------------------
create or replace function public.has_push_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.push_subscriptions where user_id = auth.uid()
  );
$$;

grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.has_push_subscription() to authenticated;

notify pgrst, 'reload schema';
