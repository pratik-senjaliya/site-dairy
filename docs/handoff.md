# Handoff — where things stand right now

The note one session leaves for the next (laptop Claude Code, Claude mobile/web sessions, or a person).
History lives in `CHANGELOG.md`; the reasons in `docs/decisions.md`. **This file is only the present:**
rewrite it (don't append) at the end of every session that changes something. Keep it under ~80 lines.

_Last updated: 2026-10-31 (laptop session, with a phone on adb)._

## State

- `main` builds; `npm run lint && npm run typecheck && npm test` pass (56 tests).
- Live pilot: API on Render, database + photos on Supabase (see "Live pilot" in `CLAUDE.md`). Migration
  `accounts_partners` is applied on Supabase.
- Latest pilot APK: EAS build versionCode **10** (2026-10-30), made from the UI/UX pass below; installed on the
  owner's OnePlus (CPH2751). It includes `expo-navigation-bar`, so APKs older than 10 can't take an `eas update`
  of current JS — build a new APK for anyone still on an older one.
- The `demo` APK on expo.dev is older (from 8e9d774) and does not have the UI/UX pass. Rebuild it
  (`--profile demo`) before handing the demo APK to anyone.

## Last session (2026-10-30/31)

- UI/UX pass for showing the app to customers (details in `CHANGELOG.md`): login (demo roles as a grid, only the
  pressed button spins), segmented controls, list rows, steppers, money/hisab/supplier rows, no grey nav bar.
- Tested every role on the phone against a local API (attendance, progress, advance, issues, indent, GRN,
  material used, approvals, setup screens, money book, hisab settle + pay, supplier rate + cheque, offline save +
  auto-sync, PDF, English/Hindi, large font). Not tested: taking a photo, transfers, sending to WhatsApp.
- Marketing videos made from a screen recording of the demo (files on the owner's Desktop, not in git):
  `Site-Diary-App-Walkthrough.mp4` (3:44, landscape, Gujarati + English captions) and
  `Site-Diary-Brand-Video.mp4` (35 s, vertical). Both silent, no contact number yet.

## Open — waiting on the owner

- Check the Gujarati wording added this time: `common.details` "વિગત", `common.less` "ઓછું", and the video
  captions/marketing lines.
- A contact number / business name for the end card of both videos, and background music if wanted.
- Everything in `docs/release-checklist.md` that needs accounts: MSG91 SMS, Play Store, Render paid plan (so the
  8 pm job runs), Firebase key for push.

## Next up (suggested)

1. Rebuild the `demo` APK so the shareable demo matches the new UI.
2. MSG91 SMS → open signup (replace the closed pilot list).
3. Photo flow on a real cheap phone (camera, GPS, upload queue) — the one field flow never tested on a device.

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
