# Handoff — where things stand right now

The note one session leaves for the next (laptop Claude Code, Claude mobile/web sessions, or a person).
History lives in `CHANGELOG.md`; the reasons in `docs/decisions.md`. **This file is only the present:**
rewrite it (don't append) at the end of every session that changes something. Keep it under ~80 lines.

_Last updated: 2026-11-04 (laptop session: launch features built, not yet on the phone)._

## State

- `main` builds; `npm run lint && npm run typecheck && npm test` pass (61 tests). Demo e2e (`demo`, `setup`,
  `launch`) pass in a browser against the demo export.
- Live pilot: API on Render (free plan, sleeps), database + photos on Supabase. Pushing `main` deploys the API,
  and its start runs `prisma migrate deploy`: migration `measured_work_pay_stages` (3 new tables, additive).
- Pilot APK versionCode **10** on the owner's OnePlus. Today's work is JS only (no native package), so it can
  reach APK 10 with `eas update --channel pilot` (needs the owner's `eas` login). The `demo` APK is older.
- **No web panel** (decision 2026-11-04). **Launch**: announce Diwali (8 Nov), live on **Labh Pancham, 14 Nov**.

## Last session (2026-11-04)

- Market research → `docs/market.md`; then built its gaps (details in `CHANGELOG.md`, rules in `decisions.md`):
  - contractors paid **by measurement**: "માપ" (measure) screen, measured work in the hisab and its bill;
  - **buyer instalments by stage**: payment plan per site, "Done" per stage, due now, WhatsApp reminder;
  - **party last rates** in suppliers "by material" and on the order screen;
  - **office registers** (PDF/Excel) on Reports.
- Not tried on a real phone yet: the new screens (only the browser demo build), photo on a measurement.

## Open — waiting on the owner

- Gujarati wording of the new screens: માપ લખો, માપ પ્રમાણે, રોજના ભાવે, હપ્તા પ્લાન, પૂરું થયું,
  હમણાં લેવાના, ઉચક (lump sum), the buyer reminder text (`unit.remindText`), work suggestions per trade
  (`work.suggest.*`), stage names (બુકિંગ, પ્લિન્થ, સ્લેબ n, ચણતર, પ્લાસ્ટર, પઝેશન).
- Render paid instance before 14 Nov; launch builders' numbers for `SIGNUP_OPEN`; pricing; video end card;
  accounts (MSG91, Play Store, Firebase).
- `eas update --channel pilot` (or a new pilot APK) to put today's work on phones; rebuild the demo APK.

## Next up (for 14 Nov, in order)

1. On the OnePlus (adb): measurement with photo, hisab bill + approval + paid, payment plan + reminder, order
   with party rates, registers PDF/Excel — every role.
2. Photo flow on a cheap phone (camera, GPS, upload queue).
3. A new builder's first day on the phone, end to end (`e2e:firstday` covers the API).
4. New pilot APK + demo APK from the same code.
5. Later: retention/TDS on contractor bills if builders ask; measurements in the nightly report.

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
