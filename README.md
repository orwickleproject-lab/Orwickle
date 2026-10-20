# Orwickle development foundation

Flutter client in `mobile/`, Express 5 API in `backend/`, and Supabase PostgreSQL/storage. The original counter starter is preserved in Git commit `2251b47`.

Private repository: [orwickleproject-lab/Orwickle](https://github.com/orwickleproject-lab/Orwickle). GitHub CLI is authenticated as `orwickleproject-lab`; the root repository uses its credential helper locally, preserving global Git settings.

Development backend: [orwickle-dev](https://supabase.com/dashboard/project/pteqcyrstpxvvwkwujuj), in the **Orwickle** organization on the verified **Free** plan. PostgreSQL 17 is hosted in Mumbai (`ap-south-1`). Reuse this project; the local backend is already connected to it.

## Requirements

- Node.js 24 LTS and npm (verified here: Node 24.10.0, npm 11.6.1).
- Existing Flutter/Android setup (verified here: Flutter 3.47.7, Dart 3.13.5, Android emulator `emulator-5554`).
- Access to the existing Supabase development project and private GitHub repository. See [verification status](docs/VERIFICATION.md) for the tested results.

## Start the backend

In PowerShell:

```powershell
cd C:\Flutter_dev\projects\Orwickle\backend
npm.cmd ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

The local `.env` already exists on this machine and contains the actual database connection. `npm.cmd start` runs without file watching. Default address: `http://127.0.0.1:3000`. The Android emulator reaches the host through `10.0.2.2`; no LAN binding or firewall exception is needed. Keep the API on loopback for local development. If the backend is already running, reuse it rather than starting a second process on port 3000.

Setup leaves the API running in the background. Before taking over with `npm.cmd run dev`, run `.\scripts\stop-setup-backend.ps1` from the project root. It checks the recorded process and project entry point before stopping it; it does not stop an unrelated process.

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health/live
Invoke-RestMethod http://127.0.0.1:3000/health/ready
```

`GET /health/live` verifies Express is running. `GET /health/ready` executes `SELECT 1, CURRENT_TIMESTAMP` through the PostgreSQL pool and verifies an authenticated TLS socket before returning `database: "ok", tls: true`. Until the real database is configured/reachable it returns HTTP 503; liveness remains available. Error responses include a request ID, with no credentials or database error details.

## Start Flutter on the existing Android emulator

In a second terminal, with the backend running:

```powershell
cd C:\Flutter_dev\projects\Orwickle\mobile
flutter pub get
flutter run -d emulator-5554 --dart-define=BACKEND_BASE_URL=http://10.0.2.2:3000
```

Tap **Check connection**. The original counter still works. The panel distinguishes a reachable backend from a verified database connection. Only the debug Android manifest permits cleartext HTTP, scoped to the emulator host and loopback addresses. Release configuration is unchanged. Future deployed APIs must use HTTPS; no Supabase credentials belong in Dart defines or Flutter assets.

## Connect the Supabase development project

The existing project is configured for the account associated with `orwickleproject@gmail.com`. The following steps are for a fresh checkout or credential replacement; remain on the Free plan and reuse `orwickle-dev`.

1. In the project's **Connect** dialog, use the PostgreSQL **Session pooler** URI (supports IPv4). Put it only in `backend/.env` as `DATABASE_URL`. URL-encode password characters. Omit URI query parameters; the driver configures TLS separately and rejects attempts to override it.
2. TLS certificate and hostname verification are always enabled. This project requires Supabase's root CA, already saved in ignored `backend/.secrets/supabase-ca.crt`, with `DATABASE_SSL_CA_FILE=.secrets/supabase-ca.crt`. On another machine, download the CA from the dashboard's Database Settings. Never set `rejectUnauthorized: false` or disable TLS. Server-side SSL enforcement is also enabled and verified.
3. Run from `backend/`:

   ```powershell
   npm.cmd run verify:db
   npm.cmd run storage:setup
   ```

4. Restart Express after changing `.env`. Verify `/health/ready`, then rerun the emulator test with `REQUIRE_DATABASE=true` below.

`storage:setup` idempotently creates the `orwickle-confidential` bucket with `public=false` and a 10 MiB file limit. It verifies privacy and refuses to call an existing public bucket safe. It creates no upload/download policies. Confidential files must be authorized by Express before access or short-lived signed URLs are provided. Do not make the bucket public.

Connection options follow the [Supabase PostgreSQL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

The installed Supabase Root 2021 CA has SHA-256 `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7` and expires on 2031-04-26. Its download location was verified against [Supabase Studio's official configuration](https://github.com/supabase/supabase/blob/72324ca0f7ae06097fbaea5128d1f2def0cf3d43/apps/studio/hooks/custom-content/custom-content.json).

## Supabase CLI account access on this Windows machine

The account token is encrypted with Windows DPAPI in `%LOCALAPPDATA%\Orwickle\secrets\supabase-token.dpapi`, outside this repository, with a user-only filesystem ACL. The temporary plaintext token file was removed after encryption and successful decryption were verified. The backend does not need this account-management token.

From the project root, the helper loads it into `SUPABASE_ACCESS_TOKEN` only for the CLI process and restores the previous environment afterward:

```powershell
.\scripts\supabase.ps1 whoami --output-format json
.\scripts\supabase.ps1 projects list --output-format json
```

The encrypted credential is tied to this Windows user and machine. Do not commit it or the database `.env`. No browser login is needed for these commands on this machine. Keep CLI debug output disabled when handling credentials.

## Checks

```powershell
cd C:\Flutter_dev\projects\Orwickle\backend
npm.cmd run check
npm.cmd test
npm.cmd audit --omit=dev

cd ..\mobile
flutter analyze
flutter test
# Backend must already be running; real Android emulator HTTP request:
flutter test integration_test/backend_connection_test.dart -d emulator-5554
# Also requires a live, verified Supabase connection:
flutter test integration_test/backend_connection_test.dart -d emulator-5554 --dart-define=REQUIRE_DATABASE=true
```

Backend unit tests use injected database doubles; they are separate from the real database and emulator checks. The emulator test also verifies the original counter interaction.

## Backend boundaries

`src/config.js` validates environment settings; `src/db.js` owns PostgreSQL access; `src/routes/` owns HTTP routes; `src/middleware/` produces sanitized errors; `src/app.js` assembles middleware separately from process startup. Requests have security headers, a 16 KiB JSON limit, query validation, and a basic per-process rate limit. SQL uses parameters for dynamic values. Only health routes are exposed today.

Authentication and permissions will be enforced in Express before future business routes call database/storage services. User identity must come from a verified server-side session/token, never a caller-supplied role or user ID. Flutter calls Express; it does not connect directly with privileged Supabase credentials. No Firebase is used. Auth, marketplace tables, confidential-file APIs, and production deployment are outside this foundation.

Use Supabase owner credentials only for initial development/setup. Before adding user-data endpoints, provision a least-privileged application database role, define authorization and RLS for each table, and separate migration credentials. Service-role/secret API keys are unnecessary for the current SQL health check. Keep future privileged keys server-side too.

## Git and secrets

Git is initialized at the Orwickle root on `main`. Project-local author identity uses the project email; global Git settings were preserved. Ignore rules exclude `.env*` (except examples), local credentials, certificates, signing keys, dependencies, caches, builds, and `.local/` evidence. Flutter's platform ignore rules are retained. Lockfiles are committed.

Never paste tokens, passwords, or database URLs into chat, command examples, commits, or issue reports. Enter secrets in local ignored files or the official sign-in interface. See [verification status](docs/VERIFICATION.md) for repository and Supabase provisioning progress.
