# Changelog

What was built, newest first, and why. Commit hashes are on `main`. For where things stand now see "Status" and "Live pilot" in `CLAUDE.md`.

## 2026-10-24 (day) — Fixing mistakes, tidy lists, photos, 5-site pilot

- **Edit today's entries** (material used, advance, today's work): the pencil in "entered today" puts the entry
  back in the form; it is saved again under the same id. Material in is still delete and re-enter.
- **Remove from lists**: contractor (with its named workers, added/removed on its screen), supplier, a site's
  kinds of work — hidden from new entries, old entries keep the name (`useRemove`).
- Material used: "+ new" kind of work and place, materials on site first with the quantity.
- **Site photos** (`app/photos.tsx`): last 30 days by day, filter by kind; any photo opens full screen.
- Contractor hisab: day-by-day boxes (weekday, date, workers) and an expand mark.
- Pilot plan allows **5 active sites** (was 2). Demo company is "Shree Ganesh Builders" (the demo banner stays).
- Fix: a sync asked for while one is running now runs once more and the caller waits for it (setup saves
  showed up only at the next automatic sync).

## 2026-10-24 (night) — The phone app is the whole product: setup, new look, ordering, accounts

Builders won't use a web panel, so everything is done from the app. Live database was cleared for a fresh start.

- **Setup from the phone** (`app/setup/*`): sites with floors in one save, wings, the site's team; staff with role,
  sites and a WhatsApp invite; contractors with daily rates per skill; suppliers; minimum stock per site; company
  name, wage day and report times. A new owner sees a three-step getting-started checklist.
- **New look** (`components/ui.tsx`): icons (`@expo/vector-icons`), soft raised cards, tinted icon badges, list
  rows, sections, stats, banners with icons, the diary line as a highlighted note. Field home moved to
  `components/FieldHome.tsx`; owner home has site cards with the day's diary, call buttons and "make entries"
  (`/entries`), stats, "needs you", wage-day card and a one-tap WhatsApp summary of all sites.
- **Nobody is blocked**: owner and engineer can make every site entry; supervisors add a contractor, supplier,
  worker, kind of work, place or material by name where they need it (`QuickAdd`, `NewMaterial`); staff not yet
  on a site can check again; login says when the server is waking up.
- **Ordering** (`app/order.tsx`): an approved request becomes a PO and a Gujarati order message to the supplier's
  WhatsApp; an owner's/engineer's own request is approved at once (server) and the owner goes straight to order.
- **Supplier accounts** (`app/suppliers.tsx`, `app/supplier.tsx`): due per supplier, payments, rates for receipts
  that came without one, statement on WhatsApp.
- **Monthly**: this month's cost on each site page; the CA's monthly account as PDF/Excel from Reports.
- Fixes: render loop from unstable `useT` (now memoised), nested buttons, no-site redirect during render, screens
  that load from the server refresh on return, approve is green / reject plain, readable report dates.
- Tests: `e2e/setup.mjs` (demo) and `e2e/firstday.mjs` (real API: sign-up → setup → entries → order →
  supervisor login); API tests for owner entries, supervisor adds and self-approved requests.

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
