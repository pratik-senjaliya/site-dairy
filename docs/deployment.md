# Deployment

Pilot setup (low cost, India region):

| Piece | Where | Config |
|---|---|---|
| API (Express + jobs) | Render web service, Singapore | `render.yaml` |
| Postgres 16 | Supabase (Mumbai) or Render Postgres | `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) |
| Photos, report PDFs | Cloudflare R2 or Supabase Storage, **private** bucket | `STORAGE_DRIVER=s3`, `S3_*` |
| Office panel | Vercel, root `apps/web` | `apps/web/vercel.json`, env `API_URL` |
| Phone app (browser build) | Vercel, root `apps/mobile` | `apps/mobile/vercel.json`, env `EXPO_PUBLIC_API_URL` |
| Android app | EAS Build (APK for the pilot, AAB for Play internal testing) | `apps/mobile/eas.json` |

## Steps

1. **Database**: create the project; copy the pooled (6543, `?pgbouncer=true`) and direct (5432) connection strings.
2. **Bucket**: create a private bucket `site-diary` and an S3 access key. Nothing is public: photos are served through the API with sign-in (local) or 10-minute signed URLs (S3).
3. **API on Render**: New → Blueprint → this repo. Fill the `sync: false` values. Set `SEED_ON_START=true` for the first start only if you want the demo company.
   - `OTP_PROVIDER=msg91` with `MSG91_AUTH_KEY` and an approved DLT `MSG91_TEMPLATE_ID` (body must contain `##OTP##`). For a closed demo only: `OTP_PROVIDER=dev`, `ALLOW_DEV_OTP=true`, `OTP_DEV_CODE=<code>`.
   - Use a paid instance for the pilot: a sleeping free instance misses the 8 pm report and the 7 pm reminder.
4. **Office panel on Vercel**: import the repo, root directory `apps/web`, env `API_URL=https://<api>`.
5. **Phone web build on Vercel** (optional): root `apps/mobile`, env `EXPO_PUBLIC_API_URL=https://<api>`. Add both Vercel URLs to the API's `WEB_ORIGIN` (comma-separated) and set `PUBLIC_WEB_URL` to the office panel URL.
6. **WhatsApp** (when Meta approves): create a template named `nightly_report` (language gu) with three body variables — name, date, link — and set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`. Until then the report is in-app and shared with the link/PDF from the phone.

## Database role and region

- The first migration run creates a `site_app` role (no BYPASSRLS) that the API switches to for every query, so row-level security holds even if the connection user could bypass it. If the database user cannot create roles, the migration says so and the policies still apply through FORCE RLS to a non-superuser owner.
- Put the API and the database in the **same region** (e.g. Render Singapore + Supabase Singapore): each query runs in its own short transaction to set the company, which costs a few round trips.

## Jobs

pg-boss runs inside the API (schema `pgboss` in the same database): a tick every 5 minutes sends, per company and in Asia/Kolkata time, the 7 pm no-entry reminders (supervisor, then engineer 30 min later), the weekly wage reminder and the nightly report (3 retries; the owner is told if it still fails). `RUN_JOBS=false` turns them off for an extra API instance.

## Backups

- Managed Postgres (Supabase/Render) keeps daily backups; check the retention on the plan you buy (30 days needs a paid plan).
- Self-hosted: `infra/backup.sh` (pg_dump, 30-day retention) from cron.

## Errors

`SENTRY_DSN` turns on error reporting in the API. The web panel and the phone app do not report to Sentry yet.
