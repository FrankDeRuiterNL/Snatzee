# Snatzee 🎲

**Snatzee is een sociale score- en statistiekenapp voor mensen die Yahtzee spelen.**

Snatzee vervangt nadrukkelijk **niet** het traditionele Yahtzee-scoreblaadje. Je speelt een
normaal potje met een fysiek scoreformulier en voert daarna alleen je **eindresultaat** in.
Snatzee houdt vervolgens je scores, statistieken, records, achievements, vrienden en
ranglijsten bij.

Mobile-first PWA, te installeren op het homescreen van iPhone en Android.

---

## Inhoud

- [Techniek](#techniek)
- [Snel starten](#snel-starten)
- [Supabase inrichten](#supabase-inrichten)
- [Demo data](#demo-data)
- [Deployen met Docker](#deployen-met-docker)
- [Deployen op Vercel](#deployen-op-vercel)
- [Datamodel](#datamodel)
- [Achievements](#achievements)
- [Brand assets](#brand-assets)
- [Projectstructuur](#projectstructuur)
- [Scripts](#scripts)

---

## Techniek

| Laag | Keuze |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4 met een eigen design-tokenset |
| Componenten | Radix primitives + eigen componentlaag |
| Animatie | Framer Motion |
| Iconen | Lucide |
| Grafieken | Recharts |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth (e-mail/wachtwoord, Apple, Google) |
| Security | Row Level Security + `SECURITY DEFINER` RPC's |
| Hosting | Docker (poort **6666**) of Vercel |

---

## Snel starten

```bash
git clone <deze repo>
cd Snatzee
npm install

cp .env.example .env.local     # vul je Supabase-gegevens in
npm run dev                    # http://localhost:3000
```

### Environment variabelen

| Variabele | Nodig voor | Toelichting |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app | Project-URL, bijv. `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Publieke anon key — RLS beschermt de data |
| `NEXT_PUBLIC_SITE_URL` | app | Publieke origin, gebruikt voor metadata en OAuth-redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | alleen `npm run seed` | **Server-only.** Nooit in de browser. |

---

## Supabase inrichten

1. Maak een nieuw Supabase-project aan.
2. Voer de migraties **in volgorde** uit via de SQL Editor (of `supabase db push`):

   ```
   supabase/migrations/0001_init.sql          tabellen, enums, indexes, signup-trigger
   supabase/migrations/0002_views_and_stats.sql  user_statistics view + leaderboard functies
   supabase/migrations/0003_achievements.sql  achievement-engine + 36 achievements
   supabase/migrations/0004_rpcs.sql          server-side mutaties met validatie
   supabase/migrations/0005_rls.sql           Row Level Security
   supabase/migrations/0006_storage.sql       avatars-bucket + storage policies
   ```

   De migraties zijn idempotent: opnieuw draaien is veilig.

3. **Auth providers** — zet in *Authentication → Providers* aan:
   - Email (wachtwoord)
   - Apple
   - Google

4. **Redirect URLs** — voeg in *Authentication → URL Configuration* toe:

   ```
   http://localhost:3000/auth/callback
   https://jouw-domein.nl/auth/callback
   ```

### Configureerbare grenzen

Instellingen staan in de tabel `public.app_settings` en zijn live aan te passen:

| Key | Standaard | Betekenis |
| --- | --- | --- |
| `min_score` | `0` | Laagst toegestane eindscore |
| `max_score` | `1575` | Hoogst toegestane eindscore |
| `min_games_for_average_ranking` | `5` | Minimum potjes voor de gemiddelde-ranglijst |
| `low_score_threshold` | `80` | Grens voor de "Dat deed pijn"-achievement |

```sql
update public.app_settings set value = '10'::jsonb
where key = 'min_games_for_average_ranking';
```

De UI toont dit automatisch ("Minimaal 5 potjes nodig").

---

## Demo data

Voor ontwikkeling staat er een seed klaar met zes spelers (Mathijs, Pien, Frank, Daniel,
Sophie en Joost), realistisch verdeelde scores, Yahtzee-events, vriendschappen en een groep.

```bash
npm run seed
```

Inloggen als demo-speler: `<username>@demo.snatzee.app` met wachtwoord `snatzee-demo-1234`.

> De seed weigert te draaien met `NODE_ENV=production`. Demo data hoort niet in productie.

---

## Deployen met Docker

De app draait op **poort 6666**.

```bash
git clone <deze repo>
cd Snatzee

cp .env.example .env          # vul NEXT_PUBLIC_* in
docker compose up -d --build
```

Daarna bereikbaar op `http://<docker-host>:6666`.

> `NEXT_PUBLIC_*` waarden worden door Next.js **tijdens de build** in de bundle gezet.
> Docker Compose geeft ze daarom door als build args én als runtime environment. Wijzig je
> ze, draai dan `docker compose up -d --build` opnieuw.

Zonder Compose:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://snatzee.jouwdomein.nl \
  -t snatzee .

docker run -d --name snatzee -p 6666:6666 --restart unless-stopped snatzee
```

Het image gebruikt de Next.js `standalone` output, draait als niet-root gebruiker en heeft
een healthcheck op `/api/health`.

---

## Deployen op Vercel

Importeer de repo, zet de drie `NEXT_PUBLIC_*` variabelen, en deploy. Vergeet niet de
Vercel-URL toe te voegen aan de Supabase redirect URLs.

---

## Datamodel

Er is **geen multiplayer-wedstrijdstructuur**. Iedere gebruiker registreert alleen zijn
eigen potje.

```
profiles           id, username (uniek), display_name, avatar_url, bio, is_private
score_entries      user_id, score, is_win, played_at, note
yahtzee_events     user_id, event_type (NORMAL | FIRST_ROLL)
friendships        requester_id, addressee_id, status (pending | accepted | declined)
groups             owner_id, name, emoji, description, invite_code
group_members      group_id, user_id, role (owner | admin | member)
achievements       key, name, description, icon, rarity, category, is_secret, criteria
user_achievements  user_id, achievement_id, unlocked_at, source_id
app_settings       key, value (jsonb)
```

### Yahtzee's worden één keer opgeslagen

Een Yahtzee is een losse gebeurtenis, geen veld bij een potje. Er is **één** tabel
`yahtzee_events`. Een rij met `event_type = 'FIRST_ROLL'` telt statistisch **zowel** als een
Yahtzee **als** als een Yahtzee-in-één-worp — er wordt dus nooit dubbel geboekt:

```sql
count(*)                                          as yahtzee_count,
count(*) filter (where event_type = 'FIRST_ROLL') as first_roll_yahtzee_count
```

### Afgeleide statistieken

Niets wordt dubbel opgeslagen op `profiles`. Alles komt uit de view `public.user_statistics`:

```
user_id, username, display_name, avatar_url,
games_played, wins, losses, average_score, highest_score, lowest_score,
last_played_at, yahtzee_count, first_roll_yahtzee_count, win_rate, achievement_count
```

Ranglijsten draaien via één database-functie, zodat er nooit rijen naar de client komen om
daar een gemiddelde te berekenen:

```sql
select * from public.get_leaderboard(
  p_metric   => 'average_score',  -- highest_score | average_score | games_played
                                  -- wins | yahtzee_count | first_roll_yahtzee_count
  p_scope    => 'friends',        -- global | friends | group
  p_group_id => null,
  p_limit    => 50
);
```

### Security

Row Level Security staat aan op alle tabellen:

- Je kunt **alleen je eigen** score-entries en Yahtzee-events aanmaken, wijzigen en verwijderen.
- `user_achievements` heeft **geen** insert/update/delete policy — alleen de
  `SECURITY DEFINER` achievement-engine schrijft erin. Een client kan zichzelf dus geen
  achievement toekennen.
- Publieke statistieken zijn read-only opvraagbaar via `user_statistics`; individuele
  score-rijen van anderen zijn niet leesbaar (notities blijven privé).
- Alle validatie (scoregrenzen, datums, usernames, groepsrechten) zit in de database, niet
  alleen in de client.

---

## Achievements

36 achievements in vijf categorieën (scores, yahtzee, wins, games, sociaal), met rarity
`COMMON` / `RARE` / `EPIC` / `LEGENDARY`. Vijf ervan zijn **secret** en blijven verborgen tot
je ze vrijspeelt.

Ze worden automatisch toegekend door `public.evaluate_achievements(user_id)`, die draait via
triggers op `score_entries`, `yahtzee_events`, `friendships` en `group_members`. De
mutatie-RPC's geven de nieuw vrijgespeelde achievements direct terug, zodat de app meteen een
celebration kan tonen.

Een nieuwe achievement toevoegen is één insert — de engine snapt het criteria-type:

```sql
insert into public.achievements (key, name, description, icon, rarity, category, criteria)
values ('games_500', 'Onverzadigbaar', 'Speel 500 potjes', '🏅', 'LEGENDARY', 'games',
        '{"type":"games_played","gte":500}');
```

Ondersteunde criteria-types: `games_played`, `wins`, `highest_score`, `low_score`,
`yahtzee_count`, `first_roll_count`, `win_streak`, `score_streak`, `win_rate`,
`games_in_day`, `distinct_days`, `yahtzee_in_day`, `night_game`, `exact_score`,
`notes_count`, `friends_count`, `groups_count`, `comeback`.

---

## Brand assets

Alle app-iconen en iOS-splashscreens worden gegenereerd uit de originele artwork in `brand/`:

```
brand/icon-source.png      het logo / app-icoon
brand/splash-source.png    het launch screen
brand/design-guideline.png de visuele referentie
```

```bash
npm run brand
```

Dit schrijft:

- 16 app-iconen (`apple-touch-icon` 180/167/152/120/76/60, PWA 96–1024, favicons)
- 2 maskable iconen (content binnen de 80% safe zone)
- 36 iOS-splashscreens — elk ondersteund device in portrait én landscape
- 3 in-app logo-assets (volledig logo, dobbelsteen-only mark, bron)
- `src/components/layout/apple-splash-links.tsx` met de bijbehorende `<link>` tags

Vervang de bronbestanden en draai `npm run brand` opnieuw om de hele set te vernieuwen. De
artwork wordt automatisch bijgesneden op zijn eigen inhoud, dus extra witruimte rond het logo
maakt niet uit.

---

## Projectstructuur

```
src/
  app/
    page.tsx                landing
    login/ register/        auth
    onboarding/             5-stappen onboarding
    auth/callback/          OAuth + magic link
    app/                    ingelogde app (protected)
      page.tsx              home dashboard
      rankings/ history/ achievements/
      friends/ groups/[id]/ profile/ statistics/ settings/
    u/[username]/           publiek profiel
    api/health/             healthcheck voor Docker
  components/
    ui/                     Button, Card, Input, BottomSheet, StatCard, …
    layout/                 BottomNavigation, QuickActionsProvider, PageTransition
    home/ score/ rankings/ achievements/ friends/ groups/ profile/ stats/
  lib/
    supabase/               browser-, server- en middleware-clients + queries
    constants.ts            centrale configuratie
    haptics.ts utils.ts
  types/database.ts         types die het SQL-schema spiegelen
supabase/migrations/        SQL migraties
scripts/                    seed + brand asset generator
```

### PWA

- `public/manifest.webmanifest` met standalone display, theme colors en app shortcuts
  (Potje toevoegen, Yahtzee, 1 worp, Ranglijsten)
- `public/sw.js` — network-first voor navigatie en data, cache-first voor statics, met een
  offline fallback. Scores en ranglijsten worden dus nooit verouderd geserveerd.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` overal waar het telt
- Inputs zijn minimaal 16px zodat Safari niet inzoomt; geen dubbeltap-zoom, geen
  horizontaal scrollen, geen blauwe selectie-highlight
- Floating bottom navigation die rekening houdt met de home indicator

---

## Scripts

| Commando | Wat het doet |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Productiebuild (standalone output) |
| `npm run start` | Productieserver |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript zonder emit |
| `npm run seed` | Demo data (alleen development) |
| `npm run brand` | Genereer alle iconen en splashscreens opnieuw |
