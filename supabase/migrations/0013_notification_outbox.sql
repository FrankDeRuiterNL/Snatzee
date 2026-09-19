-- =====================================================================
-- Snatzee — notification outbox
--
-- The database decides WHAT is worth a notification; the Next.js server
-- decides WHEN to flush, because only it can sign a Web Push request.
-- Postgres cannot reach the push services, and the client must not be
-- trusted to report on events it did not cause, so the two meet here.
--
-- Rows are written by triggers, claimed once by the sender, and kept
-- afterwards as a short record of what went out.
-- =====================================================================

do $$ begin
  create type public.notification_kind as enum (
    'FRIEND_REQUEST',
    'GROUP_ADDED',
    'LOST_TOP_SCORE',
    'ADMIN_BROADCAST'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.notification_outbox (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null,
  body       text not null,
  url        text not null default '/app',
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Set the moment a sender takes the row, so two overlapping flushes
  -- cannot both deliver it.
  claimed_at timestamptz,
  sent_at    timestamptz,
  error      text
);

-- The sender's only query: oldest unclaimed first.
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (created_at)
  where claimed_at is null;

create index if not exists notification_outbox_user_idx
  on public.notification_outbox (user_id, created_at desc);

alter table public.notification_outbox enable row level security;

-- Nobody reaches this through PostgREST. The service role bypasses RLS
-- and is the only reader; the triggers below are the only writer.
revoke all on public.notification_outbox from anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: queue a notification, skipping people who cannot receive one.
--
-- Checking for a subscription here keeps the table from filling with
-- rows for accounts that never turned notifications on.
-- ---------------------------------------------------------------------
create or replace function public.queue_notification(
  p_user  uuid,
  p_kind  public.notification_kind,
  p_title text,
  p_body  text,
  p_url   text default '/app',
  p_data  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    return null;
  end if;

  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then
    return null;
  end if;

  insert into public.notification_outbox (user_id, kind, title, body, url, data)
  values (p_user, p_kind, p_title, p_body, coalesce(p_url, '/app'), coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. A friend request arrives
--
-- Fires on the request itself, not on acceptance: the person who needs
-- to act is the addressee.
-- ---------------------------------------------------------------------
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.status <> 'pending' then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = new.requester_id;

  perform public.queue_notification(
    new.addressee_id,
    'FRIEND_REQUEST',
    'Nieuw vriendschapsverzoek',
    coalesce(v_name, 'Iemand') || ' wil je vriend worden op Snatzee.',
    '/app/friends',
    jsonb_build_object('requester_id', new.requester_id)
  );

  return null;
end;
$$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert on public.friendships
  for each row execute function public.notify_friend_request();

-- ---------------------------------------------------------------------
-- 2. Added to a group
--
-- Only when somebody else did the adding. Creating a group, or joining
-- one with an invite code, is your own action and needs no telling.
-- ---------------------------------------------------------------------
create or replace function public.notify_group_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group text;
  v_emoji text;
begin
  if new.user_id = auth.uid() then
    return null;
  end if;

  select name, emoji into v_group, v_emoji from public.groups where id = new.group_id;

  perform public.queue_notification(
    new.user_id,
    'GROUP_ADDED',
    'Toegevoegd aan een groep',
    'Je bent toegevoegd aan ' || coalesce(v_emoji || ' ', '') || coalesce(v_group, 'een groep') || '.',
    '/app/groups/' || new.group_id,
    jsonb_build_object('group_id', new.group_id)
  );

  return null;
end;
$$;

drop trigger if exists group_members_notify on public.group_members;
create trigger group_members_notify
  after insert on public.group_members
  for each row execute function public.notify_group_added();

-- ---------------------------------------------------------------------
-- 3. Knocked off the top score
--
-- The comparison is against the best score of everyone EXCEPT the new
-- entry's owner, so beating your own record notifies nobody, and a
-- second-best personal score never fires.
--
-- Ties do not count as taking the crown: the previous holder keeps it.
-- ---------------------------------------------------------------------
create or replace function public.notify_lost_top_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_user  uuid;
  v_prev_score int;
  v_name       text;
begin
  -- Who holds the top score as things stood before this entry.
  --
  -- One ranking, used once: an earlier version worked out the champion
  -- and then re-checked "did they really hold it" with a different tie
  -- rule, so a player who tied for the lead made the actual leader's
  -- next personal best look like a takeover.
  --
  -- Ties keep the incumbent, so the ordering falls back to the earliest
  -- entry: whoever reached the score first holds it.
  select se.user_id, se.score
  into v_prev_user, v_prev_score
  from public.score_entries se
  where se.id <> new.id
  order by se.score desc, se.played_at asc, se.created_at asc
  limit 1;

  -- Nothing to take: an empty board, or they were already top and just
  -- beat themselves.
  if v_prev_user is null or v_prev_user = new.user_id then
    return null;
  end if;

  -- Only an outright pass takes the crown.
  if new.score <= v_prev_score then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = new.user_id;

  perform public.queue_notification(
    v_prev_user,
    'LOST_TOP_SCORE',
    'Je toppositie is overgenomen',
    coalesce(v_name, 'Iemand') || ' scoorde ' || new.score || ' en staat nu bovenaan.',
    '/app/rankings',
    jsonb_build_object('score', new.score, 'by_user_id', new.user_id)
  );

  return null;
end;
$$;

drop trigger if exists score_entries_notify on public.score_entries;
create trigger score_entries_notify
  after insert on public.score_entries
  for each row execute function public.notify_lost_top_score();

notify pgrst, 'reload schema';

-- =====================================================================
-- The sender's side of the outbox
--
-- Claiming and completing are separate calls so a crash mid-send loses
-- at most one notification instead of the whole batch, and a row that
-- was claimed but never completed is visibly stuck rather than silently
-- re-sent forever.
-- =====================================================================

create or replace function public.claim_notifications(p_limit integer default 50)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the server may drain the queue. A signed-in user reaching this
  -- would be able to claim (and so suppress) other people's notifications.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  return query
  update public.notification_outbox o
  set claimed_at = now()
  where o.id in (
    select id
    from public.notification_outbox
    where claimed_at is null
    order by created_at
    -- Concurrent flushes take disjoint batches rather than blocking.
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  returning o.*;
end;
$$;

create or replace function public.complete_notification(p_id uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  update public.notification_outbox
  set sent_at = case when p_error is null then now() else null end,
      error   = p_error
  where id = p_id;

  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin broadcast
--
-- p_user_ids null or empty means everyone who can actually receive one.
-- The rows go through the same outbox as everything else, so a broadcast
-- is delivered, retried and recorded exactly like a friend request.
-- ---------------------------------------------------------------------
create or replace function public.admin_broadcast_notification(
  p_title    text,
  p_body     text,
  p_user_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  v_count integer;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  if v_title = '' or v_body = '' then
    raise exception 'Titel en tekst zijn verplicht';
  end if;

  -- Notification bodies are truncated hard by every platform; failing
  -- loudly here beats sending something that arrives cut in half.
  if char_length(v_title) > 80 then
    raise exception 'Titel mag maximaal 80 tekens zijn';
  end if;
  if char_length(v_body) > 300 then
    raise exception 'Tekst mag maximaal 300 tekens zijn';
  end if;

  with recipients as (
    select distinct ps.user_id
    from public.push_subscriptions ps
    where p_user_ids is null
       or array_length(p_user_ids, 1) is null
       or ps.user_id = any(p_user_ids)
  ),
  queued as (
    insert into public.notification_outbox (user_id, kind, title, body, url, data)
    select r.user_id, 'ADMIN_BROADCAST', v_title, v_body, '/app',
           jsonb_build_object('sent_by', v_me)
    from recipients r
    returning 1
  )
  select count(*) into v_count from queued;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'SEND_NOTIFICATION', null, 'notification', null,
    jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'recipients', v_count,
      'audience', case
        when p_user_ids is null or array_length(p_user_ids, 1) is null then 'all'
        else 'selected'
      end
    )
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Who an admin can pick from.
--
-- Includes everyone, with a flag for whether they would actually receive
-- it, so the console can say "3 of the 8 you picked have notifications
-- on" instead of silently sending to nobody.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_notifiable_users(p_search text default null)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  has_push     boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.username,
         p.display_name,
         p.avatar_url,
         exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
  from public.profiles p
  where p.onboarding_completed
    and (
      v_q is null
      or p.username ilike '%' || v_q || '%'
      or p.display_name ilike '%' || v_q || '%'
    )
  order by p.display_name, p.username;
end;
$$;

grant execute on function public.admin_broadcast_notification(text, text, uuid[]) to authenticated;
grant execute on function public.admin_list_notifiable_users(text) to authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.complete_notification(uuid, text) to service_role;

-- The sender reads subscriptions and the outbox directly as the service
-- role. Supabase grants that by default, but spelling it out means the
-- sender does not depend on a default staying in place.
grant select, delete on public.push_subscriptions to service_role;
grant select, insert, update on public.notification_outbox to service_role;

notify pgrst, 'reload schema';
