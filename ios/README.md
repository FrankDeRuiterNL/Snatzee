# Snatzee! for iOS

Native SwiftUI app, same backend as the website (see `docs/ios-api.md`).
Bundle ID `nl.snatzee.app`, team `B65F8DKJ2N`, iOS 17+, iPhone.

## First time on your Mac

```bash
brew install xcodegen
cd ios
cp Config/Local.example.xcconfig Config/Local.xcconfig   # then fill in SNATZEE_ANON_KEY
xcodegen generate
open Snatzee.xcodeproj
```

`SNATZEE_ANON_KEY` is `ANON_KEY` from the server's `.env` — public by
design, but kept out of git. Pick your iPhone as the run destination and
press ⌘R; Xcode signs with your team automatically.

After every `git pull`, run `xcodegen generate` again: the Xcode project
is generated from `project.yml` and not committed.

## TestFlight

1. In Xcode: set the destination to **Any iOS Device**, then
   **Product → Archive**.
2. In the Organizer: **Distribute App → App Store Connect → Upload**.
3. The build appears under TestFlight in App Store Connect after
   processing (≈10–30 min). Add yourself and friends as testers.

Raise `CURRENT_PROJECT_VERSION` in `project.yml` for every upload
(App Store Connect refuses a build number it has seen), and
`MARKETING_VERSION` for a new release.

## Where things are

| Path | What |
| --- | --- |
| `project.yml` | The Xcode project (XcodeGen) |
| `Config/` | Server address and anon key per build |
| `Snatzee/Design` | Colours, fonts, icons and shared components — ported from `src/app/globals.css` and `src/components/ui` |
| `Snatzee/Core` | Game rules and formatting, twins of `src/lib` |
| `Snatzee/Features` | One folder per screen area |
| `Snatzee/Services` | Supabase, sound, haptics |
| `SnatzeeTests` | Unit tests, run by CI on every push to `ios/` |

Icons are the web app's own Lucide icons; after using a new one on the
web, `node scripts/generate-ios-icons.mjs` adds it here. The app icon and
logo mark come from `npm run brand`.
