-- =====================================================================
-- Snatzee — Row Level Security
-- =====================================================================

alter table public.profiles          enable row level security;
alter table public.score_entries     enable row level security;
alter table public.yahtzee_events    enable row level security;
alter table public.friendships       enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;
alter table public.app_settings      enable row level security;

-- The aggregate views intentionally run with the owner's rights so public
-- statistics stay readable without exposing individual rows.
alter view public.user_statistics      set (security_invoker = off);
alter view public.public_score_entries set (security_invoker = off);

-- ---------------------------------------------------------------------
-- profiles — public read, owner write
-- ---------------------------------------------------------------------
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- score_entries — strictly owner-scoped.
-- Other people see aggregates through public.user_statistics and
-- individual results (without notes) through public.public_score_entries.
-- ---------------------------------------------------------------------
drop policy if exists "score_entries_select_own" on public.score_entries;
create policy "score_entries_select_own" on public.score_entries
  for select using (user_id = (select auth.uid()));

drop policy if exists "score_entries_insert_own" on public.score_entries;
create policy "score_entries_insert_own" on public.score_entries
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "score_entries_update_own" on public.score_entries;
create policy "score_entries_update_own" on public.score_entries
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "score_entries_delete_own" on public.score_entries;
create policy "score_entries_delete_own" on public.score_entries
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- yahtzee_events — owner-scoped, immutable once written
-- ---------------------------------------------------------------------
drop policy if exists "yahtzee_events_select_own" on public.yahtzee_events;
create policy "yahtzee_events_select_own" on public.yahtzee_events
  for select using (user_id = (select auth.uid()));

drop policy if exists "yahtzee_events_insert_own" on public.yahtzee_events;
create policy "yahtzee_events_insert_own" on public.yahtzee_events
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "yahtzee_events_delete_own" on public.yahtzee_events;
create policy "yahtzee_events_delete_own" on public.yahtzee_events
  for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- friendships — visible to both sides only
-- ---------------------------------------------------------------------
drop policy if exists "friendships_select_involved" on public.friendships;
create policy "friendships_select_involved" on public.friendships
  for select using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

drop policy if exists "friendships_insert_as_requester" on public.friendships;
create policy "friendships_insert_as_requester" on public.friendships
  for insert with check (requester_id = (select auth.uid()));

-- Only the addressee may change the status of a pending request.
drop policy if exists "friendships_update_as_addressee" on public.friendships;
create policy "friendships_update_as_addressee" on public.friendships
  for update using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));

drop policy if exists "friendships_delete_involved" on public.friendships;
create policy "friendships_delete_involved" on public.friendships
  for delete using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- groups / group_members
-- is_group_member() is SECURITY DEFINER, which keeps these policies free
-- of recursive RLS evaluation.
-- ---------------------------------------------------------------------
drop policy if exists "groups_select_members" on public.groups;
create policy "groups_select_members" on public.groups
  for select using (
    owner_id = (select auth.uid())
    or public.is_group_member(id, (select auth.uid()))
  );

drop policy if exists "groups_insert_own" on public.groups;
create policy "groups_insert_own" on public.groups
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner" on public.groups
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner" on public.groups
  for delete using (owner_id = (select auth.uid()));

drop policy if exists "group_members_select_members" on public.group_members;
create policy "group_members_select_members" on public.group_members
  for select using (
    user_id = (select auth.uid())
    or public.is_group_member(group_id, (select auth.uid()))
  );

drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self" on public.group_members
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "group_members_delete_self_or_owner" on public.group_members;
create policy "group_members_delete_self_or_owner" on public.group_members
  for delete using (
    user_id = (select auth.uid())
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- achievements — read-only catalogue
-- ---------------------------------------------------------------------
drop policy if exists "achievements_select_all" on public.achievements;
create policy "achievements_select_all" on public.achievements
  for select using (true);

-- Unlocks are public (shown on profiles) but can never be written by a
-- client: no insert/update/delete policy exists, so only the SECURITY
-- DEFINER achievement engine can create them.
drop policy if exists "user_achievements_select_all" on public.user_achievements;
create policy "user_achievements_select_all" on public.user_achievements
  for select using (true);

-- ---------------------------------------------------------------------
-- app_settings — readable, never client-writable
-- ---------------------------------------------------------------------
drop policy if exists "app_settings_select_all" on public.app_settings;
create policy "app_settings_select_all" on public.app_settings
  for select using (true);

-- ---------------------------------------------------------------------
-- Baseline grants (RLS still decides row visibility)
-- ---------------------------------------------------------------------
grant select on public.profiles, public.achievements, public.user_achievements, public.app_settings
  to anon, authenticated;
grant select, insert, update, delete on public.score_entries to authenticated;
grant select, insert, delete on public.yahtzee_events to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant insert, update on public.profiles to authenticated;
