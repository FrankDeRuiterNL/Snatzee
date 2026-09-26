# Snatzee! iOS — TestFlight and App Store

The steps from a green `main` to a build on testers' phones, and later in
the App Store. Everything that can live in the repository already does; what
is left happens in Xcode and App Store Connect.

| | |
|---|---|
| App name | Snatzee! |
| Subtitle | Bijhouden van Yahtzee scores |
| Bundle ID | `nl.snatzee.app` (team `B65F8DKJ2N`) |
| SKU | `00000001` |
| Apple ID | `6816307907` |
| Primary language | Nederlands |

## 1. Before the first upload (once)

Server (`.env`, then `docker compose up -d --build`):

- `APNS_*` and `APPLE_*` filled in, `APPLE_CLIENT_ID=nl.snatzee.app`,
  `APPLE_APP_IDS=B65F8DKJ2N.nl.snatzee.app`.
- `CONTACT_EMAIL` — the address shown on `/privacy`, `/voorwaarden` and
  `/support`. Falls back to `SMTP_ADMIN_EMAIL`.
- Check in a browser:
  - `https://www.snatzee.nl/privacy`, `/voorwaarden`, `/support` open
    without logging in and show the right e-mail address;
  - `https://www.snatzee.nl/.well-known/apple-app-site-association`
    lists `B65F8DKJ2N.nl.snatzee.app`.

Apple Developer (developer.apple.com → Identifiers → `nl.snatzee.app`):
Push Notifications, Sign in with Apple and Associated Domains are enabled.
Xcode's automatic signing does this the first time you run on a device, so
it is normally already done.

## 2. Upload a build

On the Mac:

```bash
git pull
cd ios
xcodegen generate
open Snatzee.xcodeproj
```

1. Check `Config/Local.xcconfig` has the real `SNATZEE_ANON_KEY` (the same
   as `ANON_KEY` on the server). A build without it shows "configuratie
   ontbreekt" instead of the app.
2. Top bar: scheme **Snatzee**, destination **Any iOS Device (arm64)**.
3. **Product → Archive**. The Organizer opens when it is done.
4. **Distribute App → App Store Connect → Distribute**. Leave "Manage
   Version and Build Number" on: Xcode then raises the build number for
   every upload, so you never need to edit it yourself.
5. Wait for the e-mail "has completed processing" (5–30 minutes).

About push: `Snatzee.entitlements` says `aps-environment: development` —
that is correct. When Xcode signs the archive for distribution it switches
to production by itself, and the app then registers its token as
`production`, which the server uses to pick Apple's production push
service. Nothing to change.

## 3. TestFlight

App Store Connect → Snatzee! → **TestFlight**.

- **Export compliance** is answered in the app (`ITSAppUsesNonExemptEncryption
  = NO`: only standard HTTPS), so builds are available straight away.
- **Internal testing** (up to 100 people in your App Store Connect team):
  create a group, add yourself, add the build. No review needed; the build
  shows up in the TestFlight app within minutes.
- **External testing** (anyone, via e-mail or a public link): create a
  group, add the build, fill in **Test Information** (below). The first
  build of each version gets a short beta review (usually within a day).

Test information (Beta App Description):

> Snatzee houdt je Yahtzee-scores bij. Speel met je eigen scoreblaadje en
> voer na afloop je score in; Snatzee houdt records, statistieken,
> achievements en ranglijsten bij, en je kunt je cijfers vergelijken met
> vrienden en groepen.
>
> Wat we graag getest zien: potjes toevoegen en bewerken, vrienden
> toevoegen, een groep maken en joinen met de QR-code, en pushmeldingen.

What to test (per build): write what changed in that build.

## 4. App Store listing

App Store Connect → Snatzee! → **App Information** and the version page.

**Category:** Games → Board (secondary: Entertainment).

**URLs**

| | |
|---|---|
| Privacy Policy URL | `https://www.snatzee.nl/privacy` |
| Support URL | `https://www.snatzee.nl/support` |
| Marketing URL | `https://www.snatzee.nl` |

**Promotional text** (can change without a new build):

> Houd je Yahtzee-scores bij, verdien achievements en daag je vrienden uit
> in de ranglijsten.

**Description:**

> Snatzee! houdt je Yahtzee-scores bij, zodat jij alleen nog maar hoeft te
> gooien.
>
> Speel gewoon met je vertrouwde scoreblaadje en dobbelstenen. Voer na
> afloop je score in — of vul het hele scoreblad in — en Snatzee doet de
> rest: records, gemiddelden, grafieken en achievements worden automatisch
> bijgehouden.
>
> EÉN TIK PER POTJE
> Score invullen, gewonnen aanvinken, opslaan. Klaar binnen vijf seconden.
> Yahtzees registreer je los, met een aparte knop voor die ene Yahtzee in
> de eerste worp.
>
> STATISTIEKEN EN ACHIEVEMENTS
> Zie je vorm over de laatste tien potjes, je gemiddelde per maand en je
> hoogste score ooit. Speel 36 achievements vrij en klim in level.
>
> VRIENDEN EN GROEPEN
> Voeg je medespelers toe, maak een groep voor je familie of je
> vrijdagavondclub en nodig anderen uit met een QR-code. Zes ranglijsten
> laten zien wie er echt goed is met de dobbelstenen.
>
> MELDINGEN
> Krijg een seintje bij een vriendverzoek, een nieuwe groep of als iemand
> je record verbreekt.
>
> Snatzee is gratis, zonder advertenties en zonder tracking. Je account
> werkt ook op www.snatzee.nl.

**Keywords** (max. 100 characters):

```
yahtzee,yatzy,yatzee,dobbelen,dobbelstenen,scores,scoreblad,score,bordspel,spel,ranglijst,familie
```

**Copyright:** `2026 <your name>`

**Screenshots:** App Store Connect requires the 6.9-inch size (1320 × 2868
or 1290 × 2796); smaller iPhones are scaled from it. Take them on an iPhone
Pro Max, or in the **iPhone 16 Pro Max** simulator (⌘S saves a
screenshot). Three to six is enough: Home, the score sheet, Statistieken,
Ranglijsten, a group, Achievements. Use an account with some games played.

## 5. App Privacy

App Store Connect → **App Privacy**. Matches `PrivacyInfo.xcprivacy`.

- Do you or your third-party partners collect data? **Yes.**
- Tracking: **No** for every type. No data is used for advertising.

| Data type | Collected | Linked to the user | Purpose |
|---|---|---|---|
| Contact Info → Email Address | Yes | Yes | App Functionality |
| Contact Info → Name | Yes | Yes | App Functionality |
| User Content → Photos or Videos | Yes (profile photo) | Yes | App Functionality |
| User Content → Gameplay Content | Yes (scores) | Yes | App Functionality |
| User Content → Other User Content | Yes (bio, notes, reports) | Yes | App Functionality |
| Identifiers → User ID | Yes | Yes | App Functionality |

Everything else (location, contacts, health, browsing, diagnostics, usage
data, purchases, device ID): **not collected**.

## 6. Age rating

Answer **None / No** to everything, except:

- **User-generated content** (profiles, names, photos): **Yes** — covered
  by reporting, blocking and the terms.
- **Messaging and chat:** No (there is no free-text contact between
  players; bios are public profile text).
- **Gambling / simulated gambling:** No. Dice are rolled on a real table;
  the app only records scores and involves no betting or prizes.

## 7. App Review

Version page → **App Review Information**.

**Sign-in required:** yes. Create a review account first:

1. Register `appreview@<your domain>` with a password on the website (or in
   the app) and finish onboarding (username e.g. `appreview`).
2. Play a few games and become friends with one of your own accounts, so the
   screens are not empty.

Fill in those credentials, and your name, phone and e-mail as contact.

**Notes:**

> Snatzee! is a score keeper for the dice game Yahtzee: players roll real
> dice at the table and record their result in the app afterwards. The app
> is in Dutch.
>
> Sign-in: e-mail and password (demo account above), or Sign in with Apple.
>
> Where to find things:
> - Add a game: the "+" button in the middle of the tab bar.
> - Account deletion: Profiel (tab) → Instellingen (gear icon) → Account
>   verwijderen. For Apple accounts this also revokes the Apple token.
> - Report / block a player: open any player (Ranglijst tab → tap a row) →
>   Melden / Blokkeren at the bottom. Reports reach the administrators, who
>   act on them within 24 hours. Blocked players can be unblocked under
>   Instellingen → Privacy.
> - Terms (with the rules on objectionable content) are agreed to when an
>   account is created and are linked in Instellingen.
> - Push notifications are optional and off until turned on in
>   Instellingen → Meldingen.
> - The camera is only used to scan a group's QR code (Vrienden → Groepen →
>   Groep joinen → QR Code scannen).

**Moderation:** App Review expects reports to be handled within 24 hours.
Open reports are in the admin console on the website (`/app/admin`).

Then **Add for Review** → **Submit**. Choose "Manually release this
version" if you want to pick the moment it goes live.

## 8. Later versions

- Every change to the app raises `MARKETING_VERSION` in `ios/project.yml`
  by Semantic Versioning (patch for fixes, minor for features, major for
  breaking changes; see `CLAUDE.md`) and gets a line in `ios/CHANGELOG.md`.
  Archive and upload that version; build numbers are handled by Xcode.
- Old app versions and a changed server: when a server change breaks
  older builds, raise `min_ios_build` in `app_settings` to the lowest build
  that still works. Older apps then show a "Tijd voor een update" screen with a
  link to the App Store instead of failing.
- Promotional text, screenshots and the description can change with any
  new version; the privacy answers only when the data collected changes.
