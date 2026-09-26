set client_min_messages = warning;
-- =====================================================================
-- A superadmin deleting a player's account.
-- =====================================================================

create schema if not exists test;
grant usage on schema test to anon, authenticated;

create or replace function test.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create or replace function test.check(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: %', p_label;
  end if;
end $$;

-- Runs p_sql and expects it to fail with the given hint.
create or replace function test.refused(p_sql text, p_hint text, p_label text) returns void
language plpgsql as $$
declare
  v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint is distinct from p_hint then
      raise exception 'FAIL: % refused with hint %, expected %', p_label, v_hint, p_hint;
    end if;
    return;
  end;
  raise exception 'FAIL: % was allowed', p_label;
end $$;

grant execute on all functions in schema test to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-00000000000a', 'owner@test.nl',  '{"username":"owner"}'),
  ('30000000-0000-0000-0000-00000000000b', 'boss2@test.nl',  '{"username":"boss2"}'),
  ('30000000-0000-0000-0000-00000000000c', 'player@test.nl', '{"username":"player"}'),
  ('30000000-0000-0000-0000-00000000000d', 'halfway@test.nl', '{"username":"halfway"}')
on conflict do nothing;
update public.profiles set onboarding_completed = true
where id in ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b',
             '30000000-0000-0000-0000-00000000000c');

-- Roles are guarded by a trigger; open the same escape hatch that
-- set_user_role() and the allowlist back-fill use.
do $$
begin
  perform set_config('snatzee.allow_role_change', 'on', true);
  update public.profiles set role = 'superadmin'
  where id in ('30000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b');
  perform set_config('snatzee.allow_role_change', 'off', true);
end $$;

begin;

insert into public.score_entries (user_id, score, is_win, played_at)
values ('30000000-0000-0000-0000-00000000000c', 210, true, now());

-- A normal player cannot delete anyone.
select test.login('30000000-0000-0000-0000-00000000000c');
set local role authenticated;
select test.refused($$ select public.admin_delete_user('30000000-0000-0000-0000-00000000000d') $$,
  'forbidden', 'a player deleting an account');
select test.refused($$ select * from public.admin_list_users() $$,
  'forbidden', 'a player listing users');
reset role;

select test.login('30000000-0000-0000-0000-00000000000a');
set local role authenticated;

-- The list shows roles and games, and half-registered accounts on request.
select test.check(
  (select games_played from public.admin_list_users('player')) = 1,
  'the user list counts games');
select test.check(
  not exists (select 1 from public.admin_list_users('halfway')),
  'half-registered accounts are hidden by default');
select test.check(
  exists (select 1 from public.admin_list_users('halfway', true)),
  'half-registered accounts are listed on request');

select test.refused($$ select public.admin_delete_user('30000000-0000-0000-0000-00000000000a') $$,
  'self', 'deleting yourself');
select test.refused($$ select public.admin_delete_user('30000000-0000-0000-0000-00000000000b') $$,
  'superadmin', 'deleting another superadmin');
select test.refused($$ select public.admin_delete_user('30000000-0000-0000-0000-0000000000ff') $$,
  'not_found', 'deleting an account that does not exist');

select test.check(
  (public.admin_delete_user('30000000-0000-0000-0000-00000000000c', 'Spam'))->>'username' = 'player',
  'a superadmin deletes a player');
reset role;

select test.check(
  not exists (select 1 from auth.users where id = '30000000-0000-0000-0000-00000000000c'),
  'the auth user is gone');
select test.check(
  not exists (select 1 from public.profiles where id = '30000000-0000-0000-0000-00000000000c'),
  'the profile is gone');
select test.check(
  not exists (select 1 from public.score_entries where user_id = '30000000-0000-0000-0000-00000000000c'),
  'their games are gone');
select test.check(
  exists (select 1 from public.admin_audit_log
          where action = 'DELETE_USER' and metadata->>'username' = 'player'
            and metadata->>'reason' = 'Spam' and target_user_id is null),
  'the audit log keeps who it was and why');

-- Half-registered accounts can be deleted too.
select test.login('30000000-0000-0000-0000-00000000000a');
set local role authenticated;
select public.admin_delete_user('30000000-0000-0000-0000-00000000000d');
reset role;
select test.check(
  not exists (select 1 from auth.users where id = '30000000-0000-0000-0000-00000000000d'),
  'a half-registered account is deleted');

rollback;
