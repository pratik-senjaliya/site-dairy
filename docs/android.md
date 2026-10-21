# Android app — build and install on a phone

How to get Site Diary onto an Android phone from your own computer. Written so that you, or a Claude Code session in a terminal at the repo root, can follow it step by step. Claude: run the commands yourself, but stop and ask whenever a step says **(you)**. Those steps need a person's browser login or a physical phone.

There are three ways to try the app on a phone:

| Way | Needs a server? | Best for |
|---|---|---|
| **A. Demo APK** (`demo` profile) | No. The app answers itself; entries stay on the phone | Trying every screen, showing a builder |
| **B. Expo Go** against your computer | API on your computer, same Wi-Fi | Developing: changes show on the phone in seconds |
| **C. Pilot APK** (`pilot` profile) | API on the internet over **https** | Real use on site |

APKs are built on Expo's servers (EAS Build), so you don't need Android Studio. Builds on the free plan usually take 10–30 minutes, sometimes longer in a queue.

## 0. One-time setup (already done once; repeat only on a new computer)

```bash
node -v                       # 20 or newer
git clone https://github.com/pratik-senjaliya/site-dairy.git && cd site-dairy
npm install                   # always from the repo root, never inside apps/mobile
cd apps/mobile
npx eas-cli@latest login      # (you) opens the browser; account: pratik-senjaliya
```

The EAS project is already linked: **@pratik-senjaliya/site-diary**, ID `6f333777-ca21-43ad-b1ef-8caadba2b246`. The ID is in `apps/mobile/app.json` under `extra.eas.projectId`, with `updates.url` and `runtimeVersion` for EAS Update. Don't run `eas init` again on a computer that has this `app.json`. If `app.json` has no `projectId`, someone's link was never pushed: run `npx eas-cli@latest init`, choose the `pratik-senjaliya` account, and push the changed `app.json`, `apps/mobile/package.json` and `package-lock.json`.

Every command below runs from `apps/mobile` unless it says otherwise.

## A. Demo APK — no server

```bash
npx eas-cli@latest build -p android --profile demo
```

- "Generate a new Android Keystore?" → **Yes** (first build only; Expo keeps it).
- "Command must be re-run…" after it installs or configures something → run the same command again. It's a restart, not an error.
- To start the build and get your terminal back, add `--no-wait` and follow the build at expo.dev → Projects → site-diary → Builds.

When it finishes, the terminal prints a build page link and a QR code.

**Install (you):**
1. On the phone, open the link or scan the QR with the camera, then tap **Install** (or Download).
2. Android asks to allow installs from this source (Chrome or Files): allow it, go back, and tap Install. If Play Protect warns about an unknown app, choose **Install anyway**. It's your own unsigned-for-Play build.
3. Open **Site Diary**, pick a role on the login screen (supervisor first), and try the flows. Profile → **Switch person** to see the owner's side; **Start the demo again** wipes the phone's entries.

With a phone on USB with debugging on, you can install the file instead: download the `.apk` from the build page, then `adb install -r site-diary.apk`.

**Later demo builds:** run the same command again. The version code goes up by itself (`appVersionSource: remote` with `autoIncrement` on `demo` and `pilot`), so the new APK installs over the old one and the phone keeps its demo data.

## B. Expo Go against your computer — for development

1. **(you)** Install **Expo Go** from the Play Store. Put the phone on the same Wi-Fi as the computer.
2. At the repo root: Postgres running and seeded (see `CLAUDE.md` → Commands), then `npm run dev:api`.
3. In a second terminal at the repo root: `npm run dev:mobile`. It builds the shared packages and starts Expo with a QR code.
4. **(you)** Scan the QR with Expo Go. The login screen shows **Server: http://<computer IP>:4000**. Sign in with a demo phone (supervisor `9800000003`, OTP `123456` when the API runs with `OTP_DEV_CODE=123456`) or use the demo buttons.

If the phone can't reach the computer, allow port 4000 (API) and 8081 (Expo) through the firewall (`sudo ufw allow 4000,8081/tcp` on Ubuntu), or start Expo with `npx expo start --tunnel`.

Expo Go covers everything except phone push notifications, which need an APK (A or C).

## C. Pilot APK — the real app against a hosted API

1. Deploy the API first (`docs/deployment.md`): it must be reachable over **https**. Android blocks plain `http://` addresses in release APKs, so an APK can't talk to `http://192.168.x.x:4000` on your laptop. Use B for that.
2. Put the API address in `apps/mobile/eas.json` → `build.pilot.env.EXPO_PUBLIC_API_URL` (now `https://site-diary-api.onrender.com`) and commit it.
3. `npx eas-cli@latest build -p android --profile pilot`
4. Install as in A. Users sign in with their phone number and OTP (MSG91 must be set up on the API, see `docs/release-checklist.md`).

Push notifications in this APK also need Firebase: create a Firebase project with the Android app `in.sitediary.app`, then upload its FCM V1 service-account key with `npx eas-cli@latest credentials` → Android → Push Notifications (you, once). Without it, everything else works and notices stay in the in-app bell.

**Fixes without a new APK:** changes to JavaScript only (screens, text, logic) can go out over the air:
```bash
npx eas-cli@latest update --channel pilot --message "what changed"   # or --channel demo
```
Phones pick the update up on the next start (or the one after). Native changes (a new Expo package, `app.json` permissions or plugins, the SDK version) need a new build, and a new build is needed after changing `version` in `app.json`, because `runtimeVersion` follows the app version.

## Build profiles (`apps/mobile/eas.json`)

| Profile | Output | Server | Channel |
|---|---|---|---|
| `demo` | APK | none (`EXPO_PUBLIC_DEMO=1`) | `demo` |
| `pilot` | APK | `EXPO_PUBLIC_API_URL` | `pilot` |
| `production` | AAB for Google Play | set `EXPO_PUBLIC_API_URL` before using | `production` |
| `development` | dev client | — | needs `npx expo install expo-dev-client` first (not installed) |

How the cloud build works: EAS uploads the repo, runs `npm install` at the root, then `eas-build-post-install` in `apps/mobile/package.json` compiles `packages/*` (their `dist/` isn't in git). If a build fails with "Cannot find module '@site-diary/shared'" or similar, that hook is missing or broken.

## When something goes wrong

| Message | Fix |
|---|---|
| `Failed to resolve plugin for module "expo-router"… Do you have node modules installed?` | `npm install` at the repo root, then back to `apps/mobile`. |
| `Command must be re-run to pick up new … configuration` | Run the same command again. |
| `cd: site-dairy/apps/mobile: No such file or directory` | You're already inside; check with `pwd`. |
| `Not logged in` / `EXPO_TOKEN` errors | `npx eas-cli@latest login`, or `export EXPO_TOKEN=…` (expo.dev → Account settings → Access tokens) for a terminal with no browser. Never commit the token. |
| Build failed on Expo | Open the build page → the red step → copy the log end. In Claude Code: `npx eas-cli@latest build:view <build id>` shows the summary and log links. |
| App installed but the login shows a server address | That's a non-demo build: use the `demo` profile, or set the server address on the login screen (https only in an APK). |
| "App not installed" over an older install | Uninstall the old one first (it was signed with a different key, e.g. a build from another Expo account). |
| A regular web or e2e build shows the demo banner | The bundler kept `EXPO_PUBLIC_DEMO` from an earlier export: `npm run build:mobile-web` (it uses `--clear`). |

## Also: the demo in a browser

`npm run build:demo-page` (repo root) writes `site-diary-demo.html`: one self-contained file with the same demo. Open it on any phone or computer, or host it anywhere static. `node e2e/demo.mjs <url>` checks it end to end.
