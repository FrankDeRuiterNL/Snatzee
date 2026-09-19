-- =====================================================================
-- Snatzee — group administration
--
-- Groups are only visible to their own members under RLS, so a superadmin
-- needs a way in that does not involve joining every group. Same shape as
-- the score console: one paginated list, one delete, both audited.
-- =====================================================================

create or replace function public.admin_list_groups(
  p_search text default null,
  p_sort   text default 'newest',
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  id            uuid,
  name          text,
  emoji         text,
  description   text,
  invite_code   text,
  owner_id      uuid,
  owner_name    text,
  owner_username text,
  member_count  integer,
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
  if coalesce(p_sort, 'newest') not in ('newest', 'oldest', 'largest', 'smallest') then
    raise exception 'Onbekende sortering: %', p_sort using errcode = '22023';
  end if;

  return query
  with matched as (
    select
      g.id, g.name, g.emoji, g.description, g.invite_code,
      g.owner_id, o.display_name as owner_name, o.username as owner_username,
      (select count(*)::integer from public.group_members gm where gm.group_id = g.id)
        as member_count,
      g.created_at,
      count(*) over () as total_count
    from public.groups g
    left join public.profiles o on o.id = g.owner_id
    where v_search is null
       or g.name ilike '%' || v_search || '%'
       or g.invite_code ilike '%' || v_search || '%'
       or o.username ilike '%' || v_search || '%'
       or o.display_name ilike '%' || v_search || '%'
  )
  select *
  from matched m
  order by
    case when p_sort = 'newest'   then m.created_at end desc nulls last,
    case when p_sort = 'oldest'   then m.created_at end asc  nulls last,
    case when p_sort = 'largest'  then m.member_count end desc nulls last,
    case when p_sort = 'smallest' then m.member_count end asc  nulls last,
    m.created_at desc
  limit v_limit offset v_offset;
end;
$$;

-- ---------------------------------------------------------------------
-- Delete a group.
--
-- group_members cascades, and that cascade fires the per-row trigger that
-- re-evaluates achievements — so a member who only qualified for a
-- "joined N groups" badge through this group loses it here, without this
-- function having to know anything about achievements.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_group(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_row     public.groups;
  v_members integer;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  select * into v_row from public.groups where id = p_id;
  if not found then
    return false;
  end if;

  select count(*) into v_members from public.group_members where group_id = p_id;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'DELETE_GROUP', v_row.owner_id, 'group', v_row.id,
    jsonb_build_object(
      'name', v_row.name,
      'invite_code', v_row.invite_code,
      'members', v_members,
      'created_at', v_row.created_at
    )
  );

  delete from public.groups where id = p_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Groups join the tab counters.
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
    'players',            (select count(*) from public.profiles where onboarding_completed),
    'groups',             (select count(*) from public.groups)
  );
end;
$$;

grant execute on function public.admin_list_groups(text, text, integer, integer) to authenticated;
grant execute on function public.admin_delete_group(uuid) to authenticated;

notify pgrst, 'reload schema';
