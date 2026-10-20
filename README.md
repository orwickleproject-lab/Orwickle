# Orwickle

Flutter mobile app (`mobile/`), Express API (`backend/`) and a separate React administrator account panel (`admin/`). Scope is limited to signup, email OTP login, password recovery, protected account access and session management. The exact request is saved in [docs/AUTH_SCOPE.md](docs/AUTH_SCOPE.md).

Existing private repository: [orwickleproject-lab/Orwickle](https://github.com/orwickleproject-lab/Orwickle). Existing Free-plan Supabase project: [orwickle-dev](https://supabase.com/dashboard/project/pteqcyrstpxvvwkwujuj), Orwickle organization, Mumbai. Reuse these resources. The original Flutter starter remains in commit `2251b47`; the complete pre-auth foundation is tagged `checkpoint/pre-auth-20261020`.

**Live authentication setup is pending the prerequisites listed in [verification status](docs/VERIFICATION.md).** Local automated checks are separate from real email/database verification.

On this machine the actual schema, restricted runtime role, administrator and real email sender are configured. SMTP authentication and actual OTP delivery passed. The remaining blocker is PostgreSQL TCP connectivity: both ports still time out after verified endpoint/DNS checks, a normal-terminal comparison and a hotspot retry. See [network evidence](docs/NETWORK_DIAGNOSTICS.md). Full hosted auth flows are not yet verified.

## Requirements

Node 24, npm, the existing Flutter/Android SDK and emulator, and access to the existing Supabase database. Gmail email delivery uses a Google app password for the project email, entered locally. No new account, paid plan, Firebase or Supabase Auth is required.

## Local credentials and database setup

Existing credentials remain in ignored files. Never paste passwords, tokens, codes or database URIs into chat, Git or command arguments. Runtime credentials belong in `backend/.env`; owner setup credentials belong in `backend/.env.migrations`. Examples contain placeholders only.

From the project root, once PostgreSQL is reachable:

```powershell
.\scripts\migrate-auth.ps1
```

The idempotent migration preserves an owner environment separately, creates the private auth schema and a restricted `orwickle_app` role, then writes a restricted runtime URI and random session/OTP secrets locally. It never displays credentials. Owner access is used only for migrations, administrator provisioning and private-storage setup. Do not replace the runtime URI with the owner URI after migration.

The current schema was applied with the setup-only `scripts/migrate-auth-management.ps1` path using the existing DPAPI-protected account token over HTTPS. This path generates the database password inside PostgreSQL so plaintext credentials do not occur in SQL text. It is not a runtime fallback: Express continues to require the normal authenticated PostgreSQL/TLS connection.

TLS certificate and hostname verification remain enabled. The existing Supabase CA lives in ignored `backend/.secrets/supabase-ca.crt`. Paths are relative to `backend/`. The verified Supabase Root 2021 SHA-256 is `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`, expiry 2031-04-26. On another machine, obtain the certificate from this project's database settings. Never disable TLS verification or add URL query parameters that override it.

For email, enable Google 2-Step Verification if needed, create an [app password](https://myaccount.google.com/apppasswords) named Orwickle development while signed into the project email, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configure-email.ps1
```

Enter it only at the hidden prompt. The helper saves it in the ignored, user-only backend environment and verifies SMTP. Restart the backend after configuration changes. See [security boundaries](docs/AUTH_SECURITY.md) for password, OTP, session and permission details.

## Run the backend

```powershell
cd C:\Flutter_dev\projects\Orwickle\backend
npm.cmd ci
npm.cmd run dev
```

`npm.cmd start` runs without watching. Address: `http://127.0.0.1:3000`. Keep the local API on loopback; the Android emulator reaches it using `10.0.2.2`. Before taking over a background server started by setup, run `.\scripts\stop-setup-backend.ps1` from the project root. It verifies the recorded process belongs to this project.

`GET /health/live` checks Express. `GET /health/ready` runs a real PostgreSQL query and verifies its authenticated TLS socket; it returns 503 when the database is unavailable. Health checks remain independent of auth. API errors are sanitized and include request IDs.

## Run Flutter

From the project root, with the backend running:

```powershell
.\scripts\flutter-android.ps1 pub get
.\scripts\flutter-android.ps1 run -d emulator-5554 --dart-define=BACKEND_BASE_URL=http://10.0.2.2:3000
```

This wrapper disables Windows desktop generation only for that command, avoiding a Windows symlink/Developer Mode requirement when building Android. It preserves global Flutter settings. Ordinary `flutter run` also works on machines with symlink support.

Create an account as Student, Investor or Buyer, verify the signup email, then sign in using password followed by a fresh email code. Account screens show verified identity and active sessions, with current/other-session sign-out. A valid saved session opens the account on restart. In debug builds, press and hold the Orwickle logo to open **Development connection → Check connection** for real emulator-to-backend verification; it is absent in release builds.

The mobile authentication screens follow the supplied white/navy/teal reference, including role cards and a six-cell code input with native paste and autofill support. Plus Jakarta Sans is bundled for offline use; its SIL Open Font License is included at `mobile/assets/fonts/OFL.txt`.

To capture the four authentication screens on the Android emulator:

```powershell
.\scripts\flutter-android.ps1 drive --driver=test_driver/auth_ui_driver.dart --target=integration_test/auth_ui_test.dart -d emulator-5554
```

This presentation test uses explicit authentication fixtures and writes PNGs to ignored `.local/ui-screenshots/`. Run the normal Flutter command afterward to restore the app with its actual backend connection.

## Run the administrator web panel

```powershell
cd C:\Flutter_dev\projects\Orwickle\admin
npm.cmd ci
npm.cmd run dev
```

Open **http://localhost:5173**, matching `ADMIN_ORIGIN` in the backend environment. Vite proxies `/api` to the same Express server. Administrator signup is not public. Provision once, from the project root, using the owner-only local helper:

```powershell
.\scripts\provision-admin.ps1
```

It uses `orwickleproject@gmail.com` by default and accepts the initial password at a hidden prompt. Existing administrators are preserved; existing public accounts are never promoted. If the live integration runner has already provisioned the project-email administrator, use **Forgot password?** to choose a password instead. Every fresh administrator login still requires email OTP. The panel contains only account access, recovery and session management.

The project-email administrator is already provisioned on this machine. After the network blocker is resolved, use **Forgot password?** to choose its first usable password; no provisioning command is needed again.

## Checks

```powershell
cd C:\Flutter_dev\projects\Orwickle\backend
npm.cmd run check
npm.cmd test
npm.cmd audit --omit=dev
npm.cmd run verify:db
# Requires running Express, migrated Supabase, real configured SMTP and Gmail IMAP access:
npm.cmd run verify:auth:live

cd ..\admin
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --omit=dev

cd ..
.\scripts\flutter-android.ps1 analyze
.\scripts\flutter-android.ps1 test
.\scripts\flutter-android.ps1 test integration_test/secure_storage_test.dart -d emulator-5554
.\scripts\flutter-android.ps1 test integration_test/backend_connection_test.dart -d emulator-5554 --dart-define=REQUIRE_DATABASE=true
```

Backend auth tests run an isolated PostgreSQL engine through PGlite with an in-memory email sender. Flutter unit/widget and React/browser tests use response fixtures. The live integration script separately exercises actual Express, existing Supabase and delivered email OTPs; it reads only exact tagged test emails and prints no secrets. Browser screenshots and live test evidence stay in ignored `.local/`.

## Existing Supabase tools and private storage

The management token is protected with Windows DPAPI outside the repository, tied to this Windows user. Its temporary plaintext file was removed. The backend never uses this management token. The existing helper loads it into a process environment only for the CLI:

```powershell
.\scripts\supabase.ps1 whoami --output-format json
.\scripts\supabase.ps1 projects list --output-format json
```

The existing `orwickle-confidential` bucket remains private, with a 10 MiB limit and no public upload/download policies. No confidential-file API is added in this scope. Storage setup requires owner privileges; after credential separation run `node --env-file=.env.migrations scripts/setup-storage.js` from `backend/` only when maintenance is required.

Secrets, dependencies, generated builds, local evidence and signing material are ignored. Lockfiles are committed. See [current verification evidence](docs/VERIFICATION.md) and [auth security decisions](docs/AUTH_SECURITY.md). No marketplace features or production deployment are included.
