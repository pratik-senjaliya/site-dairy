# Site Diary — Product & Technical Scope

Oct 15, 2026 · @Pratik

## Overview

Site Diary is a Gujarati-first construction site management app for small and mid-size builders in Ahmedabad running 1–5 projects. It is feature-rich underneath and stays easy because each role sees only its own screens: a supervisor finishes daily entry in about 2 minutes, while the owner and office staff get material, contractor, costing and approval modules.

**Target customer:** builders and civil contractors with 1–5 live sites who run on Excel, notebooks and WhatsApp today. Owner decides; CA handles accounts and filings.

**Problem we solve:** the owner cannot be at every site, so labour headcount, material arrivals and usage, and contractor bills go unchecked. That leaks money every day and the CA only sees it at month-end.

**Goals for the first 6 months**

- 5 pilot builders using it daily within 4 weeks of v1 launch
- 15–20 paying sites within 6 months
- Supervisor daily entry under 2 minutes on a budget Android phone
- Owner reads the nightly report without opening the app

**How we win against Powerplay, Onsite and others**

- Gujarati first (Powerplay has no Gujarati), Hindi for labour-facing words
- Speed: big buttons, steppers instead of typing, photo-first entry, offline by default
- Nightly WhatsApp/PDF summary with alerts, so the owner gets value with zero effort
- Simple per-site pricing, well under the ₹72k/year of the big players
- Local, in-person onboarding through existing builder connections

## Users and roles

Five roles, each scoped to assigned sites (same pattern as nursing staff scoped to a department in the BME app). One company account = one tenant.

| Role | Where they work | Scope | Main jobs |
| --- | --- | --- | --- |
| Owner (admin) | Mobile + web | All sites | Dashboard, approvals, reports, user setup |
| Site engineer / manager | Mobile + web | Assigned sites | Planning, measurements, contractor bills, indents |
| Supervisor | Mobile only | Assigned sites | Attendance, material in/out, photos, notes |
| Store keeper | Mobile + web | Assigned sites | GRN, issue, stock, transfers |
| Accountant | Web | All sites, read-mostly | Payments, wage settlement, exports for CA |

**Permission matrix (v1)** — C = create, A = approve, V = view

| Module | Owner | Engineer | Supervisor | Store | Accountant |
| --- | --- | --- | --- | --- | --- |
| Projects & setup | C A V | V | V | V | V |
| Labour attendance | V A | C V | C V | – | V |
| Advances & wages | C A V | C V | C | – | C V |
| Material indent | A V | C V | C | C V | V |
| Purchase order | C A V | V | – | C V | V |
| GRN / issue / stock | V | V | C | C V | V |
| Progress & photos | V | C V | C V | – | – |
| Contractor RA bills (v2) | A V | C V | – | – | C V |
| Costing & reports | V | V (own sites) | – | – | V |
| Users & settings | C A V | – | – | – | – |

Rules: approval thresholds are set by the owner (e.g. PO above ₹50,000 needs owner approval); every create/edit/delete is written to the audit log.

## Tech stack and architecture

One TypeScript monorepo: an Expo app for the field, a Next.js web panel for the office, and a Node API on PostgreSQL. Shared types, validation and calculations live in one package so app, web and API never disagree.

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | Expo (React Native) + TypeScript, Expo Router | Proven by you at 100k-user scale; OTA updates for pilots |
| Offline store | WatermelonDB (SQLite) | Fast lists on cheap phones, built-in sync protocol |
| Web panel | Next.js + Ant Design | Same stack as the BME app; dense tables for office work |
| API | Node.js + Fastify (or NestJS) + TypeScript | Typed routes, fast, simple |
| Database | PostgreSQL + Prisma (or Drizzle) | Joins and aggregates for costing and reports |
| Files | S3-compatible storage (Cloudflare R2) | Cheap photo storage; signed upload URLs |
| Jobs | BullMQ + Redis | Nightly report, PDF generation, reminders |
| Messaging | WhatsApp Cloud API (Meta) via a BSP; fallback share link | Nightly report delivery |
| Auth | Phone OTP (MSG91 or Firebase Auth) + JWT with refresh | Supervisors don't use email |
| Shared package | Zod schemas, types, calc functions, i18n strings | One source of truth |
| Hosting | Single VPS or Railway/Render for API; Vercel for web | Low cost at pilot scale |

**Offline sync design**

- Every record has a client-generated UUID, `updated_at`, `deleted_at` and `server_rev`
- App pulls changes since its last `server_rev` and pushes local changes in one batch (WatermelonDB sync protocol)
- Conflict rule: last write wins per field for master data; daily entries (attendance, GRN) are append-only per user per day, so conflicts are rare
- Photos upload in a background queue after the record syncs; record shows "photo pending" until done
- App works fully offline for a site's last 30 days of data

**Multi-tenancy:** `company_id` on every table, enforced in API middleware and Postgres row-level security as a second guard.

## v1 scope (modules)

v1 ships seven modules that cover a site's daily money leaks: labour, material and progress, wrapped in setup, approvals and the nightly report.

**1. Company, projects and structure**

- Company profile, logo, GSTIN (optional), language default
- Project: name, address, RERA number (optional), start/end dates, budget
- Structure tree: project → tower/block → floor → (unit later); bulk create floors ("B block, 12 floors")
- Work-item templates per project type (RCC frame, load-bearing, bungalow): e.g. excavation, footing, column, slab, masonry, plaster, plumbing, electrical, flooring, finishing
- Bulk Excel import for contractors, materials and workers

**2. Contractors and labour**

- Contractor master: name, phone, trade, rate type (daily wage per skill / lump-sum / per unit)
- Skill master with Gujarati names: kadiya, majur, plumber, luhar, sutar, electrician, painter
- Daily attendance per site: count by contractor × skill (fast stepper), optional named workers, half-day, overtime hours
- Attendance photo (group photo with timestamp and GPS) as proof
- Advances (upad): amount, date, contractor/worker, given by
- Weekly/fortnightly wage settlement: days × rate − advances = payable; owner approves; mark paid (cash/UPI/bank)
- Edit lock: attendance locks at midnight; later edits need engineer approval and are logged

**3. Material and store**

- Material master with units (bag, ton, brass, nos, cft, sq.ft) and min-stock level per site
- Indent (request) from site → owner/engineer approval → purchase order to supplier (PDF/WhatsApp share)
- GRN (material received): challan photo, supplier, vehicle no., qty, linked PO (optional), shortage/rejection
- Issue/usage entry: material → work item/floor, qty
- Live stock per site = received − issued ± transfers; low-stock alert
- Site-to-site transfer with receive confirmation
- Supplier master and supplier ledger (amount due from GRNs, payments made)

**4. Daily progress**

- Daily diary per site: work items done today, floor, % complete, photos (multiple), note (voice-to-text)
- Weather/holiday/no-work day marker
- Issues log: problem, photo, assigned to, status (open/resolved)
- Floor-wise progress view (tower × floor × work item grid)

**5. Owner dashboard and approvals**

- Today across sites: labour count vs yesterday, material in/used, photos uploaded, missing entries
- Alerts: low stock, no entry by 7 pm, labour drop/spike > 20%, pending approvals
- Approval inbox: indents, POs above threshold, wage settlements, late edits

**6. Nightly report**

- Auto-generated at a set time (default 8 pm) per owner: all sites in one message + PDF with photos
- Delivered on WhatsApp (template message) with in-app copy; per-site report for engineers

**7. Users, settings and audit**

- Invite users by phone number, assign role and sites
- Approval thresholds, report time, language, units
- Audit log: who changed what, old/new value, when, from which device
- Subscription status and plan limits (sites, users)

## v2 and v3 scope

v2 adds the money-control layer builders will pay more for; v3 widens the product beyond the site.

**v2 (about 6 weeks after v1)**

- **Contractor work orders and RA bills:** BOQ items with rates per contractor; measurement entries (floor, item, qty, photo); running account bill = measured qty × rate − previous bills − retention − advances − deductions; engineer checks, owner approves; bill PDF
- **Budget vs actual:** budget per site by head (labour, material, contractor, other); actual from attendance, GRNs and bills; variance alerts
- **Planning:** planned start/end per work item and floor; planned vs actual timeline; delay flags in dashboard
- **Payments:** supplier and contractor payments, outstanding ledger, export to Excel/Tally format for CA
- **Petty cash / site expenses:** expense entry with bill photo, approval

**v3**

- **Equipment & shuttering:** owned/hired equipment, hire charges per day, shuttering and scaffolding stock per site, repairs (reuse BME asset logic)
- **Post-sales add-on:** unit inventory, bookings, construction-linked payment schedule, WhatsApp demand letters and receipts
- **RERA data pack:** quarterly floor-wise progress with photos, collections summary, ready for the CA/engineer certificate
- **Quality checklists:** pour cards, cube test entries, inspection checklists with photos
- **Client/buyer progress view:** read-only progress photos link for buyers
- **AI helpers:** read challan photos into GRN fields, summarise the day's notes, flag anomalies (labour spike, stock mismatch)

**Out of scope for now:** full accounting/GST filing (stays with CA), Gantt-heavy project scheduling, estimation/BOQ generation from drawings, payroll compliance (PF/ESI).

## Data model (v1)

Every table carries `id` (UUID, client-generated), `company_id`, `created_by`, `created_at`, `updated_at`, `deleted_at` (soft delete) and `server_rev` (sync). Money is stored in paise as integers; quantities as decimal(12,3).

| Entity | Key fields | Notes |
| --- | --- | --- |
| companies | name, gstin, logo\_url, plan, settings (json: report\_time, thresholds, language) | Tenant root |
| users | name, phone, role, language, is\_active | Phone OTP login |
| user\_sites | user\_id, project\_id | Site scoping |
| projects | name, address, rera\_no, start\_date, end\_date, budget\_paise, type, status |  |
| structure\_nodes | project\_id, parent\_id, kind (tower/floor/unit), name, sort | Tree |
| work\_items | project\_id, name\_gu, name\_en, template\_id, sort | From template |
| contractors | name, phone, trade, rate\_type |  |
| skills | name\_gu, name\_en | Seeded list, editable |
| contractor\_rates | contractor\_id, skill\_id, daily\_rate\_paise, effective\_from | Rate history |
| workers (optional) | contractor\_id, name, skill\_id, phone | Named attendance |
| attendance\_entries | project\_id, date, contractor\_id, skill\_id, count, half\_day\_count, ot\_hours, photo\_id, locked | One row per site × date × contractor × skill |
| advances | project\_id, contractor\_id, worker\_id?, amount\_paise, date, mode | Upad |
| wage\_settlements | contractor\_id, project\_id, period\_from, period\_to, gross\_paise, advances\_paise, net\_paise, status, approved\_by, paid\_at |  |
| materials | name\_gu, name\_en, unit, category | Seeded |
| site\_material\_settings | project\_id, material\_id, min\_stock | Alerts |
| suppliers | name, phone, gstin |  |
| indents | project\_id, status, requested\_by, approved\_by, needed\_by | + indent\_lines (material\_id, qty) |
| purchase\_orders | supplier\_id, project\_id, indent\_id?, status, total\_paise | + po\_lines (material\_id, qty, rate\_paise) |
| grns | project\_id, supplier\_id, po\_id?, challan\_no, vehicle\_no, date, photo\_ids | + grn\_lines (material\_id, qty, rejected\_qty, rate\_paise?) |
| material\_issues | project\_id, material\_id, qty, work\_item\_id?, structure\_node\_id?, date | Usage |
| stock\_transfers | from\_project, to\_project, material\_id, qty, status |  |
| stock\_ledger | project\_id, material\_id, qty\_delta, source\_type, source\_id, date | Derived; stock = sum(qty\_delta) |
| daily\_progress | project\_id, date, work\_item\_id, structure\_node\_id, percent, note | + photos |
| issues | project\_id, title, photo\_ids, assigned\_to, status |  |
| photos | storage\_key, taken\_at, lat, lng, uploaded, source\_type, source\_id |  |
| approvals | entity\_type, entity\_id, requested\_by, decided\_by, status, reason | Generic inbox |
| reports | company\_id, date, pdf\_key, sent\_at, channel | Nightly log |
| audit\_log | entity\_type, entity\_id, action, before (json), after (json), user\_id, device\_id, at | Append-only |

## Screens

The mobile app opens to a role-based home; the web panel holds the dense office screens. The 5-screen demo canvas already covers the supervisor flow and the owner report.

**Mobile app (Expo)**

| # | Screen | Roles | Notes |
| --- | --- | --- | --- |
| M1 | Login (phone + OTP), language pick | All | Gujarati / English / Hindi |
| M2 | Site picker | All | Remembers last site |
| M3 | Supervisor home: 4 tiles + send report | Supervisor | Shown in demo |
| M4 | Attendance: contractor × skill steppers, group photo | Supervisor, Engineer | Shown in demo |
| M5 | Advance (upad) entry | Supervisor, Engineer |  |
| M6 | Material received (GRN): challan photo, chips, qty | Supervisor, Store | Shown in demo |
| M7 | Material used (issue) | Supervisor, Store |  |
| M8 | Indent request | Supervisor, Engineer |  |
| M9 | Daily progress: work items, %, photos, note | Supervisor, Engineer | Shown in demo |
| M10 | Issue report | Supervisor, Engineer |  |
| M11 | Site stock list | All on site | Low stock highlighted |
| M12 | Owner dashboard: all sites, alerts | Owner |  |
| M13 | Approval inbox (approve/reject with note) | Owner, Engineer |  |
| M14 | Site detail: today, labour trend, photos | Owner, Engineer |  |
| M15 | Report viewer / history | Owner, Engineer | Shown in demo |
| M16 | Sync status & pending uploads | All | Offline queue |
| M17 | Profile & settings | All |  |

**Web panel (Next.js)**

| # | Screen | Roles |
| --- | --- | --- |
| W1 | Dashboard (multi-site KPIs, alerts) | Owner, Accountant |
| W2 | Projects, structure tree, work-item templates | Owner |
| W3 | Contractors, skills, rates, workers | Owner, Engineer |
| W4 | Attendance register (site × date grid) + edit approvals | Engineer, Accountant |
| W5 | Wage settlement & payment | Accountant, Owner |
| W6 | Materials, suppliers, min stock | Store, Owner |
| W7 | Indents & purchase orders | Store, Engineer, Owner |
| W8 | GRN register, stock ledger, transfers | Store, Accountant |
| W9 | Progress grid (tower × floor × item) + photo gallery | Engineer, Owner |
| W10 | Reports & exports (Excel/PDF for CA) | Owner, Accountant |
| W11 | Users, roles, site access | Owner |
| W12 | Settings, thresholds, subscription | Owner |
| W13 | Audit log viewer | Owner |
| W14 | Bulk import (Excel templates) | Owner |

## Non-functional requirements

Speed and simplicity are the product's identity, so they are written as testable targets.

**Ease of use**

- Supervisor daily entry ≤ 2 minutes, ≤ 3 taps per entry after the first day (defaults = yesterday's values)
- Touch targets ≥ 48 px, body text ≥ 16 px, steppers and chips instead of typing
- Every screen usable by someone who reads Gujarati but not English

**Language**

- Gujarati default, English and Hindi switchable per user; all strings in shared i18n files from day one
- Material, skill and work-item names stored in both Gujarati and English
- Indian number format (1,25,000) and ₹ everywhere

**Performance**

- Cold start < 3 s on a ₹10k Android phone (2–3 GB RAM)
- Lists of 1,000 rows scroll at 60 fps (FlashList + WatermelonDB)
- API p95 < 300 ms; dashboard < 1 s for 5 sites
- Photos compressed on device to ≤ 300 KB before upload

**Offline**

- All supervisor and store flows work with no network; sync on reconnect and in background
- Clear sync badge on home; never lose an entry

**Security and data**

- OTP login, JWT access token (15 min) + refresh token, device binding
- Tenant isolation (company\_id + row-level security)
- Role and site checks in API, not only in UI
- Append-only audit log; soft delete only; nightly Postgres backups with 30-day retention
- Photos via signed URLs; no public buckets

**Reliability**

- Idempotent sync endpoints (client UUIDs)
- Error tracking (Sentry) on app, web and API
- Nightly report job retries 3 times and alerts on failure

## Notifications and reports

The nightly owner report is the product's hook; everything else is a push notification or an export.

| Trigger | To | Channel | When |
| --- | --- | --- | --- |
| Nightly site summary + PDF | Owner (all sites), engineer (own sites) | WhatsApp template + push + in-app | Daily at set time (default 8 pm) |
| No entry by cutoff | Supervisor, then engineer | Push | 7 pm |
| Low stock (below min) | Store, engineer, owner | Push + in nightly report | On GRN/issue |
| Approval needed | Approver | Push | On submit |
| Approved / rejected | Requester | Push | On decision |
| Labour change > 20% vs 7-day average | Owner | In nightly report | Nightly |
| Late edit to locked attendance | Owner | Push + audit | On edit |
| Weekly wage settlement due | Accountant, owner | Push | Saturday |

**Reports and exports (web, PDF/Excel)**

- Daily site report (labour, material, progress, photos)
- Attendance register by contractor and period
- Wage settlement sheet
- Material: GRN register, stock statement, consumption by floor/work item
- Supplier ledger
- Monthly site summary for the CA (labour cost, material purchases, payments)

WhatsApp needs approved message templates and a business number; until approval, the app shares the PDF through the phone's share sheet.

## Build plan and milestones

v1 takes about 8 weeks solo with AI-assisted development, then a 4-week pilot before v2.

&#91;embedded content: build roadmap · 5 phases, 4 gates\]

Each gate must pass before the next phase starts. If builder interviews in week 1 point to post-sales or RA bills as the bigger pain, swap that module into weeks 6–8 and push the web masters later.

## Pricing and pilot plan

Price per active site, so a builder pays more only as they grow. Numbers below are starting points to test in pilots.

| Plan | Price | Includes |
| --- | --- | --- |
| Pilot | Free for 60 days | Full v1, up to 2 sites, in-person setup |
| Basic | ₹999 / site / month | Labour, material, progress, nightly report, 5 users per site |
| Pro | ₹1,999 / site / month | Basic + approvals, wage settlement, web panel exports, unlimited users |
| Annual | 2 months free | Paid upfront |
| Setup | ₹2,500 one-time (optional) | Bulk import of contractors, materials, structure; staff training on site |

**Pilot plan**

1. Pick 3–5 builders from your network with at least one active site each
2. Visit each site once: install the app on the supervisor's phone, train in 15 minutes, set report time
3. Week 1–2: call the supervisor daily for 2 minutes; fix friction fast through OTA updates
4. Week 3–4: review the owner's nightly reports with them; record what they acted on
5. Day 45: ask for conversion to paid; ask each for one referral and a short Gujarati video testimonial

**Pilot success:** 4 of 5 sites entering data on 80% of working days, and 3 owners willing to pay.

## Open questions for builder interviews

Ask these in the demo meetings; the answers change scope or pricing.

- [ ] Last month, where did you lose money or get cheated on site?
- [ ] How do you track labour today (notebook, WhatsApp photo, contractor's word)? Who pays them and how often?
- [ ] Do contractors bring their own labour on daily rates, or do you hire workers directly?
- [ ] Who receives material on site, and how do you check the challan against what arrived?
- [ ] Does one supervisor handle one site or several? What phone do they use?
- [ ] Would your supervisor fill this in daily? What would stop them?
- [ ] What do you want to know every night without calling anyone?
- [ ] Who should approve purchases, and above what amount?
- [ ] What do you send your CA every month, and in what format?
- [ ] Do you use any app or software today? What do you pay, and what do you dislike?
- [ ] Would ₹999–₹1,999 per site per month be easy, OK, or too much?
- [ ] Which matters more next: contractor RA bills, budget vs actual, or buyer installments?

## Claude Code handoff

Start a Claude Code session in an empty repo, paste this doc's link or contents, and give it the first task below. Keep this doc as the source of truth and update it when scope changes.

**Repo layout (pnpm + Turborepo)**

```
site-diary/
  apps/
    mobile/        # Expo app (Expo Router, WatermelonDB, FlashList)
    web/           # Next.js + Ant Design office panel
    api/           # Fastify + Prisma, BullMQ workers
  packages/
    shared/        # Zod schemas, types, calc (wages, stock), constants
    i18n/          # gu.json, en.json, hi.json
    ui-tokens/     # colors, spacing, type scale shared by app and web
  infra/           # docker-compose (postgres, redis), env examples
  docs/            # this scope, ADRs
  CLAUDE.md
```

**Conventions for CLAUDE.md**

- TypeScript strict everywhere; no `any`
- All user-facing strings through i18n keys, Gujarati first
- Money in paise (integer), quantities decimal(12,3), dates as ISO `YYYY-MM-DD` in Asia/Kolkata
- Every table: UUID id, company\_id, timestamps, deleted\_at, server\_rev
- API validates with shared Zod schemas; role + site checks in middleware
- Business calculations only in `packages/shared` with unit tests
- Mobile: offline-first; never call the API directly from screens, go through the sync layer
- Small PRs per module; Conventional Commits

**First tasks, in order**

1. Scaffold the monorepo, docker-compose (Postgres, Redis), lint, CI
2. Prisma schema for v1 entities + seed (skills, materials, work-item templates in Gujarati/English)
3. Auth: phone OTP, JWT, roles, site scoping middleware, audit log hook
4. Sync endpoints (pull/push with server\_rev) + WatermelonDB models in mobile
5. Mobile: login, site picker, supervisor home, attendance (match demo screens)
6. Mobile: GRN with photo queue, issue, stock; progress with photos
7. Web: projects/structure, contractors, materials, attendance register
8. Owner dashboard + approval inbox (mobile and web)
9. Nightly report job: aggregate → PDF → WhatsApp/share
10. Pilot hardening: Sentry, backups, OTA channel, Play Store internal testing
