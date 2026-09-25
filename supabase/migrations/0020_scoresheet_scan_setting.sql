-- =====================================================================
-- Snatzee — scoreblad scannen (ontwikkelvlag)
--
-- Zet het scannen van een papieren scoreblad aan of uit. Staat als 0/1 in
-- app_settings zodat de bestaande update_app_setting(key, integer) hem kan
-- schrijven, net als launch_splash. Bedoeld om uit te staan tot het
-- herkennen betrouwbaar genoeg is; daarna kan de vlag weg.
-- =====================================================================

insert into public.app_settings (key, value, description) values
  ('scoresheet_scan', '0'::jsonb,
   'Laat een potje toevoegen via een foto van het papieren scoreblad (0 = uit, 1 = aan)')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
