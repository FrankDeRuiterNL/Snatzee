-- =====================================================================
-- Snatzee — friend count on a profile
--
-- friendships are only visible to the two people in them, so counting
-- someone else's friends from the client returns zero. This is the way
-- round that, and it deliberately returns only a number: who those
-- friends are stays private.
-- =====================================================================

create or replace function public.friend_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.friendships
  where status = 'accepted'
    and (requester_id = p_user or addressee_id = p_user);
$$;

-- anon as well: public profiles are readable without an account.
grant execute on function public.friend_count(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
