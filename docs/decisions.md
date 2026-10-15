# Decisions

Short records of choices that differ from, or add to, `docs/scope.md`. Newest first.

## 2026-10-15 — Phone storage: our own small sync store instead of WatermelonDB (for now)

WatermelonDB needs a custom native build (its SQLite adapter is not in Expo Go) and its support for React Native's new architecture on Expo SDK 57 is unproven. That would block the quickest pilot path (Expo Go and the browser build). The app keeps its copy in `apps/mobile/src/lib/db.ts`: per-table maps persisted to AsyncStorage, an outbox, a photo upload queue, and pulls by `server_rev` — the same protocol shape WatermelonDB's sync uses, so a later swap only touches that file. Limits: everything for the user's sites (30 days of daily entries) is held in memory; fine for 1–5 sites, revisit above a few thousand rows per table or when lists feel slow on a ₹10k phone.

## 2026-10-15 — Rules the scope left open

- **Late attendance**: a supervisor's entry for an earlier day goes to approval, except an entry the phone recorded on that same day (offline) that arrives within 3 days. Engineers and owners correct past days directly; an engineer's correction notifies the owner. Approvers: engineer or owner ("later edits need engineer approval").
- **Indents** are approved by the engineer or the owner (scope text) although the matrix shows only the owner with A.
- **Purchase orders** above the owner's threshold (default ₹50,000) wait for the owner; the owner's own POs and smaller ones are approved at once. Engineers do not approve POs.
- **Wage settlements**: created by engineer/accountant, approved by the owner, then marked paid. Advances given up to the period end and not yet settled are deducted once; cancelling a settlement frees them.
- **Two phones, same contractor × skill × day**: one row; the later write wins (the second phone's row id is remapped).
- **Signup**: an unknown phone number can create a company (pilot self-serve; `SIGNUP_OPEN=false` turns it off).
- **Web panel language**: English with Gujarati names beside materials/skills/work items (office staff and the CA read English); reports follow each user's language. The phone app is Gujarati-first with English and Hindi.
- **RLS**: not yet. Every query filters by company in the API (tests cover tenant isolation); Postgres row-level security as the second guard is still to do.

## 2026-10-15 — Stack: reuse what the BME app already proved

The scope suggested pnpm + Turborepo, Fastify, and BullMQ + Redis. We use instead:

| Scope said | We use | Why |
|---|---|---|
| pnpm + Turborepo | npm workspaces | Same as the BME app; Expo SDK 57 detects npm workspaces with no Metro config. Six packages do not need a task runner yet. |
| Fastify (or NestJS) | Express 5 | Auth, audit, permission and error-handling patterns port straight from the BME app. Speed is not the bottleneck at pilot scale (p95 < 300 ms is a query problem). |
| BullMQ + Redis | pg-boss (on Postgres) | One less service to host and back up. The nightly report, the 7 pm no-entry check and retries (3 attempts) are all pg-boss features. |
| Prisma (or Drizzle) | Prisma 6 | Same as the BME app. |

Unchanged: Expo + Expo Router, WatermelonDB, Next.js + Ant Design, phone OTP + JWT with refresh, R2 for photos, WhatsApp Cloud API, Sentry.

Pinned to versions already proven together: Next 15, Ant Design 5, zod 3, React 19.2 (the version Expo SDK 57 ships, so web and mobile share one copy).

## 2026-10-15 — Data model additions

- `site_days` (one row per site per date): the weather / holiday / no-work marker and the day's note. The scope lists the marker but no table for it.
- `server_rev` comes from one global Postgres sequence, set by a trigger on every insert and update of every synced table (`set_server_rev`). A pull is "all rows with server_rev > last pulled", across tables, without clock skew.
- `audit_log` is append-only in the database (a trigger refuses UPDATE and DELETE). It is not synced to phones.
- `reports` (nightly log) has no `server_rev` or soft delete: it is server-only.
- Starting lists (skills, materials, work-item templates) live in `apps/api/src/catalog.ts` and are copied into each new company, so every company can edit its own.
- Money columns are `BIGINT` paise (₹2 crore overflows a 32-bit integer). The API turns them into JSON numbers, exact up to ₹90 lakh crore.
