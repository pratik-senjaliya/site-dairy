# Handoff — where things stand right now

The note one session leaves for the next (laptop Claude Code, Claude mobile/web sessions, or a person).
History lives in `CHANGELOG.md`; the reasons in `docs/decisions.md`. **This file is only the present:**
rewrite it (don't append) at the end of every session that changes something. Keep it under ~80 lines.

_Last updated: 2026-11-04 (laptop session, research only, no code change)._

## State

- `main` builds; lint, typecheck and 56 tests passed at the last code change (2026-10-31).
- Live pilot: API on Render (free plan, sleeps), database + photos on Supabase. See "Live pilot" in `CLAUDE.md`.
- Latest pilot APK: versionCode **10** (2026-10-30), on the owner's OnePlus. APKs older than 10 can't take an
  `eas update` of current JS. The `demo` APK on expo.dev is older and lacks the UI/UX pass.
- **Decision 2026-11-04: no web panel.** Every role works from the phone. `apps/web` is kept, not deployed.
- **Launch**: announce at Diwali (Sun 8 Nov), go live with builders on **Labh Pancham, Sat 14 Nov 2026**.
  Market notes, problem → feature map and the plan: `docs/market.md`.

## Last session (2026-11-04)

- Web research on Ahmedabad builders and sites, competitors and the Diwali calendar → `docs/market.md`.
- Gaps found: contractor bills by measurement (per sq ft centering/plaster, the main way Ahmedabad
  builders pay trades), buyer instalments by stage, party rate compare.

## Open — waiting on the owner

- Render paid instance before 14 Nov (instant login at demos, and the 8 pm report runs).
- The launch builders' phone numbers for `SIGNUP_OPEN` (closed signup until MSG91 DLT is approved).
- Gujarati wording: `common.details` "વિગત", `common.less` "ઓછું", video captions; the launch line in
  `docs/market.md`.
- Pricing (suggested: per site per month, not per user).
- Contact number / business name for the videos' end card.
- Accounts: MSG91 SMS, Play Store, Firebase key for push.

## Next up (for 14 Nov, in order)

1. Photo flow on a cheap phone (camera, GPS, upload queue): the one field flow never tried on a device.
2. A new builder's first day on the phone, end to end (signup → site → contractors → supervisor → first entry),
   fixing whatever is slow or confusing.
3. Check every office-only job (reports/Excel, users, settings) is reachable in the app now the web panel is gone.
4. New pilot APK + demo APK from the same code.
5. After launch: contractor bills by measurement (RA), then buyer instalments by stage.

## Working from a Claude mobile / web session

- Cloud sessions have the repo but no phone, no adb, no Docker, no `eas` login. Fine for code, docs, i18n,
  shared calculations and tests (`npm test` needs Postgres — if it isn't there, run lint + typecheck and the
  `packages/*` tests, and say which ran).
- Ship JS-only changes to installed APKs later from the laptop with `eas update --channel pilot`; native changes
  (packages, `app.json` plugins) need a new APK build.
- Before ending: update this file + a `CHANGELOG.md` entry, commit, push.

## Laptop-only notes (phone testing)

- Debug build on the phone: `npx expo run:android --device <name> --no-bundler`, Metro with
  `npx expo start --port 8081 --clear` (not `CI=1`: no file watching), then `adb reverse tcp:8081 tcp:8081` and
  `tcp:4000 tcp:4000` after every reconnect. OnePlus asks "Install" on the phone for every adb install.
- Release-like demo build without EAS: `cd apps/mobile/android && EXPO_PUBLIC_DEMO=1 NODE_ENV=production
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (debug keystore; uninstall before switching
  to an EAS-signed APK and back).
- That OnePlus blocks `adb shell screenrecord`; record with the phone's own screen recorder (saved under
  `Pictures/Screenshots/Record_*.mp4`).
