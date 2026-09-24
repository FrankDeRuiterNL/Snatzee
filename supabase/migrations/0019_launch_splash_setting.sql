-- =====================================================================
-- Snatzee — opt-in launch splash
--
-- A flag, stored as 0/1 so the existing update_app_setting(key, integer)
-- can write it without a second RPC. It exists to be tried on a real
-- phone and switched off again without a deploy.
-- =====================================================================

insert into public.app_settings (key, value, description) values
  ('launch_splash', '0'::jsonb,
   'Toon bij het openen een tik-scherm, zodat het openingsgeluid meteen speelt (0 = uit, 1 = aan)')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
