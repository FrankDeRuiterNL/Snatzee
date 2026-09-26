# Working on Snatzee

## iOS app version

Every change to the iOS app (`ios/`) raises `MARKETING_VERSION` in
`ios/project.yml`, following Semantic Versioning (https://semver.org):

- **PATCH** (1.1.0 → 1.1.1): bug fixes and small tweaks only.
- **MINOR** (1.1.0 → 1.2.0): new features or screens, backwards compatible.
- **MAJOR** (1.x → 2.0.0): a big redesign, or a change that drops support
  for something users relied on (for example a new minimum iOS version).

Raise it once per change set (commit or merge to `main`), not per file, and
add a line for the new version to `ios/CHANGELOG.md`. Changes outside
`ios/` (website, server) do not touch the iOS version.

Every new version also raises the build number (`CURRENT_PROJECT_VERSION`
in `ios/project.yml`) by a random whole number from 6 to 23 (inclusive),
e.g. `shuf -i 6-23 -n 1`. The build number only ever goes up; mention the
new build number in the changelog entry next to the version.
