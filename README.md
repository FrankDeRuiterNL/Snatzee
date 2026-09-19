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
- [Dark mode](#dark-mode)
- [Beheerders](#beheerders)
- [Yahtzee's registreren](#yahtzees-registreren)
- [Levels, achievements en geluid](#levels-achievements-en-geluid)
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
| `db` | `supabase/postgres:17.6.1.136` | PostgreSQL mét de Supabase-rollen, -schema's en `auth.uid()` |
| `db-prepare` | `supabase/postgres:17.6.1.136` | Eenmalig: zet de wachtwoorden van de servicerollen goed |
| `auth` | `supabase/gotrue:v2.196.0` | Inloggen, registreren, Apple/Google |
| `rest` | `postgrest/postgrest:v14.17` | De `/rest/v1` API en alle RPC's |
| `storage` | `supabase/storage-api:v1.74.0` | Avatar-uploads |
| `migrate` | `supabase/postgres:17.6.1.136` | Eenmalig: zet het schema klaar en stopt |
| `app` | wordt lokaal gebouwd | De Next.js applicatie |
| `gateway` | `nginx:1.29-alpine` | De enige gepubliceerde poort |

Alles komt binnen op **poort 6666**. De app en de Supabase-API's delen één
origin, dus er is maar één poort open en er valt geen CORS te configureren.

De images en hun instellingen volgen de officiële self-hosting-compose van
Supabase, zodat dit een opstelling volgt die breed gedraaid en getest wordt in
plaats van een zelfgebouwd equivalent. `supabase/postgres` levert de rollen, de
`auth`- en `storage`-schema's, de extensies en `auth.uid()` — precies de dingen
waar alle RLS-policies op leunen.

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

Wil je pushmeldingen? Genereer dan ook een VAPID-sleutelpaar (zie
[Pushmeldingen](#pushmeldingen)); zonder die sleutels draait de app prima, maar
blijft de meldingen-toggle uit.

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

### Opstartvolgorde

`docker compose up -d` start alles in de juiste volgorde; elke service wacht
op een echte health check van de vorige:

```
db → db-prepare → auth + rest → storage → migrate → app → gateway
```

Poort 6666 gaat pas open als alles erachter antwoordt, dus je krijgt geen 502
tijdens het opstarten. De eerste keer duurt dat een paar minuten.

Eén detail dat makkelijk misgaat: PostgREST bouwt zijn schema-cache zodra het
verbinding maakt, en dat is bij een eerste start vóórdat de migraties draaien.
`migrate` stuurt daarom aan het eind `notify pgrst, 'reload schema'`. Zonder
dat zou de API blijven melden dat `get_leaderboard` niet bestaat tot je `rest`
opnieuw start.

### Serveren op meerdere domeinen

De app volgt de adresbalk. De gateway serveert de Supabase-API's op dezelfde
origin als de app, dus de browser praat met het domein waarop je al zit. Een
extra domein kost geen herbouw en geen extra variabele.

Zet `PUBLIC_URL` op het domein dat je als hoofdadres wilt — dat adres komt
terug in OAuth-callbacks, e-maillinks, opgeslagen avatar-URL's en metadata —
en noem alle domeinen in deze twee:

```bash
PUBLIC_URL=https://www.snatzee.nl

ADDITIONAL_REDIRECT_URLS=https://www.snatzee.nl/**,https://snatzee.frankvandetechniek.nl/**
MAILER_EXTERNAL_HOSTS=www.snatzee.nl,snatzee.frankvandetechniek.nl
```

> **Eén `PUBLIC_URL` tegelijk.** Een `.env`-bestand houdt de laatste regel van
> een sleutel aan, dus twee actieve `PUBLIC_URL`-regels betekent stilletjes dat
> de onderste wint. Zet alternatieven met `#` uit.

Wijzig je `PUBLIC_URL` later, draai dan `docker compose up -d --build`: het
zit in de build gebakken. Avatars die al waren geüpload blijven naar het oude
domein wijzen, dus laat dat domein bereikbaar of upload ze opnieuw.

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

> Alle migraties zijn idempotent, dus `migrate` opnieuw draaien is altijd
> veilig. Wil je na een `git pull` zeker weten dat nieuwe migraties zijn
> toegepast, gebruik dan de stappen onder
> [Bijwerken naar een nieuwe versie](#bijwerken-naar-een-nieuwe-versie).

### Bijwerken naar een nieuwe versie

De standaardmanier om wijzigingen uit Git op de server te zetten:

```bash
cd /pad/naar/Snatzee
git pull

# 1. App-image opnieuw bouwen: nieuwe dependencies en de NEXT_PUBLIC_*
#    waarden worden in de build gebakken.
docker compose build app

# 2. Nieuwe migraties toepassen.
#    De migraties zijn een bind-mount: een bestand erbij verandert de
#    container-configuratie van de migrate-service niet, dus of compose
#    de stap uit zichzelf opnieuw draait hangt af van je compose-versie.
#    --force-recreate haalt die twijfel weg. Migraties zijn idempotent,
#    dus een keer te vaak draaien kan geen kwaad -- een keer te weinig
#    wel: de app start dan tegen een schema zonder de nieuwe tabellen.
docker compose up -d --force-recreate migrate

# 3. De rest doorrollen.
docker compose up -d
```

Controleren of het gelukt is:

```bash
# Elke migratie moet langskomen, eindigend op "Schema is up to date."
docker compose logs --tail=40 migrate

# Alles behalve db-prepare en migrate hoort "running" te zijn; die twee
# zijn eenmalige taken en staan op "exited (0)".
docker compose ps

# Statische bestanden gaan buiten de middleware om: dit hoort 200 te geven.
curl -I http://localhost:6666/audio/logo.mp3
```

Geeft de app na een update een foutmelding over een functie die niet in de
schema cache staat, dan heeft PostgREST de nieuwe RPC's nog niet gezien:

```bash
docker compose restart rest
```

Alleen bij een wijziging in `.env`: waarden die met `NEXT_PUBLIC_` in de app
terechtkomen (zoals `VAPID_PUBLIC_KEY`) zitten in de build, dus die vragen om
`docker compose build app` voordat je herstart. De rest — SMTP, OAuth-secrets,
`VAPID_PRIVATE_KEY` — wordt bij het starten gelezen, dus daar volstaat
`docker compose up -d`.

### Bijwerken vanaf de allereerste versie

De eerste versie van deze stack draaide op een kale `postgres:16` met
handgemaakte rollen. Die is vervangen door `supabase/postgres`, dat de rollen,
schema's en `auth.uid()` zelf meebrengt. De datadirectory van beide is niet
uitwisselbaar, dus een bestaand volume moet eenmalig weg:

```bash
docker compose down -v
docker compose up -d --build
```

Had je al data? Maak eerst een dump (zie [Back-ups](#back-ups)) en zet die
daarna terug.

### Geheimen wijzigen

`POSTGRES_PASSWORD` wordt alleen bij de **allereerste** start in de database
gezet. Wijzig je het later, dan komen de services niet meer binnen. Wil je het
toch veranderen, dan hoort daar een leeg volume bij:

```bash
docker compose down -v      # let op: wist alle data
docker compose up -d --build
```

Maak dus liever meteen bij de eerste opzet een definitief wachtwoord.

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
| `migrate` stopt met een timeout | `auth` of `storage` kwam niet op. `migrate` print welk onderdeel ontbreekt; check daarna `docker compose logs auth` of `docker compose logs storage`. |
| `password authentication failed for user "supabase_storage_admin"` | De wachtwoorden van de servicerollen stonden niet goed. `db-prepare` zet ze bij elke start; komt de fout terug, dan klopt `POSTGRES_PASSWORD` niet met het bestaande volume — zie *Geheimen wijzigen*. |
| `auth` stopt met `must be owner of function uid` | GoTrue mag zijn eigen `auth.uid()` niet vervangen. `db-prepare` draagt die functies aan GoTrue over; draai `docker compose up -d` opnieuw. |
| `storage` blijft herstarten | Meestal een verkeerd `JWT_SECRET` in `.env`, of een volume dat bij een ander wachtwoord hoort. |
| Inloggen lukt, maar je wordt teruggestuurd naar `/login` | Staat het domein in `ADDITIONAL_REDIRECT_URLS`? Controleer ook dat er maar één actieve `PUBLIC_URL`-regel in `.env` staat. |
| `Could not find the function public.… in the schema cache` | PostgREST draait op een cache van vóór de migraties. `migrate` stuurt daar een reload voor; blijft het staan, dan helpt `docker compose restart rest`. |
| OAuth eindigt op een foutpagina | Redirect-URI bij de provider moet exact `${PUBLIC_URL}/auth/v1/callback` zijn, en het domein moet in `ADDITIONAL_REDIRECT_URLS` staan. |
| Avatars laden niet | Wijzig je `PUBLIC_URL`, herbouw dan de app: het beeld-domein wordt tijdens de build vastgelegd. |
| Poort 6666 is bezet | Zet `HTTP_PORT=7777` in `.env` en start opnieuw. |

---

## Dark mode

Snatzee is standaard donker. De diepte komt uit gestapelde navy-lagen in
plaats van zwart, zodat kaarten duidelijk van de achtergrond loskomen:

| Token | Kleur | Gebruikt voor |
| --- | --- | --- |
| `canvas` | `#07131F` | Paginaachtergrond |
| `canvas-soft` | `#0B1D2D` | Bottom sheets, inzinkingen |
| `surface` | `#102638` | Kaarten |
| `surface-elevated` | `#153044` | Hero-kaarten, dialogs, navigatie |
| `surface-high` | `#1B3B53` | Hover, avatars |
| `ink` / `ink-soft` / `ink-muted` | `#F4F7F9` / `#91A4B5` / `#667A8A` | Tekst |
| `hairline` | `rgba(255,255,255,0.07)` | Randen |

Mint (`#24C79A`, accent `#2EE6B0`) is de primaire accentkleur; oranje, paars
en aqua blijven gereserveerd voor achievements, records en bijzondere
momenten. De helpers `card-surface`, `card-elevated`, `sheen` en `glow-mint`
in `globals.css` bundelen vulling, rand en schaduw, zodat elk oppervlak
hetzelfde leest.

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
| Scoregrenzen en ranking-minimum aanpassen | | ✓ | ✓ |
| Adminconsole op `/app/admin` | | | ✓ |
| Scores en 1-worp registraties verwijderen | | | ✓ |
| Rollen toekennen | | | ✓ |

### Adminconsole

Een superadmin krijgt onder **Instellingen** een extra ingang naar
`/app/admin`, met twee tabs: **Scores** en **1-worp Yahtzee's**. Beide zijn
doorzoekbaar op naam of username, sorteerbaar, en laden per 25 rijen bij —
er wordt nooit een hele tabel opgehaald.

Verwijderen vraagt eerst om bevestiging en schrijft daarna een regel in
`admin_audit_log` (wie, wat, welke gebruiker, met de waarden van de
verwijderde rij), zodat later te achterhalen is wat er is weggehaald.
Statistieken en ranglijsten worden live berekend, dus die kloppen direct
weer.

De menu-ingang is puur gemak. De beveiliging zit in de database: elke
admin-functie controleert `is_superadmin()` voordat er ook maar één rij
teruggaat, en `admin_audit_log` heeft geen enkele policy, dus niemand leest
of schrijft die tabel buiten die functies om.

De rol staat in `profiles.role` en is **niet** rechtstreeks te wijzigen: een
databasetrigger weigert elke update die de kolom aanraakt buiten
`set_user_role()` om, dus een client kan zichzelf niet promoveren.

---

## Yahtzee's registreren

Er zijn twee soorten Yahtzee, en ze worden bewust anders vastgelegd.

**Gewone Yahtzee's horen bij een potje.** Bij het toevoegen van een potje zet
je "Yahtzee gegooid?" aan en geef je met een stepper aan hoeveel het er waren.
Dat aantal staat op de score-entry zelf (`score_entries.yahtzee_count`), want
je weet het pas als het potje klaar is.

**Een Yahtzee in één worp is een los moment.** Die registreer je meteen via de
knop op Home, met een bevestiging vooraf zodat een misklik geen record
vervuilt. Deze blijven losse events (`yahtzee_events`, `event_type =
FIRST_ROLL`).

De twee tellingen zijn onafhankelijk:

```
Yahtzee's totaal      = sum(score_entries.yahtzee_count)
Yahtzee's in één worp = count(yahtzee_events where FIRST_ROLL)
```

Een Yahtzee in één worp wordt dus **niet** automatisch bij het potjestotaal
opgeteld — je geeft bij het potje zelf al op hoeveel je er gooide, dus dat zou
dubbel tellen.

> Bestaande `NORMAL`-events uit een oudere versie worden bij migratie 0009
> verplaatst naar het potje dat er qua tijd het dichtst bij zit. Events van
> spelers zonder potjes kunnen nergens heen en blijven staan; de view telt die
> gewoon mee, zodat er niets verdwijnt.

---

## Levels, achievements en geluid

### Spelerniveaus

Je niveau volgt uit het aantal geregistreerde potjes en staat op je profiel, je
statistieken en naast je naam op Home.

| | Niveau | Potjes |
| --- | --- | --- |
| 🙋🏼‍♂️ | Beginner | 0 |
| 👨🏼‍🏭 | Recreatief Speler | 10 |
| 🧑🏼‍🎨 | Hobby Speler | 20 |
| 👨🏼‍💼 | Professioneel Speler | 35 |
| 👨🏼‍✈️ | Zakelijk Speler | 50 |

De drempels staan in `public.player_levels` en zijn aan te passen zonder
deploy. `user_statistics` berekent het huidige niveau, het volgende niveau en
hoeveel potjes daar nog voor nodig zijn.

```sql
update public.player_levels set min_games = 15 where key = 'hobby';
```

### De benoemde achievements

| | Achievement | Voorwaarde |
| --- | --- | --- |
| 😎 | Stabiel | Scoor 200 punten of meer |
| 👑 | High Roller | Scoor 300 punten of hoger |
| 🧙 | The Impossible | Scoor 400 punten of hoger |
| 🎯 | Snatzee! | Gooi een Yahtzee |
| 💯 | Snatzee Pro! | Gooi 10 keer een Yahtzee |
| 🤴 | Snatzee Koning! | Gooi 20 keer een Yahtzee |
| 🔥 | Legend | Gooi een Yahtzee in één worp |
| 💀 | Hoe dan? | Scoor minder dan 100 punten |

Deze staan naast de overige achievements; in totaal zijn het er 36.

### Geluid

Drie momenten hebben een eigen geluid:

| Bestand | Wanneer |
| --- | --- |
| `Snatzee Audio Logo.wav` | Bij het openen van de app |
| `Snatzee New Score.wav` | Bij het opslaan van een nieuwe score |
| `Snatzee Achievement.wav` | Bij het vrijspelen van een achievement |

De originelen staan in `brand/audio/`. Samen zijn die ruim 1 MB aan onbewerkte
WAV, wat veel is voor drie korte tunes op een telefoon, dus ze worden
omgezet naar mono mp3 en ogg (samen ongeveer 90 kB):

```bash
npm run audio     # vereist ffmpeg
```

Geluid is uit te zetten via **Instellingen → Meldingen → Geluid**. Browsers
staan geen audio toe voordat er iets is aangeraakt, dus het openingsgeluid
probeert het direct en wacht anders kort op de eerste tik. Lukt het niet, dan
gebeurt er simpelweg niets — geen enkele functie hangt van geluid af.

---

## Pushmeldingen

Snatzee kan Web Push versturen naar de geïnstalleerde app. Dat is optioneel:
laat je de sleutels leeg, dan werkt de rest gewoon en meldt de instelling dat
het toestel geen meldingen ondersteunt.

### Sleutels genereren

```bash
node scripts/generate-vapid-keys.mjs
```

Of zonder Node op de server:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine node scripts/generate-vapid-keys.mjs
```

Plak de drie regels in `.env`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:jij@voorbeeld.nl
```

De publieke sleutel wordt in de build gebakken, dus na het wijzigen ervan is
een `docker compose up -d --build` nodig. **Genereer het paar één keer.** Een
nieuw paar maakt elke bestaande subscription ongeldig, en iedereen moet
meldingen opnieuw aanzetten.

### Wat er in de app gebeurt

| Situatie | Wat de gebruiker ziet |
| --- | --- |
| Ingelogd in een browsertab | Na anderhalve seconde een kaart die vraagt de app op het beginscherm te zetten. Die verdwijnt vanzelf na één minuut en blijft daarna een week weg. |
| Op Chromium/Android | De knop **Toevoegen** installeert de app echt, via het `beforeinstallprompt`-event van de browser. |
| Op iOS/iPadOS | De knop toont waar de deel-knop zit en welke optie je kiest. |
| Eerste start vanaf het beginscherm | Een kaart met de knop **Zet aan**, die de systeempopup voor meldingen opent en het toestel registreert. |
| Instellingen → Meldingen | De toggle **Pushmeldingen** en een knop om een testmelding naar je eigen toestellen te sturen. |

### Wat de platforms niet toestaan

Twee dingen uit de wenslijst kunnen technisch niet, op geen enkele iOS-versie:

- **Automatisch toevoegen aan het beginscherm.** Apple houdt dat bewust in het
  deelmenu; er is geen API voor. Alleen Chromium-browsers geven een installatie-
  event dat een knop kan afspelen, en dat gebruikt de app ook. Op iOS blijft er
  een instructie over.
- **De meldingenpopup automatisch laten verschijnen.** Elke browser eist dat
  `Notification.requestPermission()` uit een tik komt. Een aanvraag zonder tik
  wordt genegeerd, of — erger — meteen geweigerd, en een geweigerde melding is
  daarna alleen nog via de systeeminstellingen terug te draaien. Daarom staat er
  één knop klaar op het moment dat het relevant is, in plaats van een popup die
  zichzelf opwerpt.

Verder levert iOS push **alleen** aan een app die op het beginscherm staat. In
een Safari-tab bestaat `PushManager` niet, dus daar meldt de instelling dat de
app eerst geïnstalleerd moet worden.

### Welke meldingen de app zelf stuurt

| Wanneer | Wie krijgt hem |
| --- | --- |
| Iemand stuurt een vriendschapsverzoek | De ontvanger van het verzoek |
| Iemand voegt je toe aan een groep | Het toegevoegde lid — niet jijzelf als je de groep maakt of met een code binnenkomt |
| Iemand gaat over de hoogste score heen | De speler die de toppositie kwijtraakt |

Die momenten worden door de database bepaald, niet door de app: triggers
schrijven een regel in `notification_outbox`. Alleen Postgres ziet elke score
binnenkomen, en alleen de Next.js-server kan een pushbericht ondertekenen, dus
daar komen ze samen. De app vraagt na elke actie — en bij elke start — om de
wachtrij te legen via `POST /api/push/drain`.

Een gelijkspel neemt de koppositie niet over: wie de score als eerste haalde,
houdt hem. Je eigen record verbeteren stuurt niemand een melding.

### Een eigen melding sturen (superadmin)

**Instellingen → Snatzee Admin → Meldingen.** Alleen een superadmin ziet die
link, de pagina stuurt iedereen zonder die rol terug naar `/app`, en
`admin_broadcast_notification` weigert de aanvraag in de database zelf. Er is
dus geen weg omheen: een gewone gebruiker kan het scherm niet zien en de
onderliggende aanroep niet doen.

Je vult een titel (max 80 tekens) en een tekst (max 300) in, en kiest
**Iedereen** of **Selectie**. Bij een selectie staat elke speler in de lijst,
maar spelers zonder meldingen aan zijn uitgegrijsd en tellen niet mee — zodat
duidelijk is waarom iemand niets ontvangt. Elke verzending komt in het auditlog
te staan, met titel, tekst en het aantal ontvangers.

### Zelf meldingen versturen

`src/lib/push-server.ts` is het verzendkanaal: `sendPushToUser(userId, payload)`
en `sendPushToUsers(userIds, payload)`. Beide lezen de subscriptions met de
service role — RLS verbergt ze voor iedereen behalve de eigenaar — en ruimen
endpoints op die de pushdienst afkeurt met 404 of 410. De service worker toont
wat binnenkomt en opent bij een tik de meegestuurde `url` in een bestaand
venster als dat er is.

De outbox is de plek om een nieuwe melding aan te haken: schrijf er vanuit een
trigger een regel in met `queue_notification(...)` en de rest — versturen,
opruimen van dode endpoints, het auditlog — gebeurt vanzelf.

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
score_entries      user_id, score, is_win, yahtzee_count, played_at, note
yahtzee_events     user_id, event_type (FIRST_ROLL; NORMAL alleen historisch)
friendships        requester_id, addressee_id, status (pending | accepted | declined)
groups             owner_id, name, emoji, description, invite_code
group_members      group_id, user_id, role (owner | admin | member)
achievements       key, name, description, icon, rarity, category, is_secret, criteria
user_achievements  user_id, achievement_id, unlocked_at, source_id
app_settings       key, value (jsonb)
admin_allowlist    email, role  — rollen die vooraf worden toegekend
player_levels      key, name, emoji, min_games
admin_audit_log    admin_user_id, action, target_user_id, entity_type, metadata
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

### Achievements volgen de data terug omlaag

Een achievement is geen logboekregel maar een afgeleide: hij geldt zolang de
data hem draagt. Verwijdert een superadmin een score of een 1-worp Yahtzee, dan
worden de achievements die daarop steunden meteen weer ingetrokken, en het
auditlog noteert welke dat waren. Hetzelfde gebeurt als een speler een groep
verlaat of een vriendschap verdwijnt.

De regels staan één keer, in `achievement_is_earned(...)`. Zowel het toekennen
als het intrekken gebruikt die functie, zodat de twee niet uit elkaar kunnen
lopen.


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
      admin/                adminconsole (alleen superadmin)
    auth/confirm/           landingspagina voor bevestigingsmails
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
supabase/migrations/        SQL migraties (0001 t/m 0013)
docker/
  postgres/init/            rollen en rechten, draait bij eerste start
  postgres/supabase-compat.sql  auth.uid() c.s. voor de zelf-gehoste stack
  nginx/                    gateway die alles op poort 6666 samenbrengt
  db-prepare.sh            zet servicewachtwoorden en -rechten goed
  migrate.sh               zet het schema klaar zodra de services er zijn
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
- Web Push via de service worker (`push`, `notificationclick`, `pushsubscriptionchange`),
  met de installatie- en meldingenkaarten uit [Pushmeldingen](#pushmeldingen)

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
| `npm run audio` | Encodeer de geluiden opnieuw vanuit `brand/audio` |
| `node scripts/generate-keys.mjs` | Genereer de geheimen voor de Docker-stack |
| `node scripts/generate-vapid-keys.mjs` | Genereer het VAPID-sleutelpaar voor pushmeldingen |
