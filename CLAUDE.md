# CLAUDE.md — Site Diary

Read this first, then `docs/scope.md` (product and technical scope, the source of truth) and `docs/decisions.md` (where we differ from it).

## What this is

A Gujarati-first construction site management app for builders in Ahmedabad with 1–5 live sites. Supervisors enter labour, material and progress on a budget Android phone in about 2 minutes; the owner gets a nightly WhatsApp/PDF report; office staff use a web panel. One company account = one tenant.

## Layout

```
apps/mobile      Expo SDK 57 + Expo Router (routes in src/app). Offline-first (WatermelonDB, task 4).
apps/web         Next.js 15 + Ant Design 5 office panel. Browser calls /api/v1/* on its own origin;
                 src/app/api/v1/[...path]/route.ts proxies to API_URL, read at runtime.
apps/api         Express 5 + Prisma 6 + PostgreSQL. pg-boss for jobs (no Redis).
packages/shared  zod schemas, types, calculations (wages, stock, money, dates) with unit tests
packages/i18n    gu.json (default), en.json (key reference), hi.json; t(locale, key, vars)
packages/ui-tokens  colours, spacing, type scale, touch sizes for app and web
infra/           docker-compose.dev.yml (Postgres)
docs/            scope.md, decisions.md
```

Packages build to `dist/` (CommonJS); root scripts build them before anything else.

## Commands

```bash
npm install
npm run db:up                          # Postgres 16 in Docker (or any local Postgres, see apps/api/.env.example)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate -w apps/api && npm run db:seed -w apps/api
npm run dev:api                        # http://localhost:4000/api/v1/health
npm run dev:web                        # http://localhost:3000 shows API + DB status
npm run dev:mobile                     # Expo dev server
npm run lint && npm run typecheck && npm test
npm run prisma:migrate -w apps/api -- --name <name>   # after schema changes
npm run build:mobile-web               # phone app as a website (apps/mobile/dist)
npm run build:demo-page                # site-diary-demo.html: the no-server demo in one file

# Android (from apps/mobile; full guide with install steps: docs/android.md)
npx eas-cli@latest login                                   # browser login, once per computer
npx eas-cli@latest build -p android --profile demo         # APK, no server needed
npx eas-cli@latest build -p android --profile pilot        # APK against EXPO_PUBLIC_API_URL (https)
npx eas-cli@latest update --channel demo --message "…"     # JS-only fix to installed APKs
```

Mobile: add native packages with `npx expo install <pkg>` (set `EXPO_OFFLINE=1` if api.expo.dev is unreachable). Read `apps/mobile/AGENTS.md` before touching Expo APIs.

## Conventions

- TypeScript strict everywhere; no `any` (lint error).
- All user-facing strings through i18n keys, Gujarati first. A test keeps the three locale files in step.
- Money in paise (integer; BIGINT in the database). Quantities decimal(12,3). Business dates ISO `YYYY-MM-DD` in Asia/Kolkata (`isoDate()` in shared), never the server's clock zone.
- Every tenant table: UUID id (client-generated), company_id, created_by, timestamps, deleted_at, server_rev. Soft delete only. `server_rev` is set by a database trigger; never write it from code.
- `audit_log` is append-only in the database. Every create/edit/delete/approval writes to it.
- API validates request bodies with shared zod schemas; role + site checks in middleware, never only in the UI. Every query filters by company_id (RLS as a second guard, task 3).
- Business calculations live only in `packages/shared`, with unit tests.
- Mobile is offline-first: screens never call the API directly; they go through the sync layer.
- Field UI: touch targets ≥ 48 px, body text ≥ 16 px, steppers and chips instead of typing.
- Keep it simple: no abstraction with one implementation; reuse before writing new helpers.
- Small PRs per module, Conventional Commits, `main` stays deployable.

## Status (first tasks from the scope, in order)

- [x] 1. Monorepo scaffold, dev Postgres, lint, CI
- [x] 2. Prisma schema for all v1 entities + seed (Gujarati/English lists; demo company with two weeks of history)
- [x] 3. Auth: phone OTP (dev code or MSG91), access JWT 15 min + device-bound rotating refresh (tokens carry an audience), roles (`packages/shared/src/permissions.ts`), site scoping, audit log, Postgres RLS (`lib/prisma.ts`).
- [x] 4. Sync: `/sync/push` (per-row savepoints, attendance lock → approval, natural-key merge, stock ledger rebuild, low-stock notices) and `/sync/pull` (since server_rev, 30-day first pull, per-company write lock so no row is skipped). Phone store is our own (`apps/mobile/src/lib/db.ts`), not WatermelonDB — see decisions.
- [x] 5–6. Mobile: login (OTP, language, signup, server address), site picker, home per role, attendance, advance, GRN with challan photo, material used, indent, progress + day marker, issues, stock (with unsent entries), transfers, sync status, approvals, site detail, nightly reports, notifications, profile. Photos compressed to ≤ 300 KB with GPS, uploaded from a queue.
- [x] 7. Web W1–W14 (`apps/web/src/app/(app)/*`), plus `/r/[token]` (the WhatsApp report link).
- [x] 8. Owner dashboard (`/dashboard`, `modules/reports/daily.ts` builds each site's day) + approval inbox (`modules/approvals`).
- [x] 9. Nightly report: pg-boss tick (`src/jobs.ts`) → report (`modules/reports/report.ts`) → PDF (Noto fonts, Gujarati shaped) → in-app + WhatsApp Cloud API when configured; signed public link. Also 7 pm no-entry and wage-day reminders.
- [x] 10. Pilot hardening: crash reports from all apps via the API to Sentry, `infra/backup.sh`, `eas.json`, push registration (needs `eas init`), app icon, plan limits, `render.yaml`, Vercel configs.
- [x] 11. Demo mode: the phone app can answer itself (`apps/mobile/src/demo/`, `EXPO_PUBLIC_DEMO=1` or the demo buttons on the login screen); `demo` APK profile; one-file browser demo (`infra/demo-page.mjs`, `e2e/demo.mjs`).
- [x] 12. EAS linked: project @pratik-senjaliya/site-diary (ID in `apps/mobile/app.json`), EAS Update channels `demo`/`pilot`. Building and installing on a phone: `docs/android.md`.
- [x] 11. Diary-style UX on every field screen, contractor hisab, owner home (site diaries, wage day, "needs you"), closed pilot login, real pilot APK. History: `CHANGELOG.md`; UX rule: `docs/decisions.md`.
- What is left needs the owner's accounts or real devices: `docs/release-checklist.md`. Next up: web panel on Vercel, MSG91 SMS, Play Store.

## Live pilot (since 2026-10-23)

- API: Render service from `render.yaml`, `https://site-diary-api.onrender.com` (free plan: sleeps after 15 min idle, so the 8 pm job can be missed; Starter for real use). Region Singapore.
- Database + photos: Supabase project `site-diary` (ref `rhyqvdwqhamwutwdlklh`, ap-south-1); private bucket `site-diary` over the S3 API.
- Login: closed pilot (`SIGNUP_OPEN` list + shared `OTP_DEV_CODE`), see `docs/decisions.md`. Secrets live only in Render's environment, never in the repo.
- Android: EAS project `@pratik-senjaliya/site-diary`; `npx eas-cli build -p android --profile pilot` (APK, API URL baked in) or `--profile demo` (no server). Web panel: not deployed yet (Vercel, root `apps/web`, env `API_URL`).

Tests: `npm test` (46: calcs, i18n parity, API incl. RLS, tenant isolation, site scope, attendance lock, frozen settlements, stock, wages, PO threshold and PDF, plans, reports, nightly job), `npm run e2e` (supervisor incl. offline, every office page, store keeper/accountant/engineer). How to try it: `docs/testing.md`.

Demo phones after seeding (OTP 123456 with `OTP_DEV_CODE`): owner 98000 00001, engineer …02, supervisor …03, store …04, accountant …05.

## Gotchas

- New tables with `server_rev` need the `set_server_rev` trigger in their migration (a test fails otherwise).
- New tables with `company_id` need the RLS policy (copy the loop in the `row_level_security` migration) and grants to `site_app` come from default privileges.
- Interactive transactions: `transaction()` or `write()` from `lib/`, never `prisma.$transaction(async …)` (a test fails otherwise).
- Notifications take message keys (`notify.*` in packages/i18n) so each person gets their own language.
- Writes to synced tables go through `write(companyId, tx => …)` (`lib/db.ts`); daily entries go through `applyRow` (`modules/sync/push.ts`) even from the web panel.
- Mobile: native packages via `EXPO_OFFLINE=1 npx expo install <pkg>`; keep everything Expo Go compatible until the pilot APK. A native package or `app.json` plugin change needs a new APK; JS-only changes can go out with `eas update`.
- Mobile web exports use `--clear`: Metro caches inlined `EXPO_PUBLIC_*` values, so without it a demo export leaks into the next regular one.
- EAS cloud builds run `npm install` at the root, then `eas-build-post-install` (apps/mobile) builds `packages/*`, whose `dist/` is not in git. Keep that hook.
- Release APKs refuse plain `http://` servers; an APK needs an https API. Use Expo Go to test against a laptop.
- `eas` commands need a person's browser login (or `EXPO_TOKEN` in the environment): ask, don't try to work around it.
