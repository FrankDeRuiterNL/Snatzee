-- =====================================================================
-- Snatzee — a superadmin can delete a player's account
--
-- Until now only the player could remove their own account. A superadmin
-- needs the same for accounts that break the rules or were made by
-- mistake. The delete goes through auth.users, so every row that belongs
-- to the player follows through the existing cascades; the avatar files in
-- storage are removed by /api/admin/users/delete, which calls this.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The admin user list learns each player's role, game count and whether
-- onboarding was finished, and can include half-registered accounts —
-- exactly the ones an admin may want to clean up.
-- ---------------------------------------------------------------------
drop function if exists public.admin_list_users(text);

create or replace function public.admin_list_users(
  p_search             text    default null,
  p_include_incomplete boolean default false
)
returns table (
  user_id              uuid,
  username             text,
  display_name         text,
  avatar_url           text,
  has_push             boolean,
  achievement_count    integer,
  role                 public.app_role,
  games_played         integer,
  onboarding_completed boolean
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
    raise exception 'Geen toegang' using errcode = '42501', hint = 'forbidden';
  end if;

  return query
  select p.id,
         p.username,
         p.display_name,
         p.avatar_url,
         exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
           or exists (select 1 from public.apns_devices ad where ad.user_id = p.id),
         (select count(*)::integer from public.user_achievements ua where ua.user_id = p.id),
         p.role,
         (select count(*)::integer from public.score_entries se where se.user_id = p.id),
         p.onboarding_completed
  from public.profiles p
  where (p.onboarding_completed or p_include_incomplete)
    and (
      v_q is null
      or p.username ilike '%' || v_q || '%'
      or p.display_name ilike '%' || v_q || '%'
    )
  order by p.display_name, p.username;
end;
$$;

-- ---------------------------------------------------------------------
-- Delete one account.
--
-- Not yourself (that is Account verwijderen in Instellingen) and not
-- another superadmin (demote first, so two owners cannot remove each
-- other with one tap). The audit entry keeps the name and the numbers,
-- since the profile it points at is gone a moment later.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_profile public.profiles;
  v_games   integer;
  v_summary jsonb;
begin
  if not public.is_superadmin() then
    raise exception 'Geen toegang' using errcode = '42501', hint = 'forbidden';
  end if;

  if p_user_id is null then
    raise exception 'Geen speler gekozen' using hint = 'invalid';
  end if;

  if p_user_id = v_me then
    raise exception 'Je eigen account verwijder je via Instellingen → Account verwijderen'
      using hint = 'self';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Speler bestaat niet' using errcode = 'P0002', hint = 'not_found';
  end if;

  if v_profile.role = 'superadmin' then
    raise exception 'Een superadmin kun je niet verwijderen. Geef eerst een andere rol.'
      using hint = 'superadmin';
  end if;

  select count(*)::integer into v_games from public.score_entries where user_id = p_user_id;

  v_summary := jsonb_build_object(
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'role', v_profile.role,
    'games_played', v_games,
    'created_at', v_profile.created_at,
    'reason', nullif(btrim(coalesce(p_reason, '')), '')
  );

  -- Logged first: target_user_id is set to null by the cascade, the
  -- metadata keeps who it was.
  insert into public.admin_audit_log
    (admin_user_id, action, target_user_id, entity_type, entity_id, metadata)
  values (v_me, 'DELETE_USER', p_user_id, 'user', p_user_id, v_summary);

  delete from auth.users where id = p_user_id;

  return v_summary;
end;
$$;

revoke all on function public.admin_list_users(text, boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_list_users(text, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';
