set client_min_messages = warning;
-- =====================================================================
-- APNs devices, blocking, reporting and the per-screen RPCs.
-- =====================================================================

create schema if not exists test;
grant usage on schema test to anon, authenticated;

create or replace function test.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-0000-0000-00000000000a', 'ann@test.nl',  '{"username":"ann"}'),
  ('20000000-0000-0000-0000-00000000000b', 'ben@test.nl',  '{"username":"ben"}'),
  ('20000000-0000-0000-0000-00000000000c', 'cas@test.nl',  '{"username":"cas"}')
on conflict do nothing;
update public.profiles set onboarding_completed = true
where id::text like '20000000-%';

-- ---------------------------------------------------------------------
-- APNs devices
-- ---------------------------------------------------------------------
begin;
select test.login('20000000-0000-0000-0000-00000000000a');
set local role authenticated;

select public.register_apns_device(repeat('ab', 32), 'sandbox', 'nl.snatzee.app', '1.0 (1)');
select test.check((select count(*) from public.apns_devices) = 1, 'a device is registered');
select test.check(public.has_push_subscription(), 'an APNs device counts as able to receive');
select test.denied($$
  insert into public.apns_devices (user_id, token)
  values ('20000000-0000-0000-0000-00000000000a', repeat('cd', 32))
$$, 'inserting a device directly');
select test.denied($$ select public.has_push_device('20000000-0000-0000-0000-00000000000b') $$,
  'asking whether someone else has a device');

do $$ begin
  perform public.register_apns_device('not-a-token');
  raise exception 'FAIL: a malformed token was accepted';
exception when sqlstate '22023' then null;
end $$;

-- Ben's friend request now queues a notification for Ann's phone.
reset role;
select test.login('20000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.send_friend_request('20000000-0000-0000-0000-00000000000a');
reset role;
select test.check(
  exists (select 1 from public.notification_outbox
          where user_id = '20000000-0000-0000-0000-00000000000a' and kind = 'FRIEND_REQUEST'),
  'a notification is queued for an iOS-only user');
rollback;

-- ---------------------------------------------------------------------
-- Blocking
-- ---------------------------------------------------------------------
begin;
select test.login('20000000-0000-0000-0000-00000000000b');
set local role authenticated;
select public.send_friend_request('20000000-0000-0000-0000-00000000000a');

reset role;
select test.login('20000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.record_score_entry(p_score => 250);
select public.block_user('20000000-0000-0000-0000-00000000000b');

select test.check(
  (select count(*) from public.friendships) = 0, 'blocking removes the pending request');
select test.check(
  (select count(*) from public.list_blocked_users()) = 1, 'the block is listed for the blocker');

reset role;
select test.login('20000000-0000-0000-0000-00000000000b');
set local role authenticated;

select test.check(
  (select count(*) from public.user_blocks) = 0, 'nobody can see who blocked them');
select test.check(
  not exists (select 1 from public.search_users('ann')), 'a blocker is not found in search');
select test.check(
  not exists (select 1 from public.get_leaderboard() where username = 'ann'),
  'a blocker is not in the rankings');
select test.check(
  public.get_public_profile('ann') is null, 'a blocker''s profile reads as not found');
select test.check(
  (select count(*) from public.public_score_entries
   where user_id = '20000000-0000-0000-0000-00000000000a') = 0,
  'a blocker''s games are hidden');
do $$ begin
  perform public.send_friend_request('20000000-0000-0000-0000-00000000000a');
  raise exception 'FAIL: a blocked player could send a friend request';
exception when sqlstate 'P0002' then null;
end $$;

reset role;
select test.login('20000000-0000-0000-0000-00000000000a');
set local role authenticated;
select test.check(
  (public.get_public_profile('ben') ->> 'blocked_by_me')::boolean,
  'the blocker sees that they blocked someone');
select public.unblock_user('20000000-0000-0000-0000-00000000000b');
select test.check(
  (select count(*) from public.list_blocked_users()) = 0, 'unblocking lifts the block');
rollback;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
begin;
select test.login('20000000-0000-0000-0000-00000000000c');
set local role authenticated;
select public.report_content('OFFENSIVE_NAME', '20000000-0000-0000-0000-00000000000a', null, 'Naam');
select test.denied($$ select * from public.content_reports $$, 'reading reports directly');
select test.denied($$ select * from public.admin_list_reports() $$, 'listing reports as a player');
do $$ begin
  perform public.report_content('SPAM', '20000000-0000-0000-0000-00000000000c');
  raise exception 'FAIL: reporting yourself was accepted';
exception when sqlstate '22023' then null;
end $$;
rollback;

-- ---------------------------------------------------------------------
-- Per-screen RPCs
-- ---------------------------------------------------------------------
begin;
select test.login('20000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.create_group('Club');
select test.check(
  jsonb_array_length(public.get_group_detail((select id from public.groups where name = 'Club')) -> 'members') = 1,
  'the group detail lists its members');
select public.send_friend_request('20000000-0000-0000-0000-00000000000b');
select test.check(
  jsonb_array_length(public.get_friends_overview() -> 'sent') = 1,
  'the friends overview shows a sent request');

reset role;
select set_config('test.club', (select id::text from public.groups where name = 'Club'), true);
select test.login('20000000-0000-0000-0000-00000000000c');
set local role authenticated;
select test.check(
  (select count(*) from public.groups where name = 'Club') = 0,
  'a group stays invisible to non-members');
do $$ begin
  perform public.get_group_detail(current_setting('test.club')::uuid);
  raise exception 'FAIL: a non-member could open a group';
exception when sqlstate 'P0002' then null;
end $$;

reset role;
set local role anon;
select test.check(
  public.get_public_profile('ann') ->> 'is_self' = 'false',
  'a signed-out visitor can open a public profile');
select test.check(
  (public.get_client_config() -> 'settings' ->> 'min_ios_build') = '0',
  'the client config carries the minimum iOS build');
rollback;

drop schema test cascade;
delete from auth.users where email like '%@test.nl';
