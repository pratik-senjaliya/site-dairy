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
- [x] 2. Prisma schema for all v1 entities + seed (skills, materials, work-item templates in Gujarati/English; demo company "Shree Ganesh Builders (demo)" with site "Shivam Heights", B block × 12 floors)
- [ ] 3. Auth: phone OTP, JWT + refresh, roles, site scoping middleware, audit hook, RLS
- [ ] 4. Sync endpoints (pull/push with server_rev) + WatermelonDB models
- [ ] 5. Mobile: login, site picker, supervisor home, attendance
- [ ] 6. Mobile: GRN with photo queue, issue, stock; progress with photos
- [ ] 7. Web: projects/structure, contractors, materials, attendance register
- [ ] 8. Owner dashboard + approval inbox
- [ ] 9. Nightly report job: aggregate → PDF → WhatsApp/share
- [ ] 10. Pilot hardening: Sentry, backups, OTA channel, Play Store internal testing

Demo phones after seeding: owner +919800000001, engineer …02, supervisor …03, store …04, accountant …05.
