# Decisions

Short records of choices that differ from, or add to, `docs/scope.md`. Newest first.

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
