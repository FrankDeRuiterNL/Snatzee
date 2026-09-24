-- =====================================================================
-- Snatzee — "your friend request was accepted"
--
-- The person who sent the request hears nothing today: they see it only
-- by opening the app and noticing the Verzonden list got shorter.
-- =====================================================================

-- Own statement on purpose: ALTER TYPE ... ADD VALUE commits by itself
-- under psql's autocommit, which is what lets the function below use the
-- new label in the same file. Do not wrap this migration in an explicit
-- transaction.
alter type public.notification_kind add value if not exists 'FRIEND_ACCEPTED';

-- ---------------------------------------------------------------------
-- Fires when a pending request becomes accepted.
--
-- Only that transition: a decline notifies nobody, because telling
-- someone they were turned down helps no one, and re-saving an already
-- accepted row must not send it twice.
-- ---------------------------------------------------------------------
create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_username text;
begin
  if old.status = 'accepted' or new.status <> 'accepted' then
    return null;
  end if;

  -- The accepter is the addressee; the requester is the one to tell.
  select display_name, username
  into v_name, v_username
  from public.profiles
  where id = new.addressee_id;

  perform public.queue_notification(
    new.requester_id,
    'FRIEND_ACCEPTED',
    'Je bent nu vrienden 🎉',
    coalesce(v_name, 'Iemand') || ' heeft je vriendschapsverzoek geaccepteerd.',
    case when v_username is null then '/app/friends' else '/u/' || v_username end,
    jsonb_build_object('user_id', new.addressee_id)
  );

  return null;
end;
$$;

drop trigger if exists friendships_notify_accepted on public.friendships;
create trigger friendships_notify_accepted
  after update of status on public.friendships
  for each row execute function public.notify_friend_accepted();

notify pgrst, 'reload schema';
