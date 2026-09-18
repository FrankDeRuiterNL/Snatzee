-- =====================================================================
-- Snatzee — application roles
--
-- Accounts can be promoted before they exist: an email is added to
-- admin_allowlist and the signup trigger applies the role the moment
-- that address registers. Accounts that already exist are back-filled
-- immediately.
-- =====================================================================

do $$ begin
  create type public.app_role as enum ('user', 'admin', 'superadmin');
exception when duplicate_object then null; end $$;

alter table public.profiles
  add column if not exists role public.app_role not null default 'user';

create index if not exists profiles_role_idx on public.profiles (role)
  where role <> 'user';

-- ---------------------------------------------------------------------
-- Pre-authorised addresses
-- ---------------------------------------------------------------------
create table if not exists public.admin_allowlist (
  email      text primary key,
  role       public.app_role not null default 'admin',
  note       text,
  created_at timestamptz not null default now(),
  constraint admin_allowlist_role_check check (role <> 'user')
);

-- Never client-readable: it would leak who runs the instance.
alter table public.admin_allowlist enable row level security;

insert into public.admin_allowlist (email, role, note)
values ('frank1.deruiter@gmail.com', 'superadmin', 'Instance owner')
on conflict (email) do update set role = excluded.role;

-- ---------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'user'::public.app_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() in ('admin', 'superadmin');
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'superadmin';
$$;

-- ---------------------------------------------------------------------
-- Apply the allowlist at signup.
-- Replaces the trigger function from 0001 so new accounts pick up their
-- role in the same statement that creates the profile.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     text;
  v_username text;
  v_display  text;
  v_suffix   int := 0;
  v_role     public.app_role;
begin
  v_base := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      split_part(coalesce(new.email, ''), '@', 1),
      'player'
    ), '[^a-z0-9_]', '', 'g'));

  if char_length(v_base) < 3 then
    v_base := 'player';
  end if;
  v_base := substr(v_base, 1, 16);

  v_username := v_base;
  while exists (select 1 from public.profiles where lower(username) = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := substr(v_base, 1, 16) || v_suffix::text;
  end loop;

  v_display := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    v_base
  );

  select a.role into v_role
  from public.admin_allowlist a
  where lower(a.email) = lower(coalesce(new.email, ''));

  insert into public.profiles (id, username, display_name, avatar_url, role)
  values (
    new.id,
    v_username,
    substr(v_display, 1, 40),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(v_role, 'user'::public.app_role)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Back-fill anyone on the allowlist who signed up before it was set.
-- The guard trigger below rejects direct role edits, so this opens the
-- same escape hatch that set_user_role() uses.
do $$
begin
  perform set_config('snatzee.allow_role_change', 'on', true);

  update public.profiles p
  set role = a.role
  from public.admin_allowlist a
  join auth.users u on lower(u.email) = lower(a.email)
  where p.id = u.id and p.role is distinct from a.role;

  perform set_config('snatzee.allow_role_change', 'off', true);
end $$;

-- ---------------------------------------------------------------------
-- What an admin may actually do
-- ---------------------------------------------------------------------

-- Tune the configurable limits (score bounds, ranking minimums).
create or replace function public.update_app_setting(p_key text, p_value integer)
returns public.app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.app_settings;
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen instellingen wijzigen' using errcode = '42501';
  end if;
  if p_value is null or p_value < 0 then
    raise exception 'Waarde moet 0 of hoger zijn' using errcode = '22023';
  end if;

  update public.app_settings
  set value = to_jsonb(p_value), updated_at = now()
  where key = p_key
  returning * into v_row;

  if not found then
    raise exception 'Onbekende instelling: %', p_key using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- Moderation: remove a score entry that is not your own.
create or replace function public.admin_delete_score_entry(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Alleen beheerders kunnen dit doen' using errcode = '42501';
  end if;
  delete from public.score_entries where id = p_id;
  return found;
end;
$$;

-- Superadmins manage who else is an admin.
create or replace function public.set_user_role(p_username text, p_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_superadmin() then
    raise exception 'Alleen een superadmin kan rollen toekennen' using errcode = '42501';
  end if;

  -- The guard trigger only lets role changes through this function.
  perform set_config('snatzee.allow_role_change', 'on', true);

  update public.profiles
  set role = p_role
  where lower(username) = lower(btrim(p_username))
  returning * into v_row;

  perform set_config('snatzee.allow_role_change', 'off', true);

  if not found then
    raise exception 'Gebruiker niet gevonden' using errcode = 'P0002';
  end if;

  -- Keep the allowlist in step so the role survives a delete-and-resignup.
  if p_role = 'user' then
    delete from public.admin_allowlist a
    using auth.users u
    where u.id = v_row.id and lower(a.email) = lower(u.email);
  else
    insert into public.admin_allowlist (email, role, note)
    select u.email, p_role, 'Set via set_user_role'
    from auth.users u where u.id = v_row.id and u.email is not null
    on conflict (email) do update set role = excluded.role;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------

-- Admins may moderate score entries beyond their own.
drop policy if exists "score_entries_admin_all" on public.score_entries;
create policy "score_entries_admin_all" on public.score_entries
  for select using (public.is_admin());

drop policy if exists "score_entries_admin_delete" on public.score_entries;
create policy "score_entries_admin_delete" on public.score_entries
  for delete using (public.is_admin());

-- Nobody edits profiles.role directly: an ordinary profile update that
-- changes the role column is rejected, so a client cannot promote itself
-- even though it may legitimately update its own display name and avatar.
-- set_user_role() and the allowlist back-fill set a transaction-local flag
-- to pass through.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('snatzee.allow_role_change', true), 'off') <> 'on' then
    raise exception 'Rollen worden via set_user_role() beheerd' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.update_app_setting(text, integer) to authenticated;
grant execute on function public.admin_delete_score_entry(uuid) to authenticated;
grant execute on function public.set_user_role(text, public.app_role) to authenticated;
