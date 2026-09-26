# Snatzee! for iOS — changelog

Versions follow [Semantic Versioning](https://semver.org). See `CLAUDE.md`
for when each part goes up.

## 1.3.0 (build 11)

- Profiel has a page title like Ranking and Vrienden, with the settings
  button next to it.
- "Wachtwoord vergeten?" on the login screen: mails a link to choose a new
  password on the website, then log in here with it.
- Offline: a "Geen internetverbinding" banner above the tab bar, the app
  opens with the last known profile instead of the welcome screen, and
  everything reloads once the connection is back.

## 1.2.1

- Fixed Xcode warnings: the history list's size limit is read on the main
  actor, the Info.plist says the app does not open documents in place, and
  the Sign in with Apple button stays within Apple's maximum width.

## 1.2.0

- Score sheet: Full house, Kleine straat, Grote straat and Topscore are a
  checkbox worth their points instead of a menu with 0 or the points.

## 1.1.0

- Privacybeleid, voorwaarden and support linked in Instellingen.
- Agreeing to the terms and privacy policy is mentioned where an account is
  made (e-mail and Sign in with Apple).
- The "Tijd voor een update" screen links to the App Store.
- Privacy manifest also lists user-written content (bio, notes, reports).

## 1.0.0

The first version, built up in steps 1–4: sign-in (e-mail and Apple),
onboarding, Home, adding and editing games with the score sheet and
celebrations, history, statistics, achievements, rankings, friends, groups
with QR invites, public profiles with reporting and blocking, settings,
account deletion, push notifications and universal links.
