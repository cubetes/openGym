# Themes and kinds for the title classification

Each issue or pull request gets exactly one theme and one kind, read from its title and labels.
Labels such as `bug` or `enhancement` are a hint, not a rule.

## Themes

- **Workout logging**: the in-workout screen, sets, reps, supersets, circuits, routines and plans, templates
- **Progression and training logic**: progression rules, 1RM, warm-ups, deloads, volume targets, strength levels
- **Exercise library**: exercises, catalogue data, images, videos, instructions, custom exercises
- **Stats, charts and body tracking**: stats screens, charts, records, body weight, measurements, photos, history views
- **Sync and data safety**: multi-device sync, data loss, backups, local storage, offline
- **Import, export and integrations**: Hevy/FitNotes/Strong imports, CSV export, webhooks, Strava, calendar feeds, API tokens
- **Apple Health and Health Connect**
- **Watches**: Apple Watch, Wear OS, Garmin, Zepp/Amazfit
- **AI Coach and MCP**
- **Accounts, server and self-hosting**: passkeys, login, OIDC, admin, Docker, nginx, Kubernetes, env vars, server security
- **Phone apps and updates**: iOS/Android app shells, App Store, Play, F-Droid, APKs, in-app updater, widgets, install
- **Timers, reminders and notifications**: rest timer, sounds, push, reminders, spoken cues
- **Design and accessibility**: layout, theme, colours, contrast, screen readers, navigation, UI polish
- **Translations**: languages and wording in a language
- **Docs, website, CI and dependencies**: documentation, project site, CI, dependency bumps, test-only changes, chores
- **Other**: only if nothing fits

## Kinds

`bug` (something broken), `feature` (new capability), `improvement` (change to existing behaviour or
polish), `question` (support or discussion), `chore` (dependencies, CI, docs, refactors, tests).

## Commit kinds

Commits use their own kinds: `fix` (repairs something broken), `feature` (new capability),
`improvement` (changes or polishes existing behaviour), `test` (tests only), `docs` (documentation,
changelog, website text), `chore` (dependencies, CI, version bumps, merges, refactors). Commits use
the same themes as issues; pick what the change is about, not which file it touched.
