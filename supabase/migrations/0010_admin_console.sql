-- =====================================================================
-- Snatzee — super admin console
--
-- Everything here is SECURITY DEFINER and checks is_superadmin() before
-- returning a single row. The admin page is a convenience; this is the
-- actual boundary, so opening /app/admin by hand gets a normal user
-- nothing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Audit trail for destructive actions
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_user_id  uuid references public.profiles (id) on delete set null,
  action         text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  entity_type    text not null,
  entity_id      uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_admin_idx on public.admin_audit_log (admin_user_id);

-- No policies at all: not even a superadmin reads this through PostgREST.
-- The functions below are the only way in or out.
alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- Totals for the tab headers
-- ---------------------------------------------------------------------
create or replace function public.admin_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'score_entries',      (select count(*) from public.score_entries),
    'first_roll_yahtzees',(select count(*) from public.yahtzee_events where event_type = 'FIRST_ROLL'),
    'players',            (select count(*) from public.profiles where onboarding_completed)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Score entries, paginated and searchable.
-- total_count rides along so the client never fetches everything to
-- work out how many pages there are.
-- ---------------------------------------------------------------------
create or replace function public.admin_list_score_entries(
  p_search text default null,
  p_sort   text default 'newest',
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id            uuid,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  score         integer,
  is_win        boolean,
  yahtzee_count integer,
  note          text,
  played_at     timestamptz,
  created_at    timestamptz,
  total_count   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;
  if coalesce(p_sort, 'newest') not in ('newest', 'oldest', 'highest', 'lowest') then
    raise exception 'Onbekende sortering: %', p_sort using errcode = '22023';
  end if;

  return query
  with matched as (
    select
      se.id, se.user_id, p.username, p.display_name, p.avatar_url,
      se.score, se.is_win, se.yahtzee_count, se.note, se.played_at, se.created_at,
      count(*) over () as total_count
    from public.score_entries se
    join public.profiles p on p.id = se.user_id
    where v_search is null
       or p.username ilike '%' || v_search || '%'
       or p.display_name ilike '%' || v_search || '%'
  )
  select *
  from matched m
  order by
    case when p_sort = 'newest'  then m.played_at end desc nulls last,
    case when p_sort = 'oldest'  then m.played_at end asc  nulls last,
    case when p_sort = 'highest' then m.score end desc     nulls last,
    case when p_sort = 'lowest'  then m.score end asc      nulls last,
    m.created_at desc
  limit v_limit offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------
-- First-roll Yahtzee registrations, paginated and searchable
-- ---------------------------------------------------------------------
create or replace function public.admin_list_first_roll_yahtzees(
  p_search text default null,
  p_sort   text default 'newest',
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id           uuid,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz,
  total_count  bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  return query
  with matched as (
    select
      ye.id, ye.user_id, p.username, p.display_name, p.avatar_url, ye.created_at,
      count(*) over () as total_count
    from public.yahtzee_events ye
    join public.profiles p on p.id = ye.user_id
    where ye.event_type = 'FIRST_ROLL'
      and (v_search is null
        or p.username ilike '%' || v_search || '%'
        or p.display_name ilike '%' || v_search || '%')
  )
  select *
  from matched m
  order by
    case when coalesce(p_sort, 'newest') = 'oldest' then m.created_at end asc nulls last,
    m.created_at desc
  limit v_limit offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------
-- Deletions. Both write an audit row before the data disappears, so the
-- metadata can still be read off the row being removed.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_score_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.score_entries;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select * into v_row from public.score_entries where id = p_id;
  if not found then
    return false;
  end if;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'DELETE_SCORE', v_row.user_id, 'score_entry', v_row.id,
    jsonb_build_object(
      'score', v_row.score,
      'is_win', v_row.is_win,
      'yahtzee_count', v_row.yahtzee_count,
      'played_at', v_row.played_at
    )
  );

  delete from public.score_entries where id = p_id;
  return true;
end;
$$;

create or replace function public.admin_delete_first_roll_yahtzee(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.yahtzee_events;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select * into v_row from public.yahtzee_events
  where id = p_id and event_type = 'FIRST_ROLL';
  if not found then
    return false;
  end if;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'DELETE_FIRST_ROLL_YAHTZEE', v_row.user_id, 'yahtzee_event', v_row.id,
    jsonb_build_object('created_at', v_row.created_at)
  );

  delete from public.yahtzee_events where id = p_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Reading the trail back
-- ---------------------------------------------------------------------
create or replace function public.admin_list_audit_log(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id             uuid,
  admin_username text,
  action         text,
  target_username text,
  entity_type    text,
  entity_id      uuid,
  metadata       jsonb,
  created_at     timestamptz,
  total_count    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    admin_p.username,
    l.action,
    target_p.username,
    l.entity_type,
    l.entity_id,
    l.metadata,
    l.created_at,
    count(*) over () as total_count
  from public.admin_audit_log l
  left join public.profiles admin_p on admin_p.id = l.admin_user_id
  left join public.profiles target_p on target_p.id = l.target_user_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.admin_counts() to authenticated;
grant execute on function public.admin_list_score_entries(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_first_roll_yahtzees(text, text, integer, integer) to authenticated;
grant execute on function public.admin_delete_score_entry(uuid) to authenticated;
grant execute on function public.admin_delete_first_roll_yahtzee(uuid) to authenticated;
grant execute on function public.admin_list_audit_log(integer, integer) to authenticated;
