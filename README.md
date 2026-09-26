# Snatzee 🎲

**Een sociale score- en statistiekenapp voor mensen die Yahtzee spelen.**

Snatzee vervangt het papieren scoreblaadje **niet**. Je speelt een normaal potje
met het fysieke formulier en voert daarna je score in — alleen de eindscore, of
het hele scoreblad als je wilt. Snatzee houdt vanaf daar je records,
statistieken, achievements, vrienden en ranglijsten bij.

Er zijn twee apps op één backend:

- **De website**: een mobile-first PWA, te installeren op het homescreen van
  iPhone en Android.
- **De iOS-app**: native SwiftUI, met dezelfde functies, look en data
  (`ios/`). Beheer blijft op de website.

De volledige backend — database, auth, API, opslag en de website — draait in
Docker; een account bij een externe dienst is niet nodig.

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
- [iOS-app](#ios-app)

---

## Functionaliteit

**Potjes en Yahtzee's**
Een potje toevoegen is één sheet. Kies de eindscore met een rolpicker (0–1575,
ongeldige combinaties zijn niet te kiezen) of vul het scoreblad per vak in:
per vak zijn alleen waarden te kiezen die kunnen, de vakken met een vaste
waarde (Full house, Kleine en Grote straat, Topscore) zijn een vinkje, en de
bonussen en totalen rekent Snatzee zelf uit. Daarbij gewonnen ja/nee, het
aantal Yahtzees en optioneel een notitie. Een Yahtzee in de eerste worp
registreer je apart, met een bevestiging vooraf zodat een misklik geen record
vervuilt, en met een celebratie als het lukt. Potjes zijn achteraf te bewerken
en te verwijderen.

Op de website kan een potje ook via een foto van het papieren scoreblad worden
ingevoerd; die functie staat achter de instelling `scoresheet_scan` (standaard
uit).

**Statistieken en ranglijsten**
Zes ranglijsten (hoogste score, gemiddelde, potjes, wins, Yahtzee's, Yahtzee's
in één worp), elk te bekijken wereldwijd, onder vrienden of binnen een groep.
Daarnaast een scorehistorie met filters, grafieken over je scoreverloop, je
vorm over de laatste tien potjes, je win-ratio en je records.

**Achievements en levels**
36 achievements in vier zeldzaamheidsklassen, en vijf spelerniveaus die
meegroeien met het aantal gespeelde potjes. Beide worden afgeleid uit de data en
niet gelogd: verdwijnt de onderbouwing, dan verdwijnt de achievement mee.

**Vrienden en profielen**
Zoeken op naam of username, verzoeken sturen, en een Verzoeken-tab met zowel
ontvangen verzoeken (accepteren of weigeren) als verzonden verzoeken (intrekken).
Speelt iemand nog geen Snatzee, dan deelt de Zoeken-tab een uitnodiging. Elke
speler heeft een publiek profiel; een privéprofiel toont de details alleen aan
vrienden.

**Groepen**
Groepen met eigen ranglijsten. Uitnodigen gaat via **Uitnodigen → Kopieer ID of
QR Code**; meedoen via **Groep joinen → QR Code scannen of Code invoeren**. De
QR bevat een volledige link, dus ook de gewone camera-app van een telefoon kan
hem openen — met de iOS-app geïnstalleerd opent hij direct in de app.

**Melden en blokkeren**
Op elk profiel kun je een speler melden (met een reden) of blokkeren. Een
blokkade haalt de ander weg uit zoeken, ranglijsten en meldingen en beëindigt
een vriendschap. Meldingen komen bij de beheerders in de adminconsole.

**Account**
Inloggen met e-mail en wachtwoord of met Sign in with Apple. Wachtwoord vergeten
gaat via een herstellink per mail, die op elk apparaat werkt. Een account is
zelf te verwijderen in Instellingen; dat wist alle data en trekt bij een
Apple-account ook de koppeling met Apple in.

**Pushmeldingen**
Optioneel: via Web Push naar de geïnstalleerde website en via APNs naar de
iOS-app. Zie [Meldingen](#meldingen) voor wanneer er een uitgaat.

**Beheer**
Een adminconsole op de website voor superadmins: scores en 1-worp Yahtzee's
doorzoeken en verwijderen, alle groepen beheren, meldingen van spelers
afhandelen, een eigen pushbericht sturen, app-instellingen en rollen aanpassen
en achievements van een speler resetten. Alles wat verwijdert of verstuurt komt
in het auditlog.

**Juridisch**
Privacybeleid, voorwaarden en een supportpagina op `/privacy`, `/voorwaarden`
en `/support`, zonder account te lezen. Bij het aanmaken van een account wordt
ernaar verwezen.

**PWA**
Installeerbaar, werkt offline voor de app-shell, pull-to-refresh, veilige-zone
support, geen dubbeltap-zoom en geen horizontaal scrollen.

---

## Techniek

| Laag | Keuze |
| --- | --- |
| Website | Next.js 16 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4 met een eigen design-tokenset |
| Componenten | Radix primitives + eigen componentlaag |
| Animatie | Framer Motion |
| Iconen | Lucide (op iOS dezelfde glyphs, geëxporteerd naar de asset catalog) |
| Grafieken | Recharts (website), Swift Charts (iOS) |
| iOS-app | SwiftUI, iOS 17+, supabase-swift, project via XcodeGen |
| Database | PostgreSQL (zelf-gehoste Supabase-stack) |
| Auth | Supabase Auth (GoTrue) — e-mail/wachtwoord en Sign in with Apple |
| Security | Row Level Security + `SECURITY DEFINER` RPC's |
| Push | Web Push met VAPID, en APNs (HTTP/2, token-based) voor iOS |
| Hosting | Docker Compose achter één poort (standaard **6666**) |
| Tests / CI | Node test runner, SQL-tests tegen Postgres, XCTest; GitHub Actions |

---

## Snel starten

Vereist: Docker met Compose v2. Verder niets — Node is alleen nodig om lokaal te
ontwikkelen.

```bash
git clone <repository-url> Snatzee
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
PUBLIC_URL=http://localhost:6666          # lokaal
PUBLIC_URL=https://snatzee.example.nl     # productie
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
| `ALLOWED_HOSTS` | Domeinen waarvoor de app redirects mag bouwen (komma-gescheiden). Leeg accepteert elke Host-header. |
| `HTTP_PORT` | Gepubliceerde poort van de gateway (standaard `6666`). |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` | Uit `generate-keys.mjs`. |
| `ADDITIONAL_REDIRECT_URLS` | Elk domein waarvandaan iemand mag inloggen. |
| `MAILER_EXTERNAL_HOSTS` | Elke hostnaam die in bevestigings- en herstellinks mag staan. |
| `MAILER_AUTOCONFIRM` | `true`: accounts zijn meteen actief, zonder bevestigingsmail. |
| `SMTP_*` | Mailserver voor bevestigings- en herstelmails. |
| `CONTACT_EMAIL` | Contactadres op `/privacy`, `/voorwaarden` en `/support`. Valt terug op `SMTP_ADMIN_EMAIL`. |
| `APPLE_ENABLED` | Zet Sign in with Apple aan in GoTrue (nodig voor de iOS-app). |
| `APPLE_WEB_ENABLED` | Toont ook de Apple-knop op de website. |
| `APPLE_CLIENT_ID`, `APPLE_SECRET` | Zie [Sign in with Apple](#sign-in-with-apple). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push. Leeg laten schakelt push op de website uit. |
| `APNS_*`, `APPLE_TEAM_ID`, `APPLE_SIGNIN_*`, `APPLE_APP_IDS` | iOS-app: push, intrekken bij accountverwijdering, universal links. Zie [iOS-app](#ios-app). |
| `PUSH_DRAIN_INTERVAL_SECONDS` | Hoe vaak de server de meldingen-wachtrij verstuurt (standaard 15; 0 = uit). |

### Meerdere domeinen

De app volgt de adresbalk: de browser praat met de Supabase-API's op het domein
waar hij al is, omdat de gateway ze op dezelfde origin serveert. Extra domeinen
vragen dus geen rebuild — wijs ze naar deze host en zet ze in
`ALLOWED_HOSTS`, `ADDITIONAL_REDIRECT_URLS` en `MAILER_EXTERNAL_HOSTS`.
`PUBLIC_URL` bepaalt welk domein in mails en gedeelde links staat.

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

### Sign in with Apple

Naast e-mail is Apple de enige manier om in te loggen.

- **iOS-app:** `APPLE_ENABLED=true` en de bundle ID van de app in
  `APPLE_CLIENT_ID` (zonder team-ID ervoor). Meer is niet nodig.
- **Website:** daarbovenop een **Services ID** in het Apple Developer-portaal,
  met je domeinen en als return-URL `${PUBLIC_URL}/auth/v1/callback`. Zet de
  Services ID vóór de bundle ID: `APPLE_CLIENT_ID=<services-id>,<bundle-id>`.
  `APPLE_SECRET` is een JWT die je zelf ondertekent met je Sign in with
  Apple-sleutel (`.p8`); hij is maximaal zes maanden geldig, dus vernieuw hem
  op tijd. Zet dan `APPLE_WEB_ENABLED=true` en bouw opnieuw.

Staat de provider uit, dan verdwijnt de knop ook — een knop die naar een
doodlopend eind leidt is erger dan geen knop.

### Wachtwoord herstellen

GoTrue verstuurt de herstelmail met een eigen, Nederlandstalig sjabloon dat de
app serveert op `/api/email-templates/recovery` (ingesteld in
`docker-compose.yml`). De link wijst naar `/wachtwoord-herstellen` met een
token-hash en werkt daardoor op elk apparaat — ook als het herstel in de
iOS-app werd aangevraagd. SMTP moet ingevuld zijn.

### Pushmeldingen (website)

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

iOS levert Web Push bovendien alleen aan een website die op het homescreen
staat; in een Safari-tab bestaat `PushManager` niet. De iOS-app gebruikt APNs en
heeft die beperking niet.

---

## Bijwerken

```bash
cd /pad/naar/Snatzee
git pull
docker compose up -d --build
```

Dat bouwt de app opnieuw, past nieuwe migraties toe en rolt de rest door. Pakt
Compose een nieuwe migratie niet op (de migraties zijn een bind-mount, dus een
bestand erbij verandert de containerconfiguratie niet), forceer die stap dan:

```bash
docker compose up -d --force-recreate migrate
```

Elke migratie draait maar één keer: `migrate.sh` houdt in
`snatzee_meta.schema_migrations` bij welke bestanden al zijn toegepast, dus een
keer te vaak starten kan geen kwaad.

Vuistregels:

- Iets met `NEXT_PUBLIC_` of een vlag die de website inbakt gewijzigd
  (VAPID-publieke sleutel, `APPLE_WEB_ENABLED`, adres) → opnieuw bouwen.
- Alleen runtime-secrets gewijzigd (SMTP, `VAPID_PRIVATE_KEY`, `APNS_*`,
  `APPLE_SECRET`) → `docker compose up -d` volstaat.
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
Bestaande sessies worden daarmee ongeldig; wachtwoorden en data blijven. De
iOS-app heeft de `ANON_KEY` ingebouwd: na een wijziging is ook een nieuwe
app-build nodig.

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
| Apple-knop ontbreekt | Website: `APPLE_WEB_ENABLED`, app: `APPLE_ENABLED` staat op `false`, of er is niet herbouwd. |
| Inloggen met Apple op de website mislukt | `APPLE_SECRET` verlopen (max. zes maanden) of Services ID niet vooraan in `APPLE_CLIENT_ID`. |
| Herstelmail komt niet aan | SMTP niet ingevuld; zie `docker compose logs auth`. |
| Meldingen-toggle zegt "niet ondersteund" in de geïnstalleerde website | `VAPID_PUBLIC_KEY` ontbrak tijdens de build. |
| Geen pushmeldingen in de iOS-app | `APNS_*` niet ingevuld, of `PUSH_DRAIN_INTERVAL_SECONDS=0`. |
| Links openen niet in de iOS-app | `APPLE_APP_IDS` leeg; controleer `/.well-known/apple-app-site-association`. |
| QR scannen doet niets op de website | De camera werkt alleen op een https-adres. |

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
| `auth` | GoTrue: registratie, login, Apple, mails |
| `rest` | PostgREST: de REST-API op het schema |
| `storage` | storage-api: avatars |
| `migrate` | Past `supabase/migrations/*.sql` toe en herlaadt de schema cache |
| `app` | Next.js in standalone modus; verstuurt ook de pushmeldingen |
| `gateway` | nginx; serveert app en API's op één origin en één poort |

Die ene origin is wat meerdere domeinen mogelijk maakt: de browser hoeft nooit
cross-origin te praten, dus er is geen ingebakken API-adres dat maar naar één
domein kan wijzen. De iOS-app praat met dezelfde gateway.

### Datamodel

| Tabel | Inhoud |
| --- | --- |
| `profiles` | Gebruiker, username, avatar, bio, rol, privacy |
| `score_entries` | Eén rij per potje: score, gewonnen, Yahtzees, notitie, optioneel het scoreblad |
| `yahtzee_events` | Losse Yahtzee-momenten (`FIRST_ROLL`) |
| `friendships` | Verzoek en vriendschap in één rij, met status |
| `groups` / `group_members` | Groepen en lidmaatschappen |
| `achievements` / `user_achievements` | Definities en wat er is behaald |
| `player_levels` | Drempels per niveau, aanpasbaar zonder deploy |
| `push_subscriptions` | Web Push: één rij per browser, uniek op endpoint |
| `apns_devices` | iOS-push: één rij per toestel, met sandbox/productie |
| `notification_outbox` | Wachtrij met te versturen meldingen |
| `user_blocks` / `content_reports` | Blokkades en meldingen van spelers |
| `app_settings` | Configureerbare grenzen en vlaggen |
| `admin_audit_log` | Wat een superadmin verwijderde of verstuurde |

Migraties staan in `supabase/migrations/` (0001 t/m 0023). Elk bestand draait één
keer; `snatzee_meta.schema_migrations` houdt bij welke al zijn toegepast. Een
bestaande migratie aanpassen heeft dus geen effect meer op een draaiende
installatie — schrijf een nieuwe. Een bestand toch opnieuw laten draaien:

```bash
docker compose exec db psql -U postgres -c \
  "delete from snatzee_meta.schema_migrations where filename = '0023_ios_groundwork.sql'"
docker compose up -d --force-recreate migrate
```

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

### Het scoreblad

De regels van het scoreblad — welke waarden elk vak mag hebben, de bonus van 35
vanaf 63 in de bovenste helft, en 100 per extra Yahtzee als het Topscore-vak 50
bevat — staan drie keer, bewust gelijk gehouden: in `src/lib/scoresheet/sheet.ts`,
in `ios/Snatzee/Core/ScoreSheet.swift` en in `sheet_total()` in de database, die
elk opgeslagen scoreblad controleert. Unit tests op beide platforms bewaken
dat ze hetzelfde blijven rekenen.

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
`notification_outbox`; de server verstuurt wat klaarstaat elke
`PUSH_DRAIN_INTERVAL_SECONDS` seconden, en meteen wanneer een actie iets in de
wachtrij zet. Elk bericht gaat naar alle toestellen van de ontvanger: Web Push
naar browsers, APNs naar de iOS-app.

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
vol met onbestelbare berichten. Endpoints en toestellen die de pushdienst
afkeurt worden opgeruimd. Een eigen melding aanhaken doe je met
`queue_notification(...)` vanuit een trigger; versturen, opruimen en het
auditlog gaan vanzelf.

### Security

- **RLS op alles.** Score-entries en meldingen zijn strikt van de eigenaar;
  profielen zijn openbaar leesbaar maar alleen door jezelf te wijzigen.
- **Mutaties via RPC's.** Validatie staat in `SECURITY DEFINER`-functies, zodat
  de client nooit de enige controle is. Website en iOS-app gebruiken dezelfde
  functies.
- **Adminfuncties controleren zelf.** `/app/admin` stuurt anderen weg, maar de
  echte grens ligt in de database: elke adminfunctie roept `is_superadmin()`
  aan voordat ze iets teruggeeft.
- **Aggregaten via views.** Ranglijsten en publieke statistieken lopen via views
  die met de rechten van de eigenaar draaien, zodat losse rijen verborgen
  blijven.
- **Rolwijzigingen zijn afgeschermd.** Een trigger blokkeert het aanpassen van
  `profiles.role` buiten `set_user_role()` om.
- **API-routes voor beide apps.** `/api/*` accepteert de sessie-cookie van de
  website én een `Authorization: Bearer`-token van de iOS-app.
- **Redirects alleen naar eigen paden en domeinen** (`ALLOWED_HOSTS`).

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

### Tests en CI

```bash
npm test          # unit tests (scoreblad, APNs, URL's, utils)
npm run test:db   # migraties + SQL-tests (RLS, RPC's) tegen een wegwerp-Postgres; nooit een echte database
npm run typecheck
npm run lint
```

GitHub Actions draait bij elke push `ci.yml`: typecheck, lint, tests en een
build, en daarnaast alle migraties twee keer plus de SQL-tests tegen Postgres.
Bij wijzigingen in `ios/` draait `ios.yml`: XcodeGen, build en XCTest op een
simulator, plus een Release-build voor een toestel.

### Demo data

```bash
npm run seed     # alleen tegen een development-database
```

Maakt een stel spelers met potjes, Yahtzees, vriendschappen en een groep, zodat
ranglijsten en grafieken gevuld zijn.

### Configureerbare grenzen

`app_settings` bevat waarden die de apps lezen zonder deploy, zoals het
minimumaantal potjes voor de gemiddelde-ranking, de laagst en hoogst toegestane
score, `scoresheet_scan` en `min_ios_build` (zie [iOS-app](#ios-app)). Aan te
passen in **Snatzee Admin → Beheer**.

Daar staat ook **Startscherm bij openen** (alleen de website). Staat die aan,
dan toont de website bij het openen een tik-scherm met het logo en de knop
"Tijd voor Snatzee!". Dat bestaat om één reden: geen enkele browser speelt
geluid voordat er met de pagina iets is gedaan, en een app openen vanaf het
beginscherm is dat niet. De tik maakt er wél een interactie van, dus het
openingsgeluid speelt meteen. Het scherm verschijnt alleen wanneer het iets
oplost, en verdwijnt vanzelf na vier seconden. De iOS-app heeft het niet nodig:
die speelt het geluid bij het opstarten.

### Brand assets

Iconen, splashscreens en geluiden worden gegenereerd uit de bronbestanden in
`brand/`:

```bash
npm run brand    # app-iconen, maskables, iOS-splashscreens, logo's en het iOS-app-icoon
npm run audio    # zet de WAV-bronnen om naar mono mp3 + ogg (vereist ffmpeg)
node scripts/generate-ios-icons.mjs   # Lucide-iconen naar de iOS asset catalog
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
| `npm test` | Unit tests |
| `npm run test:db` | Migraties en SQL-tests tegen een wegwerp-Postgres |
| `npm run seed` | Demo data |
| `npm run brand` | Iconen en splashscreens genereren |
| `npm run audio` | Geluiden encoderen |
| `node scripts/generate-keys.mjs` | Geheimen voor de Docker-stack |
| `node scripts/generate-vapid-keys.mjs` | VAPID-sleutelpaar voor pushmeldingen |
| `node scripts/generate-ios-icons.mjs` | Iconen voor de iOS-app |

### Projectstructuur

```
src/
  app/
    page.tsx                landing
    login/ register/        auth
    wachtwoord-vergeten/ wachtwoord-herstellen/
    onboarding/             onboarding
    auth/callback/ auth/confirm/
    u/[username]/           publiek profiel
    privacy/ voorwaarden/ support/
    api/
      account/delete        account verwijderen (ook voor iOS)
      push/                 drain, broadcast, test
      apple-app-site-association   universal links voor de iOS-app
      email-templates/      mailsjablonen voor GoTrue
      health
    app/                    ingelogde website
      page.tsx              home
      rankings/ history/ achievements/ statistics/
      friends/ groups/[id]/ profile/ settings/
      admin/                adminconsole (superadmin)
  components/
    ui/ layout/ home/ score/ rankings/ achievements/ friends/ groups/
    profile/ stats/ admin/ auth/ legal/ pwa/
  lib/
    supabase/               browser-, server- en request-clients + queries
    scoresheet/             regels van het scoreblad
    push-server.ts push-worker.ts apns.ts apple.ts
  types/database.ts         types die het SQL-schema spiegelen
supabase/migrations/        SQL migraties (0001 t/m 0023)
tests/unit/ tests/sql/      tests
docker/                     compat-SQL, nginx-gateway, db-prepare, migrate
ios/                        de iOS-app (zie hieronder)
docs/                       API voor de iOS-app en de release-handleiding
scripts/                    seed, brand assets, sleutels, iOS-iconen, db-tests
```

---

## iOS-app

De native app staat in `ios/`: SwiftUI, iOS 17+, iPhone. Hij gebruikt dezelfde
backend, dezelfde RPC's en dezelfde huisstijl als de website, en heeft alle
functies behalve de adminconsole en het scannen van een scoreblad.

```bash
brew install xcodegen
cd ios
cp Config/Local.example.xcconfig Config/Local.xcconfig   # vul SNATZEE_ANON_KEY in
xcodegen generate
open Snatzee.xcodeproj
```

Het Xcode-project wordt gegenereerd uit `ios/project.yml` en staat niet in git;
draai `xcodegen generate` opnieuw na elke `git pull`. Welke server de app
gebruikt staat in `ios/Config/Shared.xcconfig` (host) en `Local.xcconfig`
(de publieke `ANON_KEY`).

**Backend-instellingen** (onder "iOS-app" in `.env.example`):

- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` — push via
  een APNs-sleutel (`.p8`) uit het Apple Developer-portaal.
- `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` — om bij
  het verwijderen van een account de koppeling met Apple in te trekken, zoals
  Apple eist.
- `APPLE_APP_IDS` — `<team-id>.<bundle-id>`; daarmee serveert de website
  `/.well-known/apple-app-site-association`, zodat profielen, uitnodigingen en
  meldingen in de app openen.

**Versies:** elke wijziging aan de app verhoogt `MARKETING_VERSION` in
`ios/project.yml` volgens Semantic Versioning en het buildnummer met een
willekeurig getal van 6 t/m 23; zie `CLAUDE.md` en `ios/CHANGELOG.md`.

**Compatibiliteit:** wat de app van de server verwacht en welke regels gelden
bij wijzigingen staat in [`docs/ios-api.md`](docs/ios-api.md). Breekt een
serverwijziging oudere app-versies toch, verhoog dan `min_ios_build` in
`app_settings`: oudere builds tonen dan een scherm om bij te werken.

**Uitbrengen:** TestFlight, de App Store-listing, privacy-antwoorden en de
review-notities staan stap voor stap in
[`docs/ios-release.md`](docs/ios-release.md).
