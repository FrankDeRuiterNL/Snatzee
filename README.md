# Snatzee 🎲

**Een sociale score- en statistiekenapp voor mensen die Yahtzee spelen.**

Snatzee vervangt het papieren scoreblaadje **niet**. Je speelt een normaal potje
met het fysieke formulier en voert daarna alleen je **eindscore** in. Snatzee
houdt vanaf daar je records, statistieken, achievements, vrienden en ranglijsten
bij.

Mobile-first PWA, te installeren op het homescreen van iPhone en Android. De
volledige stack — database, auth, API, opslag en de app zelf — draait in Docker;
een account bij een externe dienst is niet nodig.

---

## Inhoud

- [Functionaliteit](#functionaliteit)
- [Techniek](#techniek)
- [Snel starten](#snel-starten)
- [Configuratie](#configuratie)
- [Bijwerken](#bijwerken)
- [Beheer en onderhoud](#beheer-en-onderhoud)
- [Architectuur](#architectuur)
- [Ontwikkelen](#ontwikkelen)

---

## Functionaliteit

**Potjes en Yahtzee's**
Een potje toevoegen is één sheet: eindscore via een rolpicker (0–1575, ongeldige
combinaties zijn niet te kiezen), gewonnen ja/nee, aantal Yahtzees en optioneel
een notitie. Een Yahtzee in de eerste worp registreer je apart, met een
bevestiging vooraf zodat een misklik geen record vervuilt, en met een
celebratie als het lukt.

**Statistieken en ranglijsten**
Zes ranglijsten (hoogste score, gemiddelde, potjes, wins, Yahtzee's, Yahtzee's
in één worp), elk te bekijken wereldwijd, onder vrienden of binnen een groep.
Daarnaast grafieken over je scoreverloop, je win-ratio en je records.

**Achievements en levels**
36 achievements in vier zeldzaamheidsklassen, en vijf spelerniveaus die
meegroeien met het aantal gespeelde potjes. Beide worden afgeleid uit de data en
niet gelogd: verdwijnt de onderbouwing, dan verdwijnt de achievement mee.

**Vrienden**
Zoeken op naam of username, verzoeken sturen, en een Verzoeken-tab met zowel
ontvangen verzoeken (accepteren of weigeren) als verzonden verzoeken (intrekken).
Speelt iemand nog geen Snatzee, dan deelt de Zoeken-tab een uitnodiging via het
deelmenu van het toestel.

**Groepen**
Groepen met eigen ranglijsten. Uitnodigen gaat via **Uitnodigen → Kopieer ID of
QR Code**; meedoen via **Groep joinen → QR Code scannen of Code invoeren**. De
QR bevat een volledige link, dus ook de gewone camera-app van een telefoon kan
hem openen.

**Pushmeldingen**
Optioneel, en alleen naar de geïnstalleerde app. Zie
[Meldingen](#meldingen) voor wanneer er een uitgaat.

**Beheer**
Een adminconsole voor superadmins: scores en 1-worp Yahtzee's doorzoeken en
verwijderen, alle groepen beheren, een eigen melding sturen, app-instellingen en
rollen aanpassen en achievements van een speler resetten. Alles wat verwijdert
of verstuurt komt in het auditlog.

**PWA**
Installeerbaar, werkt offline voor de app-shell, pull-to-refresh, veilige-zone
support, geen dubbeltap-zoom en geen horizontaal scrollen.

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
| Database | PostgreSQL (zelf-gehoste Supabase-stack) |
| Auth | Supabase Auth — e-mail/wachtwoord, Apple, Google |
| Security | Row Level Security + `SECURITY DEFINER` RPC's |
| Push | Web Push met VAPID (`web-push`, `jsqr`, `qrcode`) |
| Hosting | Docker Compose op poort **6666**, of Vercel + gehost Supabase |

---

## Snel starten

Vereist: Docker met Compose v2. Verder niets — Node is alleen nodig om lokaal te
ontwikkelen.

```bash
git clone https://github.com/FrankDeRuiterNL/Snatzee.git
cd Snatzee
cp .env.example .env
```

**1. Geheimen genereren**

```bash
node scripts/generate-keys.mjs
# Geen Node op de server? Dan via Docker:
docker run --rm -v "$PWD":/app -w /app node:22-alpine node scripts/generate-keys.mjs
```

Plak de vier regels (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
`SERVICE_ROLE_KEY`) in `.env`. Wil je pushmeldingen, doe dan hetzelfde met
`node scripts/generate-vapid-keys.mjs`.

**2. Je adres invullen**

Zet `PUBLIC_URL` op het adres waarop mensen de app openen. Dit is het
belangrijkste veld: OAuth-redirects, e-maillinks, opgeslagen avatar-URL's en de
PWA-installatie hangen ervan af.

```bash
PUBLIC_URL=http://localhost:6666        # lokaal
PUBLIC_URL=https://www.snatzee.nl       # productie
```

**3. Starten**

```bash
docker compose up -d --build
```

De eerste start duurt enkele minuten: images downloaden, de app bouwen en het
schema aanmaken. Compose start alles in de juiste volgorde, dus één commando is
genoeg.

**4. Controleren**

```bash
docker compose ps                    # alles "running" behalve db-prepare en migrate: die horen "exited (0)"
docker compose logs --tail=20 migrate    # eindigt op "Schema is up to date."
curl -I http://localhost:6666/api/health # 200
```

Open het adres, maak een account en je bent binnen.

---

## Configuratie

Alles staat in `.env`. De volledige lijst met toelichting staat in
`.env.example`; dit zijn de velden die ertoe doen.

| Variabele | Waarvoor |
| --- | --- |
| `PUBLIC_URL` | Het canonieke adres. Eén waarde, geen tweede actieve regel. |
| `HTTP_PORT` | Gepubliceerde poort van de gateway (standaard `6666`). |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` | Uit `generate-keys.mjs`. |
| `ADDITIONAL_REDIRECT_URLS` | Elk domein waarvandaan iemand mag inloggen. |
| `MAILER_EXTERNAL_HOSTS` | Elke hostnaam die in bevestigingslinks mag staan. |
| `MAILER_AUTOCONFIRM` | `true` zolang er geen SMTP is: accounts zijn dan meteen actief. |
| `SMTP_*` | Mailserver voor bevestigings- en herstelmails. |
| `GOOGLE_ENABLED`, `APPLE_ENABLED` | Zetten de provider én de knop in de app aan. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Pushmeldingen. Leeg laten schakelt push uit. |

### Meerdere domeinen

De app volgt de adresbalk: de browser praat met de Supabase-API's op het domein
waar hij al is, omdat de gateway ze op dezelfde origin serveert. Extra domeinen
vragen dus geen rebuild en geen extra variabelen — wijs ze naar deze host en zet
ze in `ADDITIONAL_REDIRECT_URLS` en `MAILER_EXTERNAL_HOSTS`. `PUBLIC_URL` bepaalt
welk domein in mails en gedeelde links staat.

> Avatar-URL's worden absoluut opgeslagen. Wissel je van canoniek domein, werk
> ze dan bij:
> ```bash
> docker compose exec db psql -U postgres -d postgres -c \
>   "update public.profiles set avatar_url = replace(avatar_url,'https://oud.example','https://nieuw.example') where avatar_url like 'https://oud.example%';"
> ```

### Achter een reverse proxy met HTTPS

De stack luistert op `HTTP_PORT` en verwacht TLS-terminatie ervoor. Geef
`X-Forwarded-Proto` en `X-Forwarded-Host` door; zonder die headers stuurt de app
callbacks naar een intern adres dat de browser niet kan bereiken.

### Apple en Google

Autorisatie-URI in Google Cloud Console en return-URL in je Apple Service ID:

```
${PUBLIC_URL}/auth/v1/callback
```

Staat de provider op `false`, dan verdwijnt de knop ook uit de app — een knop
die naar een doodlopend eind leidt is erger dan geen knop.

### Pushmeldingen

```bash
node scripts/generate-vapid-keys.mjs
```

Plak `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` en `VAPID_SUBJECT` in `.env` en
bouw opnieuw. **Genereer het paar één keer**: een nieuw paar maakt elke
bestaande subscription ongeldig.

Twee dingen kunnen technisch niet, op geen enkele iOS-versie:

- **Automatisch aan het homescreen toevoegen.** Apple houdt dat in het
  deelmenu. Alleen Chromium-browsers geven een installatie-event dat een knop
  kan afspelen; daar installeert de knop echt. Op iOS toont hij de instructie.
- **De meldingenpopup vanzelf laten verschijnen.** Elke browser eist dat
  `Notification.requestPermission()` uit een tik komt. Daarom staat er één knop
  klaar op het moment dat het relevant is.

iOS levert push bovendien alleen aan een app die op het homescreen staat; in een
Safari-tab bestaat `PushManager` niet.

---

## Bijwerken

```bash
cd /pad/naar/Snatzee
git pull

# 1. App-image opnieuw bouwen: nieuwe dependencies en alle NEXT_PUBLIC_*
#    waarden worden in de build gebakken.
docker compose build app

# 2. Nieuwe migraties toepassen.
docker compose up -d --force-recreate migrate

# 3. De rest doorrollen.
docker compose up -d
```

`--force-recreate` op stap 2 is geen luxe: de migraties zijn een bind-mount, dus
een bestand erbij verandert de containerconfiguratie niet en of Compose de stap
uit zichzelf herhaalt hangt af van je versie. Migraties zijn idempotent, dus een
keer te vaak draaien kan geen kwaad — een keer te weinig wel.

Vuistregels:

- Iets met `NEXT_PUBLIC_` gewijzigd (VAPID-publieke sleutel, OAuth-vlaggen, adres)
  → eerst `docker compose build app`.
- Alleen runtime-secrets gewijzigd (SMTP, `VAPID_PRIVATE_KEY`, OAuth-secrets)
  → `docker compose up -d` volstaat.
- Klaagt de app na een update over een functie die niet in de schema cache staat
  → `docker compose restart rest`.

---

## Beheer en onderhoud

```bash
# Logs volgen
docker compose logs -f app
docker compose logs -f auth

# Herstarten zonder de database aan te raken
docker compose restart app

# Stoppen (data blijft behouden)
docker compose down

# Stoppen én ALLE data wissen
docker compose down -v
```

### Back-ups

Alle data staat in twee volumes: `snatzee_db-data` en `snatzee_storage-data`.

```bash
# Database dumpen
docker compose exec -T db pg_dump -U postgres postgres | gzip > snatzee-$(date +%F).sql.gz

# Terugzetten
gunzip -c snatzee-2026-01-01.sql.gz | docker compose exec -T db psql -U postgres postgres

# Avatars
docker run --rm -v snatzee_storage-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/avatars.tar.gz -C /data .
```

### Geheimen wijzigen

`JWT_SECRET` wijzigen maakt `ANON_KEY` en `SERVICE_ROLE_KEY` ongeldig: genereer
ze samen opnieuw met `generate-keys.mjs`, zet alle drie in `.env` en herbouw.
Bestaande sessies worden daarmee ongeldig; wachtwoorden en data blijven.

`POSTGRES_PASSWORD` wijzigen vraagt ook een herstart van `db-prepare`, dat de
servicewachtwoorden zet.

### Rollen

Drie rollen: `user`, `admin` en `superadmin`. Een e-mailadres kan **vooraf**
worden aangewezen — dus voordat het account bestaat — via `admin_allowlist`:
bij registratie krijgt het account direct de juiste rol. Daarna kent een
superadmin rollen toe in **Instellingen → Snatzee Admin → Beheer**.

### Problemen oplossen

| Symptoom | Oorzaak |
| --- | --- |
| `migrate` stopt op ontbrekende `auth.users` of `storage.objects` | `auth` of `storage` is niet gezond opgekomen. Bekijk hun logs. |
| Auth logt `must be owner of function uid` | `db-prepare` heeft niet gedraaid. `docker compose up -d --force-recreate db-prepare`. |
| `password authentication failed for user "supabase_storage_admin"` | Idem: `db-prepare` zet die wachtwoorden. |
| API geeft 404 op een RPC | PostgREST heeft een oude schema cache. `docker compose restart rest`. |
| OAuth-knop ontbreekt | `GOOGLE_ENABLED` / `APPLE_ENABLED` staan op `false`, of er is niet herbouwd. |
| Meldingen-toggle zegt "niet ondersteund" in de geïnstalleerde app | `VAPID_PUBLIC_KEY` ontbrak tijdens de build. |
| QR scannen doet niets | De camera werkt alleen op een https-adres. |

---

## Architectuur

### Services

Acht containers in één compose-stack, in deze volgorde opgestart:

```
db → db-prepare → auth + rest → storage → migrate → app → gateway
```

| Service | Rol |
| --- | --- |
| `db` | PostgreSQL (`supabase/postgres`) met de Supabase-rollen en -schema's |
| `db-prepare` | Zet servicewachtwoorden en -rechten goed; eenmalig per start |
| `auth` | GoTrue: registratie, login, OAuth, mails |
| `rest` | PostgREST: de REST-API op het schema |
| `storage` | storage-api: avatars |
| `migrate` | Past `supabase/migrations/*.sql` toe en herlaadt de schema cache |
| `app` | Next.js in standalone modus |
| `gateway` | nginx; serveert app en API's op één origin en één poort |

Die ene origin is wat meerdere domeinen mogelijk maakt: de browser hoeft nooit
cross-origin te praten, dus er is geen ingebakken API-adres dat maar naar één
domein kan wijzen.

### Datamodel

| Tabel | Inhoud |
| --- | --- |
| `profiles` | Gebruiker, username, avatar, bio, rol, privacy |
| `score_entries` | Eén rij per potje: score, gewonnen, aantal Yahtzees, notitie |
| `yahtzee_events` | Losse Yahtzee-momenten (`FIRST_ROLL`) |
| `friendships` | Verzoek en vriendschap in één rij, met status |
| `groups` / `group_members` | Groepen en lidmaatschappen |
| `achievements` / `user_achievements` | Definities en wat er is behaald |
| `player_levels` | Drempels per niveau, aanpasbaar zonder deploy |
| `push_subscriptions` | Eén rij per toestel, uniek op endpoint |
| `notification_outbox` | Wachtrij met te versturen meldingen |
| `app_settings` | Configureerbare grenzen |
| `admin_audit_log` | Wat een superadmin verwijderde of verstuurde |

Migraties staan in `supabase/migrations/` (0001 t/m 0018) en zijn stuk voor stuk
idempotent: opnieuw draaien is altijd veilig.

### Twee soorten Yahtzee

Gewone Yahtzee's horen bij een potje en staan op de score-entry zelf
(`score_entries.yahtzee_count`) — je weet het aantal pas als het potje klaar is.
Een Yahtzee in één worp is een los moment en blijft een eigen event. De
tellingen zijn onafhankelijk:

```
Yahtzee's totaal      = sum(score_entries.yahtzee_count)
Yahtzee's in één worp = count(yahtzee_events where FIRST_ROLL)
```

Een 1-worp Yahtzee wordt dus niet bij het potjestotaal opgeteld; dat zou dubbel
tellen, want bij het potje gaf je het aantal al op.

### Afgeleide statistieken en achievements

`user_statistics` is een view die alles uitrekent wat een profiel laat zien:
potjes, wins, gemiddelde, records, streaks, niveau en achievementcount. Niets
daarvan wordt bijgehouden in kolommen die uit de pas kunnen lopen.

Achievements volgen diezelfde regel. De voorwaarden staan één keer, in
`achievement_is_earned(...)`; zowel het toekennen als het intrekken gebruikt die
functie, zodat de twee niet kunnen gaan afwijken. Verwijdert een superadmin een
score, dan worden de achievements die daarop steunden automatisch ingetrokken en
noteert het auditlog welke dat waren.

### Meldingen

De database bepaalt **wat** een melding waard is, de Next.js-server bepaalt
**wanneer** hij uitgaat: alleen Postgres ziet elke score binnenkomen, en alleen
de server kan een pushbericht ondertekenen. Triggers schrijven in
`notification_outbox`, en `POST /api/push/drain` verstuurt wat klaarstaat. De
app pingt dat na elke actie die iets in de wachtrij zet en bij elke start, dus
er is geen aparte worker nodig.

| Wanneer | Wie krijgt hem |
| --- | --- |
| Iemand stuurt je een vriendschapsverzoek | De ontvanger; opent het tabblad Verzoeken |
| Iemand accepteert je verzoek | De verzender; opent het profiel van je nieuwe vriend |
| Iemand voegt je toe aan een groep | Het toegevoegde lid, niet jijzelf |
| Iemand gaat over de hoogste score heen | De speler die de toppositie kwijtraakt |
| Een groepslid registreert een potje | De andere leden van die groep |
| Een superadmin stuurt een bericht | Iedereen, of een selectie |

De groepsmelding vermeldt de score, of het potje gewonnen is, hoeveel Yahtzees
erin zaten en de positie in die groep daarna, bijvoorbeeld *"Ann scoorde 325
punten · gewonnen · 2× Yahtzee · nu #1 van 2"*. Hij gaat één keer per gedeelde
groep, want een positie betekent alleen iets binnen een groep.

Wie geen meldingen aan heeft krijgt geen rij in de wachtrij, dus die loopt niet
vol met onbestelbare berichten. Endpoints die de pushdienst afkeurt worden
opgeruimd.

Een eigen melding aanhaken doe je met `queue_notification(...)` vanuit een
trigger; versturen, opruimen en het auditlog gaan vanzelf.

### Security

- **RLS op alles.** Score-entries en meldingen zijn strikt van de eigenaar;
  profielen zijn openbaar leesbaar maar alleen door jezelf te wijzigen.
- **Mutaties via RPC's.** Validatie staat in `SECURITY DEFINER`-functies, zodat
  de client nooit de enige controle is.
- **Adminfuncties controleren zelf.** `/app/admin` stuurt anderen weg, maar de
  echte grens ligt in de database: elke adminfunctie roept `is_superadmin()`
  aan voordat ze iets teruggeeft.
- **Aggregaten via views.** Ranglijsten en publieke statistieken lopen via views
  die met de rechten van de eigenaar draaien, zodat losse rijen verborgen
  blijven.
- **Rolwijzigingen zijn afgeschermd.** Een trigger blokkeert het aanpassen van
  `profiles.role` buiten `set_user_role()` om.

---

## Ontwikkelen

```bash
npm install
cp .env.example .env.local     # vul NEXT_PUBLIC_SUPABASE_URL en _ANON_KEY
npm run dev
```

Wijs `.env.local` naar een draaiende Docker-stack (`http://localhost:6666`) of
naar een gehost Supabase-project. Draai bij een leeg project eerst de migraties
uit `supabase/migrations/` in volgorde.

Voor **gehost Supabase** volstaan drie variabelen:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
`NEXT_PUBLIC_SITE_URL`. Laat `NEXT_PUBLIC_SUPABASE_SAME_ORIGIN` dan weg.

### Demo data

```bash
npm run seed     # alleen tegen een development-database
```

Maakt een stel spelers met potjes, Yahtzees, vriendschappen en een groep, zodat
ranglijsten en grafieken gevuld zijn.

### Configureerbare grenzen

`app_settings` bevat waarden die de app leest zonder deploy, zoals het
minimumaantal potjes voor de gemiddelde-ranking en de laagst en hoogst
toegestane score. Aan te passen in **Snatzee Admin → Beheer**.

### Brand assets

Iconen, splashscreens en geluiden worden gegenereerd uit de bronbestanden in
`brand/`:

```bash
npm run brand    # 16 app-iconen, 2 maskable, 36 iOS-splashscreens, logo-assets
npm run audio    # zet de WAV-bronnen om naar mono mp3 + ogg (vereist ffmpeg)
```

Vervang de bronbestanden en draai opnieuw om de hele set te vernieuwen; de
artwork wordt automatisch op zijn eigen inhoud bijgesneden.

### Scripts

| Commando | Wat het doet |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Productiebuild (standalone output) |
| `npm run start` | Productieserver |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript zonder emit |
| `npm run seed` | Demo data |
| `npm run brand` | Iconen en splashscreens genereren |
| `npm run audio` | Geluiden encoderen |
| `node scripts/generate-keys.mjs` | Geheimen voor de Docker-stack |
| `node scripts/generate-vapid-keys.mjs` | VAPID-sleutelpaar voor pushmeldingen |

### Projectstructuur

```
src/
  app/
    page.tsx                landing
    login/ register/        auth
    onboarding/             onboarding
    auth/callback/          OAuth
    auth/confirm/           bevestigingsmails
    u/[username]/           publiek profiel
    api/                    health + push (drain, broadcast, test)
    app/                    ingelogde app
      page.tsx              home
      rankings/ history/ achievements/ statistics/
      friends/ groups/[id]/ profile/ settings/
      admin/                adminconsole (superadmin)
  components/
    ui/                     Button, Input, BottomSheet, Marquee, WheelPicker, …
    layout/                 navigatie, pull-to-refresh, quick actions
    home/ score/ rankings/ achievements/ friends/ groups/ profile/ stats/
    admin/ pwa/
  lib/
    supabase/               browser-, server- en middleware-clients + queries
    push.ts push-server.ts  Web Push, client en verzendkant
    image.ts invite.ts pwa.ts audio.ts haptics.ts
  types/database.ts         types die het SQL-schema spiegelen
supabase/migrations/        SQL migraties (0001 t/m 0018)
docker/
  postgres/supabase-compat.sql  auth.uid() c.s. voor de zelf-gehoste stack
  nginx/                    gateway op één poort
  db-prepare.sh migrate.sh
scripts/                    seed, brand assets, sleutelgeneratie
```
