set client_min_messages = warning;
-- =====================================================================
-- What a signed-in (or signed-out) client may and may not do.
--
-- Each block switches to an API role the way PostgREST does — the JWT
-- claims as a setting, then SET ROLE — and rolls back afterwards.
-- =====================================================================

create schema if not exists test;
grant usage on schema test to anon, authenticated;

create or replace function test.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

-- Runs a statement and fails the test unless it is refused.
create or replace function test.denied(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAIL: % was allowed', p_label;
end $$;

create or replace function test.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: %', p_label;
  end if;
end $$;

grant execute on all functions in schema test to anon, authenticated;

-- Three players; Alice is private and has a device registered.
insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-00000000000a', 'alice@test.nl', '{"username":"alice"}'),
  ('10000000-0000-0000-0000-00000000000b', 'bob@test.nl',   '{"username":"bob_1"}'),
  ('10000000-0000-0000-0000-00000000000c', 'carol@test.nl', '{"username":"bobx1"}')
on conflict do nothing;
update public.profiles set onboarding_completed = true
where id in ('10000000-0000-0000-0000-00000000000a',
             '10000000-0000-0000-0000-00000000000b',
             '10000000-0000-0000-0000-00000000000c');
update public.profiles set is_private = true where id = '10000000-0000-0000-0000-00000000000a';
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('10000000-0000-0000-0000-00000000000a', 'https://push.test/a', 'k', 'a')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Writes that must go through an RPC
-- ---------------------------------------------------------------------
begin;
select test.login('10000000-0000-0000-0000-00000000000b');
set local role authenticated;

select test.denied($$
  insert into public.friendships (requester_id, addressee_id, status)
  values ('10000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000a', 'accepted')
$$, 'inserting an accepted friendship');

select test.denied($$
  insert into public.score_entries (user_id, score)
  values ('10000000-0000-0000-0000-00000000000b', 1500)
$$, 'inserting a score directly');

select test.denied($$
  update public.score_entries set score = 1500
  where user_id = '10000000-0000-0000-0000-00000000000b'
$$, 'updating a score directly');

select test.denied($$
  insert into public.yahtzee_events (user_id, event_type)
  values ('10000000-0000-0000-0000-00000000000b', 'FIRST_ROLL')
$$, 'inserting a first-roll Yahtzee directly');

select test.denied($$
  insert into public.profiles (id, username, display_name)
  values (gen_random_uuid(), 'sneaky', 'Sneaky')
$$, 'inserting a profile');

select test.denied($$
  insert into public.groups (owner_id, name)
  values ('10000000-0000-0000-0000-00000000000b', 'Sneaky')
$$, 'inserting a group directly');

select test.denied($$
  select public.queue_notification('10000000-0000-0000-0000-00000000000a',
    'ADMIN_BROADCAST', 'Hi', 'Spam')
$$, 'queueing a notification for someone else');

select test.denied($$
  select * from public.claim_notifications(10)
$$, 'claiming the notification queue');

select test.denied($$
  update public.profiles set role = 'superadmin'
  where id = '10000000-0000-0000-0000-00000000000b'
$$, 'promoting yourself');
rollback;

-- Joining a group without its invite code.
begin;
select test.login('10000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.create_group('Familie');
reset role;
select test.login('10000000-0000-0000-0000-00000000000b');
set local role authenticated;
select test.denied(format($$
  insert into public.group_members (group_id, user_id, role)
  values (%L, '10000000-0000-0000-0000-00000000000b', 'owner')
$$, (select id from public.groups where name = 'Familie')), 'joining a group as owner');
rollback;

-- Signed out.
begin;
set local role anon;
select test.denied($$
  select public.queue_notification('10000000-0000-0000-0000-00000000000a',
    'ADMIN_BROADCAST', 'Hi', 'Spam')
$$, 'queueing a notification while signed out');
rollback;

-- ---------------------------------------------------------------------
-- The legitimate paths still work
-- ---------------------------------------------------------------------
begin;
select test.login('10000000-0000-0000-0000-00000000000a');
set local role authenticated;

-- Box 50, three Yahtzees: 345 on the sheet plus 200 bonus.
select test.check(
  (public.record_score_entry(
     p_score => 545, p_yahtzee_count => 3,
     p_sheet => '[5,10,15,20,25,30,20,20,25,30,40,50,20]'::jsonb
   ) -> 'entry' ->> 'score')::int = 545,
  'recording a game with the Yahtzee bonus');

select test.check(
  (select count(*) from public.score_entries) = 1,
  'the new game is readable by its owner');

reset role;
select test.login('10000000-0000-0000-0000-00000000000b');
set local role authenticated;

-- Private: Bob sees Alice in the rankings, not her games or badges.
select test.check(
  (select count(*) from public.public_score_entries
   where user_id = '10000000-0000-0000-0000-00000000000a') = 0,
  'a stranger cannot read a private player''s games');
select test.check(
  (select count(*) from public.user_achievements
   where user_id = '10000000-0000-0000-0000-00000000000a') = 0,
  'a stranger cannot read a private player''s achievements');
select test.check(
  exists (select 1 from public.get_leaderboard() where username = 'alice'),
  'a private player still appears in the rankings');

select public.send_friend_request('10000000-0000-0000-0000-00000000000a');

reset role;
select test.login('10000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.respond_friend_request(
  (select id from public.friendships
   where requester_id = '10000000-0000-0000-0000-00000000000b'), true);

reset role;
select test.login('10000000-0000-0000-0000-00000000000b');
set local role authenticated;
select test.check(
  (select count(*) from public.public_score_entries
   where user_id = '10000000-0000-0000-0000-00000000000a') = 1,
  'a friend can read a private player''s games');
rollback;

-- A score that leaves out the bonus is refused.
begin;
select test.login('10000000-0000-0000-0000-00000000000a');
set local role authenticated;
do $$ begin
  perform public.record_score_entry(
    p_score => 345, p_yahtzee_count => 3,
    p_sheet => '[5,10,15,20,25,30,20,20,25,30,40,50,20]'::jsonb);
  raise exception 'FAIL: a score without the Yahtzee bonus was accepted';
exception when sqlstate '22023' then null;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Usernames: exact, case-insensitive, `_` is not a wildcard
-- ---------------------------------------------------------------------
select test.check(
  (select count(*) from public.profiles where username = lower('BOB_1')) = 1,
  'the username lookup the app uses finds exactly one player');

-- ---------------------------------------------------------------------
-- The migration ledger
-- ---------------------------------------------------------------------
select test.check(
  (select count(*) from snatzee_meta.schema_migrations) > 0,
  'applied migrations are recorded');

drop schema test cascade;
delete from auth.users where email like '%@test.nl';
