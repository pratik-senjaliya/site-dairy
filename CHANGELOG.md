# Changelog

What was built, newest first, and why. Commit hashes are on `main`. For where things stand now see "Status" and "Live pilot" in `CLAUDE.md`.

## 2026-10-23 — Real pilot app, hosted backend, owner and store UX

**Live**: API on Render (`https://site-diary-api.onrender.com`, free plan), Postgres + photo bucket on Supabase (Mumbai), pilot APK built by EAS (`pilot` profile, versionCode 2). Web panel not deployed yet.

- **Closed pilot login** (cd0dd43). `SIGNUP_OPEN` is `true`, `false`, or a comma-separated list of numbers allowed to start a company; staff are added by the owner. With `OTP_PROVIDER=dev` + `ALLOW_DEV_OTP` in production, the fixed `OTP_DEV_CODE` only works after "send code" so wrong tries (5 per code) and the 5-codes-an-hour cap apply. Login errors (`no_account`, `otp_wrong`, `otp_expired`, `otp_limit`) are shown in Gujarati.
- **Real build's login** (84bbf1c): no demo buttons and no server address in release builds; long-press the app name to see/change the server.
- **Owner home** (a0be8ad): each site's diary page for today (same sentences the supervisor wrote, from the phone's synced copy, works offline); call buttons for the site's team when entries are missing (`/dashboard` now returns `team` per site); wage-day card (this week's labour − upad across sites, via `/wages/summary`); "Needs you" list: approvals, problems open ≥ 3 days, stock running out, requested material that is late. Refreshes when returning to the home.
- **Field home**: the diary turns back to earlier days; "Send on WhatsApp" shares the day as text (offline), PDF beside it; store keeper sees "material expected" (approved/ordered requests not yet received; tap → material in, prefilled); "all done" only for roles with daily duties.
- **Approvals** read as sentences with one-tap reject reasons.
- **No double orders** (14929b7): stock and material request show what is already asked for (`awaitedMaterial(site, asked)` in `apps/mobile/src/lib/stock.ts`).
- **Fixes**: report dates readable (`22/10નો રિપોર્ટ`), one report button on Reports, site page shares its own PDF and shows only filled sections (9591636); rows not yet synced have no `createdAt` and crashed request/problem screens — now `madeOn()` treats them as today (b4a46a7).
- Demo seed (phone and server) has an approved, overdue AAC block request so the late-material features show; demo storage key is `demo:server:v3`.

## 2026-10-22 — Diary-style screens and contractor hisab

The rule from here on: every entry screen asks plain questions and shows the sentence that will be written ("આ નોંધ થશે: …") above Save; relationships are explicit ("Floor 6 ના સ્લેબમાં વપરાયો"). See the memory/UX notes in `docs/decisions.md`.

- Attendance, material in (gate diary), material used, today's work, upad, material request, problems and transfer rewritten in this pattern (20dc067 … f0e2d4a); shared sentence builders in `apps/mobile/src/lib/diary.ts`.
- Field home opens on today's diary page with what is still to do (f856faf).
- Most-used first and entries start from last time (721ab1f); look back at any day of a site (f15544f); stock shows days left with one-tap request (65789e3); upad shows the contractor's week first (e927da0).
- **Contractor hisab** (4f62835, ced760c): `GET /wages/summary`, per-contractor man-days × rate − upad, settle and mark paid from the phone, WhatsApp share; today's labour cost for the owner on dashboard, reports and web (7cc0076, b3f575b). Alerts are i18n `Notice`s so each reader gets their language (632714f).

## 2026-10-18 to 2026-10-21 — Demo mode and Android builds

- Demo mode (69c8096): `EXPO_PUBLIC_DEMO=1` runs an in-app mock server (`apps/mobile/src/demo`) with two weeks of history; no internet needed.
- EAS project linked, expo-updates, `eas-build-post-install` builds the shared packages (d44771d, 57752c2); `docs/android.md`.

## 2026-10-15 to 2026-10-17 — v1 scope

Monorepo, Prisma schema for all v1 entities, phone OTP auth with roles/site scope, offline sync, approvals, wages, POs, registers, dashboard, nightly report (PDF + WhatsApp link), offline-first field app with all v1 screens, office panel W1–W14, Postgres RLS, security review fixes. See `docs/release-checklist.md`.
