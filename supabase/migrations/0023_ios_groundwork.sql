-- =====================================================================
-- Snatzee — groundwork for the native iOS app
--
--  1. APNs devices next to Web Push subscriptions, and one helper that
--     says whether someone can receive a notification at all.
--  2. Blocking and reporting players, which the App Store requires of
--     any app with user-generated content (guideline 1.2), plus the
--     admin side of it.
--  3. One RPC per screen that used to be assembled from several queries
--     in the Next.js server code (friends, group detail, public
--     profile), so the web app and the iOS app share one implementation.
--  4. get_client_config(): the settings an app needs at launch,
--     including the minimum iOS build that may still talk to this API.
--
-- New RPCs raise with a stable machine-readable HINT next to the Dutch
-- message ("user_not_found", "not_a_member", ...). PostgREST returns it
-- as `hint`, so a client can translate without parsing the text.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. APNs devices
-- ---------------------------------------------------------------------
create table if not exists public.apns_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  -- The hex device token APNs hands the app.
  token        text not null unique,
  -- Development builds get tokens for the sandbox gateway.
  environment  text not null default 'production'
                 check (environment in ('production', 'sandbox')),
  bundle_id    text,
  app_version  text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint apns_devices_token_format check (token ~ '^[0-9a-f]{32,200}$')
);

create index if not exists apns_devices_user_idx on public.apns_devices (user_id);

alter table public.apns_devices enable row level security;

drop policy if exists "apns_devices_select_own" on public.apns_devices;
create policy "apns_devices_select_own" on public.apns_devices
  for select using (user_id = (select auth.uid()));

drop policy if exists "apns_devices_delete_own" on public.apns_devices;
create policy "apns_devices_delete_own" on public.apns_devices
  for delete using (user_id = (select auth.uid()));

revoke all on public.apns_devices from anon, authenticated;
grant select, delete on public.apns_devices to authenticated;
grant select, delete on public.apns_devices to service_role;

-- Registers (or moves) this device to the signed-in account. Called on
-- every launch: APNs can hand out a new token at any time.
create or replace function public.register_apns_device(
  p_token       text,
  p_environment text default 'production',
  p_bundle_id   text default null,
  p_app_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_token text := lower(btrim(coalesce(p_token, '')));
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000', hint = 'not_signed_in';
  end if;
  if v_token !~ '^[0-9a-f]{32,200}$' then
    raise exception 'Ongeldig apparaattoken' using errcode = '22023', hint = 'invalid_device_token';
  end if;
  if coalesce(p_environment, 'production') not in ('production', 'sandbox') then
    raise exception 'Onbekende APNs-omgeving' using errcode = '22023', hint = 'invalid_environment';
  end if;

  insert into public.apns_devices (user_id, token, environment, bundle_id, app_version)
  values (v_me, v_token, coalesce(p_environment, 'production'), p_bundle_id, p_app_version)
  on conflict (token) do update
    set user_id      = excluded.user_id,
        environment  = excluded.environment,
        bundle_id    = excluded.bundle_id,
        app_version  = excluded.app_version,
        last_seen_at = now();

  return true;
end;
$$;

create or replace function public.unregister_apns_device(p_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.apns_devices
    where token = lower(btrim(coalesce(p_token, ''))) and user_id = auth.uid()
    returning 1
  )
  select exists (select 1 from gone);
$$;

grant execute on function public.register_apns_device(text, text, text, text) to authenticated;
grant execute on function public.unregister_apns_device(text) to authenticated;

-- Can this person receive a notification on any device?
create or replace function public.has_push_device(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.push_subscriptions where user_id = p_user)
      or exists (select 1 from public.apns_devices where user_id = p_user);
$$;

revoke execute on function public.has_push_device(uuid) from public, anon, authenticated;

create or replace function public.has_push_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_push_device(auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 2. Blocking and reporting
-- ---------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- You see who you blocked; nobody sees who blocked them.
drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select using (blocker_id = (select auth.uid()));

revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Used inside RLS policies and views, which evaluate it as the caller.
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated;

create or replace function public.block_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000', hint = 'not_signed_in';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Je kunt jezelf niet blokkeren' using errcode = '22023', hint = 'cannot_block_self';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002', hint = 'user_not_found';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_me, p_user_id)
  on conflict do nothing;

  -- A block ends the friendship and any pending request, either way.
  delete from public.friendships
  where (requester_id = v_me and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = v_me);

  return true;
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.user_blocks
    where blocker_id = auth.uid() and blocked_id = p_user_id
    returning 1
  )
  select exists (select 1 from gone);
$$;

create or replace function public.list_blocked_users()
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  blocked_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, b.created_at
  from public.user_blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_blocked_users() to authenticated;

do $$ begin
  create type public.report_reason as enum (
    'OFFENSIVE_NAME', 'OFFENSIVE_AVATAR', 'OFFENSIVE_BIO',
    'OFFENSIVE_GROUP', 'CHEATING', 'HARASSMENT', 'SPAM', 'OTHER'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.report_status as enum ('OPEN', 'RESOLVED', 'DISMISSED');
exception when duplicate_object then null;
end $$;

create table if not exists public.content_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  target_user_id  uuid references public.profiles (id) on delete cascade,
  target_group_id uuid references public.groups (id) on delete cascade,
  reason          public.report_reason not null,
  details         text,
  status          public.report_status not null default 'OPEN',
  created_at      timestamptz not null default now(),
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  constraint content_reports_target check (target_user_id is not null or target_group_id is not null),
  constraint content_reports_details_len check (details is null or char_length(details) <= 500)
);

create index if not exists content_reports_open_idx
  on public.content_reports (created_at) where status = 'OPEN';

alter table public.content_reports enable row level security;
-- Only reachable through the RPCs below.
revoke all on public.content_reports from anon, authenticated;

create or replace function public.report_content(
  p_reason          public.report_reason,
  p_target_user_id  uuid default null,
  p_target_group_id uuid default null,
  p_details         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000', hint = 'not_signed_in';
  end if;
  if p_target_user_id is null and p_target_group_id is null then
    raise exception 'Wat wil je melden?' using errcode = '22023', hint = 'missing_target';
  end if;
  if p_target_user_id = v_me then
    raise exception 'Je kunt jezelf niet melden' using errcode = '22023', hint = 'cannot_report_self';
  end if;
  if p_target_user_id is not null
     and not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002', hint = 'user_not_found';
  end if;
  -- A group can only be reported by someone who can see it.
  if p_target_group_id is not null
     and not public.is_group_member(p_target_group_id, v_me) then
    raise exception 'Groep niet gevonden' using errcode = 'P0002', hint = 'group_not_found';
  end if;
  -- Plenty for honest use, and a cap on flooding the admins.
  if (select count(*) from public.content_reports
      where reporter_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Je hebt vandaag al veel meldingen gedaan' using errcode = '54000', hint = 'rate_limited';
  end if;

  insert into public.content_reports (reporter_id, target_user_id, target_group_id, reason, details)
  values (v_me, p_target_user_id, p_target_group_id, p_reason,
          nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.report_content(public.report_reason, uuid, uuid, text) to authenticated;

create or replace function public.admin_list_reports(p_status public.report_status default 'OPEN')
returns table (
  id                   uuid,
  reason               public.report_reason,
  details              text,
  status               public.report_status,
  created_at           timestamptz,
  reporter_username    text,
  target_user_id       uuid,
  target_username      text,
  target_display_name  text,
  target_avatar_url    text,
  target_bio           text,
  target_group_id      uuid,
  target_group_name    text,
  resolution_note      text,
  resolved_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501', hint = 'forbidden';
  end if;

  return query
  select r.id, r.reason, r.details, r.status, r.created_at,
         rp.username,
         r.target_user_id, tp.username, tp.display_name, tp.avatar_url, tp.bio,
         r.target_group_id, g.name,
         r.resolution_note, r.resolved_at
  from public.content_reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.target_user_id
  left join public.groups g on g.id = r.target_group_id
  where p_status is null or r.status = p_status
  order by r.created_at desc
  limit 200;
end;
$$;

create or replace function public.admin_resolve_report(
  p_id     uuid,
  p_status public.report_status,
  p_note   text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.content_reports;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501', hint = 'forbidden';
  end if;
  if p_status = 'OPEN' then
    raise exception 'Kies opgelost of afgewezen' using errcode = '22023', hint = 'invalid_status';
  end if;

  update public.content_reports
  set status = p_status, resolved_by = v_me, resolved_at = now(),
      resolution_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Melding niet gevonden' using errcode = 'P0002', hint = 'report_not_found';
  end if;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (v_me, 'RESOLVE_REPORT', v_row.target_user_id, 'report', v_row.id,
          jsonb_build_object('status', p_status, 'reason', v_row.reason, 'note', v_row.resolution_note));

  return true;
end;
$$;

-- Clears what a player chose to show others, for a report that was
-- upheld. The display name falls back to the username, which is
-- already held to a strict format.
create or replace function public.admin_moderate_profile(
  p_user_id            uuid,
  p_clear_avatar       boolean default false,
  p_clear_bio          boolean default false,
  p_reset_display_name boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501', hint = 'forbidden';
  end if;

  update public.profiles
  set avatar_url   = case when p_clear_avatar then null else avatar_url end,
      bio          = case when p_clear_bio then null else bio end,
      display_name = case when p_reset_display_name then username else display_name end
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002', hint = 'user_not_found';
  end if;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (auth.uid(), 'MODERATE_PROFILE', p_user_id, 'profile', p_user_id,
          jsonb_build_object('avatar', p_clear_avatar, 'bio', p_clear_bio,
                             'display_name', p_reset_display_name));

  return v_row;
end;
$$;

grant execute on function public.admin_list_reports(public.report_status) to authenticated;
grant execute on function public.admin_resolve_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.admin_moderate_profile(uuid, boolean, boolean, boolean) to authenticated;

-- Details stay hidden between two people when either blocked the other.
create or replace function public.can_view_details(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
      or (
        not public.is_blocked_between(auth.uid(), p_user)
        and (
          coalesce((select not p.is_private from public.profiles p where p.id = p_user), true)
          or (auth.uid() is not null and public.are_friends(auth.uid(), p_user))
        )
      );
$$;

-- ---------------------------------------------------------------------
-- Existing functions that now know about blocks and APNs devices
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

  if not public.has_push_device(p_user) then
    return null;
  end if;

  insert into public.notification_outbox (user_id, kind, title, body, url, data)
  values (p_user, p_kind, p_title, p_body, coalesce(p_url, '/app'), coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_list_users(p_search text default null)
returns table (
  user_id           uuid,
  username          text,
  display_name      text,
  avatar_url        text,
  has_push          boolean,
  achievement_count integer
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
         public.has_push_device(p.id),
         (select count(*)::integer from public.user_achievements ua where ua.user_id = p.id)
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
    select distinct d.user_id
    from (
      select user_id from public.push_subscriptions
      union
      select user_id from public.apns_devices
    ) d
    where p_user_ids is null
       or array_length(p_user_ids, 1) is null
       or d.user_id = any(p_user_ids)
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

create or replace function public.get_leaderboard(
  p_metric   text default 'highest_score',
  p_scope    text default 'global',
  p_group_id uuid default null,
  p_limit    integer default 50
)
returns table (
  rank          bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  value         numeric,
  games_played  integer,
  is_current_user boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_min_games int := public.app_setting_int('min_games_for_average_ranking', 5);
  v_limit    int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if p_metric not in ('highest_score', 'average_score', 'games_played', 'wins',
                      'yahtzee_count', 'first_roll_yahtzee_count') then
    raise exception 'Unknown leaderboard metric: %', p_metric;
  end if;

  if p_scope = 'group' then
    if p_group_id is null then
      raise exception 'A group id is required for the group scope';
    end if;
    if v_me is null or not public.is_group_member(p_group_id, v_me) then
      raise exception 'Not a member of this group';
    end if;
  end if;

  return query
  with scoped as (
    select us.*
    from public.user_statistics us
    where
      -- Someone you blocked, or who blocked you, is not in your rankings.
      (v_me is null or us.user_id = v_me or not public.is_blocked_between(v_me, us.user_id))
      and case p_scope
        when 'friends' then
          v_me is not null
          and (us.user_id = v_me or us.user_id in (select public.friend_ids(v_me)))
        when 'group' then
          us.user_id in (select gm.user_id from public.group_members gm where gm.group_id = p_group_id)
        else true
      end
  ),
  valued as (
    select
      s.user_id, s.username, s.display_name, s.avatar_url, s.games_played,
      case p_metric
        when 'highest_score'            then s.highest_score::numeric
        when 'average_score'            then s.average_score
        when 'games_played'             then s.games_played::numeric
        when 'wins'                     then s.wins::numeric
        when 'yahtzee_count'            then s.yahtzee_count::numeric
        when 'first_roll_yahtzee_count' then s.first_roll_yahtzee_count::numeric
      end as value
    from scoped s
    where case
      when p_metric = 'average_score' then s.games_played >= v_min_games
      else true
    end
  ),
  ranked as (
    select
      rank() over (order by v.value desc, v.games_played desc, v.username asc) as rank,
      v.*
    from valued v
    where v.value is not null and v.value > 0
  )
  select
    r.rank,
    r.user_id,
    r.username,
    r.display_name,
    r.avatar_url,
    r.value,
    r.games_played::int,
    (r.user_id = v_me) as is_current_user
  from ranked r
  where r.rank <= v_limit or r.user_id = v_me
  order by r.rank;
end;
$$;

create or replace function public.search_users(p_query text, p_limit integer default 20)
returns table (
  id                uuid,
  username          text,
  display_name      text,
  avatar_url        text,
  games_played      integer,
  friendship_status text,
  friendship_id     uuid,
  is_incoming       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(us.games_played, 0)::int,
    f.status::text,
    f.id,
    (f.addressee_id = auth.uid())
  from public.profiles p
  left join public.user_statistics us on us.user_id = p.id
  left join public.friendships f
    on (f.requester_id = auth.uid() and f.addressee_id = p.id)
    or (f.addressee_id = auth.uid() and f.requester_id = p.id)
  where p.id <> auth.uid()
    and p.onboarding_completed
    and not public.is_blocked_between(auth.uid(), p.id)
    and (
      p.username ilike '%' || btrim(coalesce(p_query, '')) || '%'
      or p.display_name ilike '%' || btrim(coalesce(p_query, '')) || '%'
    )
  order by
    (lower(p.username) = lower(btrim(coalesce(p_query, '')))) desc,
    coalesce(us.games_played, 0) desc,
    p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.add_group_members(p_group_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_count int := 0;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = v_me and role in ('owner', 'admin')
  ) then
    raise exception 'Alleen beheerders kunnen leden toevoegen' using errcode = '42501';
  end if;

  insert into public.group_members (group_id, user_id, role)
  select p_group_id, u, 'member'
  from unnest(coalesce(p_user_ids, array[]::uuid[])) u
  where exists (select 1 from public.profiles pr where pr.id = u)
    -- Nobody is put in a group by someone they blocked, or who blocked them.
    and not public.is_blocked_between(v_me, u)
  on conflict (group_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.send_friend_request(p_user_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_existing public.friendships;
  v_row      public.friendships;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000';
  end if;
  if p_user_id = v_me then
    raise exception 'Je kunt jezelf geen vriendverzoek sturen' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002', hint = 'user_not_found';
  end if;
  -- Blocked either way reads as "not found": telling someone they were
  -- blocked invites them to try another route.
  if public.is_blocked_between(v_me, p_user_id) then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002', hint = 'user_not_found';
  end if;

  select * into v_existing
  from public.friendships
  where (requester_id = v_me and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = v_me);

  if found then
    if v_existing.status = 'accepted' then
      return v_existing;
    end if;
    -- Re-open a pending/declined request from the current user's side.
    update public.friendships
    set requester_id = v_me,
        addressee_id = p_user_id,
        status       = case when v_existing.addressee_id = v_me and v_existing.status = 'pending'
                            then 'accepted'::public.friendship_status
                            else 'pending'::public.friendship_status end
    where id = v_existing.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, p_user_id, 'pending')
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.notify_group_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_group   record;
  v_rank    integer;
  v_members integer;
  v_body    text;
  v_extra   text;
begin
  select display_name into v_name from public.profiles where id = new.user_id;

  for v_group in
    select g.id, g.name, g.emoji
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.user_id = new.user_id
  loop
    -- Where the scorer now stands among everyone in this group who has
    -- ever registered a score.
    select r.position, r.total
    into v_rank, v_members
    from (
      select
        member.user_id,
        rank() over (order by member.best desc) as position,
        count(*) over () as total
      from (
        select gm.user_id, max(se.score) as best
        from public.group_members gm
        join public.score_entries se on se.user_id = gm.user_id
        where gm.group_id = v_group.id
        group by gm.user_id
      ) member
    ) r
    where r.user_id = new.user_id;

    -- Won, Yahtzees — only mentioned when there is something to mention.
    v_extra := '';
    if new.is_win then
      v_extra := v_extra || ' · gewonnen';
    end if;
    if coalesce(new.yahtzee_count, 0) > 0 then
      v_extra := v_extra || ' · ' || new.yahtzee_count || '× Yahtzee';
    end if;

    v_body := coalesce(v_name, 'Iemand') || ' scoorde ' || new.score || ' punten' || v_extra;

    if v_rank is not null then
      v_body := v_body || ' · nu #' || v_rank || ' van ' || v_members;
    end if;

    -- Everyone else in the group. queue_notification drops the ones with
    -- no device registered, so this does not fill the outbox with rows
    -- that could never be delivered.
    perform public.queue_notification(
      gm.user_id,
      'GROUP_SCORE',
      coalesce(v_group.emoji || ' ', '') || v_group.name,
      v_body,
      '/app/groups/' || v_group.id,
      jsonb_build_object(
        'group_id', v_group.id,
        'user_id', new.user_id,
        'score', new.score,
        'is_win', new.is_win,
        'yahtzee_count', coalesce(new.yahtzee_count, 0),
        'rank', v_rank
      )
    )
    from public.group_members gm
    where gm.group_id = v_group.id
      and gm.user_id <> new.user_id
      and not public.is_blocked_between(gm.user_id, new.user_id);
  end loop;

  return null;
end;
$$;

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
  if tg_op = 'UPDATE' and new.score <= old.score then
    return null;
  end if;

  -- Who holds the top score as things stood before this entry. Ties keep
  -- the incumbent: whoever reached the score first holds it.
  select se.user_id, se.score
  into v_prev_user, v_prev_score
  from public.score_entries se
  where se.id <> new.id
  order by se.score desc, se.played_at asc, se.created_at asc
  limit 1;

  if v_prev_user is null or v_prev_user = new.user_id then
    return null;
  end if;

  -- Only an outright pass takes the crown.
  if new.score <= v_prev_score then
    return null;
  end if;

  -- No news from someone you blocked (or who blocked you).
  if public.is_blocked_between(v_prev_user, new.user_id) then
    return null;
  end if;

  -- An edited game that was already on top took nothing from anyone.
  if tg_op = 'UPDATE' and old.score > v_prev_score then
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

-- ---------------------------------------------------------------------
-- 3. One RPC per screen
-- ---------------------------------------------------------------------

-- Friends, requests waiting on me, and requests I sent.
create or replace function public.get_friends_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000', hint = 'not_signed_in';
  end if;

  return (
    with rows as (
      select f.id as friendship_id, f.status, f.addressee_id = v_me as incoming,
             case when f.requester_id = v_me then f.addressee_id else f.requester_id end as other_id
      from public.friendships f
      where (f.requester_id = v_me or f.addressee_id = v_me)
        and f.status in ('pending', 'accepted')
    ),
    people as (
      select r.*, p.username, p.display_name, p.avatar_url,
             coalesce(us.games_played, 0)::int as games_played
      from rows r
      join public.profiles p on p.id = r.other_id
      left join public.user_statistics us on us.user_id = r.other_id
    )
    select jsonb_build_object(
      'friends', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', other_id, 'username', username, 'display_name', display_name,
                 'avatar_url', avatar_url, 'games_played', games_played)
               order by games_played desc, username)
        from people where status = 'accepted'), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', other_id, 'username', username, 'display_name', display_name,
                 'avatar_url', avatar_url, 'games_played', games_played,
                 'friendship_id', friendship_id))
        from people where status = 'pending' and incoming), '[]'::jsonb),
      'sent', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', other_id, 'username', username, 'display_name', display_name,
                 'avatar_url', avatar_url, 'games_played', games_played,
                 'friendship_id', friendship_id))
        from people where status = 'pending' and not incoming), '[]'::jsonb)
    )
  );
end;
$$;

-- A group as its members see it.
create or replace function public.get_group_detail(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_group public.groups;
begin
  if v_me is null then
    raise exception 'Niet ingelogd' using errcode = '28000', hint = 'not_signed_in';
  end if;
  if not public.is_group_member(p_group_id, v_me) then
    raise exception 'Groep niet gevonden' using errcode = 'P0002', hint = 'group_not_found';
  end if;

  select * into v_group from public.groups where id = p_group_id;

  return jsonb_build_object(
    'group', to_jsonb(v_group),
    'is_owner', v_group.owner_id = v_me,
    'my_role', (select role from public.group_members where group_id = p_group_id and user_id = v_me),
    'min_games_for_average_ranking', public.app_setting_int('min_games_for_average_ranking', 5),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', gm.user_id, 'username', p.username, 'display_name', p.display_name,
               'avatar_url', p.avatar_url, 'role', gm.role, 'joined_at', gm.joined_at,
               'games_played', coalesce(us.games_played, 0))
             order by (gm.role = 'owner') desc, coalesce(us.games_played, 0) desc, p.username)
      from public.group_members gm
      join public.profiles p on p.id = gm.user_id
      left join public.user_statistics us on us.user_id = gm.user_id
      where gm.group_id = p_group_id), '[]'::jsonb)
  );
end;
$$;

-- A player's public page. Null when there is no such (onboarded)
-- player, or when they blocked the viewer.
create or replace function public.get_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_profile  public.profiles;
  v_visible  boolean;
  v_friend   public.friendships;
begin
  select * into v_profile from public.profiles
  where username = lower(btrim(coalesce(p_username, ''))) and onboarding_completed;
  if not found then
    return null;
  end if;

  if v_me is not null and exists (
    select 1 from public.user_blocks where blocker_id = v_profile.id and blocked_id = v_me
  ) then
    return null;
  end if;

  v_visible := public.can_view_details(v_profile.id);

  if v_me is not null and v_me <> v_profile.id then
    select * into v_friend from public.friendships
    where (requester_id = v_me and addressee_id = v_profile.id)
       or (requester_id = v_profile.id and addressee_id = v_me);
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id, 'username', v_profile.username,
      'display_name', v_profile.display_name, 'avatar_url', v_profile.avatar_url,
      'bio', case when v_visible then v_profile.bio end,
      'is_private', v_profile.is_private, 'created_at', v_profile.created_at),
    'is_self', v_me = v_profile.id,
    'can_view_details', v_visible,
    'blocked_by_me', v_me is not null and exists (
      select 1 from public.user_blocks where blocker_id = v_me and blocked_id = v_profile.id),
    'friendship', case when v_friend.id is null then null else jsonb_build_object(
      'id', v_friend.id, 'status', v_friend.status,
      'is_incoming', v_friend.addressee_id = v_me) end,
    'friend_count', public.friend_count(v_profile.id),
    'stats', (select to_jsonb(us) from public.user_statistics us where us.user_id = v_profile.id),
    'achievements', case when v_visible then coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object('unlocked_at', ua.unlocked_at)
                       order by a.sort_order)
      from public.achievements a
      left join public.user_achievements ua
        on ua.achievement_id = a.id and ua.user_id = v_profile.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'recent_scores', case when v_visible then coalesce((
      select jsonb_agg(to_jsonb(s) order by s.played_at desc)
      from (
        select se.id, se.user_id, se.score, se.is_win, se.played_at, se.created_at
        from public.score_entries se
        where se.user_id = v_profile.id
        order by se.played_at desc
        limit 10
      ) s), '[]'::jsonb)
      else '[]'::jsonb end
  );
end;
$$;

grant execute on function public.get_friends_overview() to authenticated;
grant execute on function public.get_group_detail(uuid) to authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. What an app needs to know at launch
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('min_ios_build', '0'::jsonb,
   'Laagste iOS-buildnummer dat nog met deze server mag praten (0 = geen minimum)')
on conflict (key) do nothing;

create or replace function public.get_client_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- Raised only when an existing RPC changes in a way an installed
    -- app cannot follow. Additive changes keep it where it is.
    'api_version', 1,
    'server_time', now(),
    'settings', coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  )
  from public.app_settings;
$$;

grant execute on function public.get_client_config() to anon, authenticated;

notify pgrst, 'reload schema';
