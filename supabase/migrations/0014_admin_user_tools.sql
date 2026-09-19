-- =====================================================================
-- Snatzee — admin user tools
--
-- One user list for every admin screen, and a way to clear a player's
-- achievements when they have gone wrong.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The user picker behind both the notification composer and the
-- achievement reset.
--
-- Replaces admin_list_notifiable_users, which only carried the push flag
-- and was named for the one screen that used it.
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_notifiable_users(text);

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
         exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id),
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

-- ---------------------------------------------------------------------
-- Clear one player's achievements.
--
-- This removes the unlock records only; it does not touch their scores.
-- Because every achievement is derived from the data rather than logged,
-- the ones they still qualify for come back the next time anything
-- re-evaluates them — which is the point: it is a way to clear a bad
-- unlock, not a punishment that sticks.
--
-- Returns how many rows were removed.
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_user_achievements(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_names   text[];
  v_count   integer;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Geen speler gekozen';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Speler bestaat niet';
  end if;

  -- Captured before the delete so the audit entry can name them.
  select coalesce(array_agg(a.name order by a.name), array[]::text[])
  into v_names
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
  where ua.user_id = p_user_id;

  delete from public.user_achievements where user_id = p_user_id;
  get diagnostics v_count = row_count;

  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (
    v_me, 'RESET_ACHIEVEMENTS', p_user_id, 'user_achievements', p_user_id,
    jsonb_build_object('removed', v_count, 'achievements', to_jsonb(v_names))
  );

  return v_count;
end;
$$;

grant execute on function public.admin_list_users(text) to authenticated;
grant execute on function public.admin_reset_user_achievements(uuid) to authenticated;

notify pgrst, 'reload schema';
