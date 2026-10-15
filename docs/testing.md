# Trying Site Diary

Three ways, from quickest to most real. Demo logins (after the seed) use OTP **123456** while the API runs with `OTP_PROVIDER=dev` and `OTP_DEV_CODE=123456`:

| Person | Phone | Sees |
|---|---|---|
| Rameshbhai Patel — owner | 98000 00001 | every site, dashboard, approvals, all reports |
| Hardik Shah — site engineer | 98000 00002 | Shivam Heights: entries, approvals for indents and late attendance |
| Kanubhai Rathod — supervisor | 98000 00003 | Shivam Heights: attendance, material, progress, issues |
| Vipul Prajapati — store keeper | 98000 00004 | Shivam Heights: GRN, issue, stock, transfers |
| Nisha Mehta — accountant | 98000 00005 | every site, wages, payments, exports (English) |

Any other number signs up as a new company (owner) with the starting lists already filled in.

## 1. On a computer (everything local)

```bash
npm install
npm run db:up                       # or any Postgres 16; set apps/api/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:migrate -w apps/api && npm run db:seed -w apps/api
npm run dev:api                     # :4000
npm run dev:web                     # :3000  office panel
cd apps/mobile && npx expo start --web   # :8081, the phone app in a browser
```

Open http://localhost:8081 in Chrome, press F12 → device toolbar → a phone size. That is the field app.

## 2. On your Android phone with Expo Go (same Wi-Fi as the computer)

1. Install **Expo Go** from the Play Store.
2. On the computer: `npm run dev:api`, then `cd apps/mobile && npx expo start`.
3. Scan the QR code with Expo Go.
4. The app talks to the API on the same computer automatically (it shows **Server: http://<your IP>:4000** under the login). If your firewall blocks port 4000, allow it.

Expo Go has the camera, location, offline storage and sharing that the app uses, so every field flow works. Push notifications need a development build (below).

## 3. A real install (pilot)

- **API + database + photos**: `render.yaml` (Render), Postgres on Supabase or Render, a private R2/Supabase bucket. Details in `docs/deployment.md`.
- **Office panel**: Vercel project with root `apps/web` (`vercel.json` is there); set `API_URL` to the API address.
- **Phone app in a browser** (fastest to share with a builder): Vercel project with root `apps/mobile`; set `EXPO_PUBLIC_API_URL` to the API address and add that site's URL to the API's `WEB_ORIGIN`.
- **Android app (APK)**: `npx eas-cli@latest build -p android --profile pilot` (needs a free Expo account; set the API address in `eas.json`). Over-the-air fixes during the pilot: `npx eas-cli@latest update --channel pilot`.

## Automated checks

```bash
npm run lint && npm run typecheck && npm test     # unit + API integration tests (needs the database)
npm run e2e:phone                                  # supervisor journey on a 375 px phone, incl. offline entry
npm run e2e:web                                    # every office page as the owner, approve an indent, make a PO
```
The e2e scripts need the API on :4000, the phone web build on :8081 and `next start` on :3000.
