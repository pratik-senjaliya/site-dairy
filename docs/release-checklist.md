# Release checklist — v1

Status of every item in `docs/scope.md` (v1), checked against the code on 17 Oct 2026.
✅ built and tested · 🟡 built, needs something only the owner can provide · ⏭ deliberately later (v2/v3 or out of scope).

## Development: done

| Scope item | Status | Where / how it is proven |
|---|---|---|
| Roles, permission matrix, site scoping | ✅ | `packages/shared/src/permissions.ts`; API checks every route; tests `auth`, `sync`, `integrity`, e2e `roles.mjs` |
| Tenant isolation: company_id in API **and** Postgres RLS | ✅ | `lib/prisma.ts`, migration `…row_level_security`; `rls.test.ts` proves a forgotten filter cannot leak |
| Audit log (who, old/new, when, device), append-only | ✅ | `lib/audit.ts`, DB trigger; web W13 |
| Phone OTP, JWT 15 min + refresh, device binding | ✅ | dev code for demos; MSG91 driver 🟡 needs account |
| Offline-first field app, sync by server_rev, never lose an entry | ✅ | `apps/mobile/src/lib/db.ts` (outbox written at once); e2e offline step |
| Company/projects/structure, bulk floors, templates, Excel import | ✅ | web W2, W14 |
| Contractors, Gujarati skills, rate history, named workers | ✅ | web W3 |
| Attendance steppers, half day, OT, group photo + GPS, midnight lock + approval | ✅ | phone M4; tests `sync`, `integrity` |
| Advances (contractor or named worker), settlements, owner approval, paid by cash/UPI/bank | ✅ | phone M5, web W5; settled records are frozen |
| Materials, units, min stock, indent → approval → PO (PDF + WhatsApp link) | ✅ | phone M8, web W7; PO status follows GRNs |
| GRN with challan photo, vehicle, PO, rejection; issue; live stock; low-stock alert | ✅ | phone M6/M7/M11, web W8 |
| Site-to-site transfer with receive confirmation | ✅ | phone, web W8 |
| Supplier master + ledger + payments | ✅ | web W8 (GRN rates editable for unpriced receipts) |
| Daily progress, photos, notes (keyboard voice), weather/holiday marker, issues | ✅ | phone M9/M10, web W9 grid + gallery |
| Owner dashboard + alerts + approval inbox | ✅ | phone M12/M13, web W1 |
| Nightly report (8 pm default), PDF with photos, per-engineer report, signed link | ✅ | `jobs.ts`; WhatsApp sending 🟡 needs Meta approval |
| Notifications table (no entry 7 pm, low stock, approvals, late edit, wages day) | ✅ | in-app bell in each person's language; phone push 🟡 needs an EAS build |
| Reports: daily, attendance, wages, GRN, stock, consumption, supplier ledger, CA monthly (Excel + PDF) | ✅ | web W10; Gujarati PDF fonts embedded |
| Users invite by phone, roles, sites; settings; plan limits | ✅ | web W11/W12; `npm run set-plan` |
| Gujarati first, English, Hindi; ₹ and 1,25,000 | ✅ | phone fully translated; web panel English with Gujarati names (decision) |
| Field UI: ≥ 48 px targets, ≥ 16 px text, defaults = yesterday | ✅ | `components/ui.tsx` |
| Photos ≤ 300 KB on the phone, private storage, signed URLs | ✅ | `lib/photos.ts`, `lib/storage.ts` |
| API p95 < 300 ms, dashboard < 1 s | ✅ locally (p95 ≤ 54 ms) | keep API and database in the same region (each query adds a few round trips for RLS) |
| Error tracking (app, web, API) | ✅ code / 🟡 DSN | all three report through the API to Sentry once `SENTRY_DSN` is set |
| Backups 30 days | ✅ script / 🟡 plan | `infra/backup.sh`; managed DB retention depends on the plan bought |
| Idempotent sync, report retries ×3 with alert | ✅ | tests |

Automated proof: 46 unit/API tests (`npm test`), 3 browser journeys (`npm run e2e`: supervisor incl. offline, owner on every page, store keeper/accountant/engineer), Android bundle builds (`expo export -p android`).

## Needs the owner's accounts (cannot be done in code)

1. **GitHub repo** for the code (then CI runs on every push).
2. **Hosting**: Render (API), Vercel (web + phone web build), Supabase or Render Postgres, R2/Supabase bucket — `docs/deployment.md`.
3. **SMS OTP**: MSG91 account + DLT-approved OTP template → `OTP_PROVIDER=msg91`.
4. **WhatsApp**: Meta Business number + approved `nightly_report` template → `WHATSAPP_*`.
5. **Android app**: Expo account and EAS project done (@pratik-senjaliya/site-diary). Left: `eas build -p android --profile pilot` once the API is on https, FCM key for push, Google Play developer account for the internal testing track. Steps: `docs/android.md`.
6. **Sentry** project (optional) → `SENTRY_DSN`.
7. **Pilot data**: each builder's contractors, materials, suppliers (Excel import) and sites.

## Verify on real devices before the first pilot site

These cannot be exercised in this container:
- Camera, GPS and photo upload on a ₹10k Android phone (Expo Go or the pilot APK); cold start < 3 s.
- Push notifications on the pilot APK.
- A real MSG91 SMS and a WhatsApp template message.
- Nightly job on the hosted API at 8 pm IST (Render must not sleep: paid instance).

## Deliberately later

- v2: contractor RA bills, budget vs actual, planning, Tally export, petty cash; lump-sum/per-unit contractor billing (v1 settles daily-rate labour).
- v3: equipment, post-sales, RERA pack, quality checklists, buyer view, AI helpers.
- Per-worker attendance (the v1 data model counts by contractor × skill; named workers are kept for advances).
- Custom units (v1 has a fixed unit list: bag, ton, brass, nos, cft, sq.ft, kg, litre, rft, cum).
- Online subscription payment (plans are set by Site Diary with `set-plan`).
