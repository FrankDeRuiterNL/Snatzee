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
- [Deployen met Docker](#deployen-met-docker) — de complete handleiding
- [Beheerders](#beheerders)
- [Lokaal ontwikkelen](#lokaal-ontwikkelen)
- [Alternatief: gehost Supabase](#alternatief-gehost-supabase)
- [Demo data](#demo-data)
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
| Hosting | Docker compose (poort **6666**) of Vercel + gehost Supabase |

---

## Deployen met Docker

De hele applicatie draait in Docker: **database, authenticatie, API, opslag én de
app zelf**. Je hebt geen account bij Supabase of een andere dienst nodig.

### Wat er draait

Zeven containers in één compose-stack:

| Service | Image | Rol |
| --- | --- | --- |
| `db` | `postgres:16.15-alpine` | PostgreSQL met de Supabase-rollen |
| `auth` | `supabase/gotrue:v2.197.0` | Inloggen, registreren, Apple/Google |
| `rest` | `postgrest/postgrest:v12.2.12` | De `/rest/v1` API en alle RPC's |
| `storage` | `supabase/storage-api:v1.79.2` | Avatar-uploads |
| `migrate` | `postgres:16.15-alpine` | Eenmalig: zet het schema klaar en stopt |
| `app` | wordt lokaal gebouwd | De Next.js applicatie |
| `gateway` | `nginx:1.29-alpine` | De enige gepubliceerde poort |

Alles komt binnen op **poort 6666**. De app en de Supabase-API's delen één
origin, dus er is maar één poort open en er valt geen CORS te configureren.

> **Waarom niet alles in één container?** De database en de app hebben een
> verschillende levensduur. In aparte containers kun je de app herbouwen of
> herstarten zonder de database aan te raken, blijft je data in een eigen volume
> staan bij een upgrade, en haalt een crash van het één het ander niet onderuit.
> Je start ze nog steeds met één commando.

### Stap 1 — Repo ophalen

```bash
git clone https://github.com/FrankDeRuiterNL/Snatzee.git
cd Snatzee
```

### Stap 2 — Configuratie aanmaken

```bash
cp .env.example .env
```

### Stap 3 — Geheimen genereren

Dit maakt het databasewachtwoord, het JWT-secret en de twee API-sleutels aan:

```bash
node scripts/generate-keys.mjs
```

Heb je geen Node op de server? Dan kan het ook via Docker:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine node scripts/generate-keys.mjs
```

Plak de vier regels die je terugkrijgt in `.env`:

```
POSTGRES_PASSWORD=...
JWT_SECRET=...
ANON_KEY=...
SERVICE_ROLE_KEY=...
```

### Stap 4 — Je adres invullen

Zet in `.env` de `PUBLIC_URL` op het adres waarop mensen de app openen. Dit is
het belangrijkste veld: OAuth-redirects, e-maillinks en de PWA-installatie
hangen ervan af.

```bash
# Op je eigen netwerk
PUBLIC_URL=http://192.168.1.50:6666

# Achter een domein met HTTPS
PUBLIC_URL=https://www.snatzee.nl
```

Zet daarnaast elk domein waarop de app bereikbaar is in de redirect-lijst:

```bash
ADDITIONAL_REDIRECT_URLS=https://snatzee.frankvandetechniek.nl/**,https://www.snatzee.nl/**
```

### Stap 5 — Starten

```bash
docker compose up -d --build
```

De eerste keer duurt dit een paar minuten: de app wordt gebouwd, de database
wordt aangemaakt en `migrate` zet het volledige schema klaar.

### Stap 6 — Controleren

```bash
# Alle services draaien?
docker compose ps

# Het schema is aangemaakt (deze container hoort "Exited (0)" te zijn)
docker compose logs migrate

# Reageert de app?
curl http://localhost:6666/api/health
```

Verwacht antwoord:

```json
{ "status": "ok", "app": "snatzee", "time": "..." }
```

Open daarna `http://<docker-host>:6666` en maak je account aan.

---

### Achter een reverse proxy met HTTPS

Voor `https://www.snatzee.nl` zet je je eigen proxy (Traefik, Caddy, nginx,
Cloudflare Tunnel) vóór poort 6666. De gateway leest `X-Forwarded-Proto` en
`X-Forwarded-Host`, dus de app bouwt automatisch de juiste absolute URL's — ook
met twee domeinen tegelijk.

Voorbeeld met Caddy:

```
snatzee.frankvandetechniek.nl, www.snatzee.nl {
    reverse_proxy localhost:6666
}
```

Zet `PUBLIC_URL` daarna op het domein dat je als hoofdadres wilt gebruiken en
neem beide domeinen op in `ADDITIONAL_REDIRECT_URLS`.

### Inloggen met Apple en Google

Beide staan standaard uit; inloggen met e-mail werkt direct. Aanzetten in `.env`:

```bash
GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_SECRET=...
```

Gebruik als redirect-URI bij de provider:

```
https://www.snatzee.nl/auth/v1/callback
```

Daarna `docker compose up -d` om de auth-service opnieuw te laden.

### E-mail

Zonder SMTP-server kan er geen bevestigingsmail verstuurd worden, dus nieuwe
accounts zijn meteen actief (`MAILER_AUTOCONFIRM=true`). Vul je de SMTP-velden
in, zet `MAILER_AUTOCONFIRM=false` om bevestiging per e-mail af te dwingen.

Draait het alleen voor je eigen kring? Zet na aanmelden
`DISABLE_SIGNUP=true` en start opnieuw om registratie te sluiten.

### Dagelijks beheer

```bash
# Logs volgen
docker compose logs -f app
docker compose logs -f auth

# Bijwerken naar de laatste code
git pull
docker compose up -d --build

# Herstarten zonder de database aan te raken
docker compose restart app

# Stoppen (data blijft behouden)
docker compose down

# Stoppen én ALLE data wissen
docker compose down -v
```

> `docker compose up` draait `migrate` elke keer opnieuw. Alle migraties zijn
> idempotent, dus dat is veilig en zet nieuwe migraties na een `git pull`
> vanzelf klaar.

### Back-ups

Alle data staat in twee volumes: `snatzee_db-data` en `snatzee_storage-data`.

```bash
# Database dumpen
docker compose exec -T db pg_dump -U postgres postgres | gzip > snatzee-$(date +%F).sql.gz

# Terugzetten
gunzip -c snatzee-2026-09-18.sql.gz | docker compose exec -T db psql -U postgres postgres

# Avatars
docker run --rm -v snatzee_storage-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/snatzee-avatars-$(date +%F).tar.gz -C /data .
```

### Problemen oplossen

| Symptoom | Oorzaak en oplossing |
| --- | --- |
| `migrate` stopt met een timeout | `auth` of `storage` kwam niet op. Check `docker compose logs auth storage`; meestal een verkeerd `POSTGRES_PASSWORD` in `.env`. |
| Inloggen lukt, maar je wordt teruggestuurd naar `/login` | `PUBLIC_URL` komt niet overeen met het adres in de browser. Corrigeer en draai `docker compose up -d --build` (de waarde zit in de build gebakken). |
| OAuth eindigt op een foutpagina | Redirect-URI bij de provider moet exact `${PUBLIC_URL}/auth/v1/callback` zijn, en het domein moet in `ADDITIONAL_REDIRECT_URLS` staan. |
| Avatars laden niet | Wijzig je `PUBLIC_URL`, herbouw dan de app: het beeld-domein wordt tijdens de build vastgelegd. |
| Poort 6666 is bezet | Zet `HTTP_PORT=7777` in `.env` en start opnieuw. |

---

## Beheerders

Snatzee kent drie rollen: `user`, `admin` en `superadmin`.

Een adres kan **vooraf** worden aangewezen, dus voordat het account bestaat. Bij
registratie krijgt dat account de rol automatisch; bestond het al, dan wordt het
bij de volgende migratie bijgewerkt. `frank1.deruiter@gmail.com` staat al als
`superadmin` in `supabase/migrations/0007_admin_roles.sql`.

Zelf iemand toevoegen vóór registratie:

```sql
insert into public.admin_allowlist (email, role)
values ('iemand@voorbeeld.nl', 'admin')
on conflict (email) do update set role = excluded.role;
```

```bash
docker compose exec db psql -U postgres -c "insert into public.admin_allowlist (email, role) values ('iemand@voorbeeld.nl','admin') on conflict (email) do update set role = excluded.role;"
```

Een superadmin kan rollen ook in de app toekennen, via **Instellingen → Beheer**.

| | `user` | `admin` | `superadmin` |
| --- | --- | --- | --- |
| Eigen potjes en Yahtzee's beheren | ✓ | ✓ | ✓ |
| Score van een ander verwijderen | | ✓ | ✓ |
| Scoregrenzen en ranking-minimum aanpassen | | ✓ | ✓ |
| Rollen toekennen | | | ✓ |

De rol staat in `profiles.role` en is **niet** rechtstreeks te wijzigen: een
databasetrigger weigert elke update die de kolom aanraakt buiten
`set_user_role()` om, dus een client kan zichzelf niet promoveren.

---

## Lokaal ontwikkelen

Tegen de Docker-stack, met hot reload:

```bash
docker compose up -d db auth rest storage migrate gateway
npm install
npm run dev      # http://localhost:3000
```

Zet in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:6666
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY uit .env>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Alternatief: gehost Supabase

Liever geen database zelf draaien? De app werkt ook op Vercel met een
Supabase-project.

1. Maak een Supabase-project aan.
2. Voer de migraties uit de map `supabase/migrations/` **in volgorde** uit via de
   SQL Editor, of met `supabase db push`. Ze zijn idempotent.
3. Zet Email, Apple en Google aan onder *Authentication → Providers*.
4. Voeg onder *Authentication → URL Configuration* je callback toe:
   `https://jouw-domein.nl/auth/callback`
5. Zet in Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
   `NEXT_PUBLIC_SITE_URL`.

`auth.uid()` en de opslag-bucket zijn daar al aanwezig;
`docker/postgres/supabase-compat.sql` is alleen voor de zelf-gehoste variant.

### Configureerbare grenzen

Instellingen staan in `public.app_settings` en zijn live aan te passen — via
**Instellingen → Beheer** in de app, of met SQL:

| Key | Standaard | Betekenis |
| --- | --- | --- |
| `min_score` | `0` | Laagst toegestane eindscore |
| `max_score` | `1575` | Hoogst toegestane eindscore |
| `min_games_for_average_ranking` | `5` | Minimum potjes voor de gemiddelde-ranglijst |
| `low_score_threshold` | `80` | Grens voor de "Dat deed pijn"-achievement |

De UI toont dit automatisch ("Minimaal 5 potjes nodig").

---

## Demo data

Voor ontwikkeling staat er een seed klaar met zes spelers (Mathijs, Pien, Frank,
Daniel, Sophie en Joost), realistisch verdeelde scores, Yahtzee-events,
vriendschappen en een groep.

```bash
npm run seed
```

Dit vraagt om `NEXT_PUBLIC_SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` of `.env`. Bij de Docker-stack zijn dat `PUBLIC_URL` en
`SERVICE_ROLE_KEY`.

Inloggen als demo-speler: `<username>@demo.snatzee.app` met wachtwoord
`snatzee-demo-1234`.

> De seed weigert te draaien met `NODE_ENV=production`. Demo data hoort niet in
> productie.

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
admin_allowlist    email, role  — rollen die vooraf worden toegekend
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
- `profiles.role` is niet rechtstreeks te wijzigen: een trigger weigert elke update die de
  kolom aanraakt buiten `set_user_role()` om.

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
supabase/migrations/        SQL migraties (0001 t/m 0007)
docker/
  postgres/init/            rollen en rechten, draait bij eerste start
  postgres/supabase-compat.sql  auth.uid() c.s. voor de zelf-gehoste stack
  nginx/                    gateway die alles op poort 6666 samenbrengt
  migrate.sh               wacht op de services en zet het schema klaar
scripts/                    seed, brand assets en sleutelgeneratie
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
| `node scripts/generate-keys.mjs` | Genereer de geheimen voor de Docker-stack |
