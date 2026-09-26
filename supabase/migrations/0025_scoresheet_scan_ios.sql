-- =====================================================================
-- Snatzee — scoreblad scannen in de iOS-app
--
-- The iOS app reads paper scoresheets with Apple's Vision framework, on
-- the device. Its own switch, apart from the website's scoresheet_scan,
-- so it can be tried in TestFlight and turned on when it reads well
-- enough, without touching the website. 0/1 like launch_splash, so
-- update_app_setting(key, integer) and the admin console can flip it.
-- =====================================================================

insert into public.app_settings (key, value, description) values
  ('scoresheet_scan_ios', '0'::jsonb,
   'Scoreblad scannen in de iOS-app (0 = uit, 1 = aan)')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
