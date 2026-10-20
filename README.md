# Orwickle development foundation

Flutter client in `mobile/`, Express 5 API in `backend/`, and Supabase PostgreSQL/storage. The original counter starter is preserved in Git commit `2251b47`.

## Requirements

- Node.js 24 LTS and npm (verified here: Node 24.10.0, npm 11.6.1).
- Existing Flutter/Android setup (verified here: Flutter 3.47.7, Dart 3.13.5, Android emulator `emulator-5554`).
- A free Supabase development project and private GitHub repository. See [verification status](docs/VERIFICATION.md) for what has actually been provisioned and tested.

## Start the backend

In PowerShell:

```powershell
cd C:\Flutter_dev\projects\Orwickle\backend
npm.cmd ci
# First checkout only; do not overwrite an existing configured .env:
Copy-Item .env.example .env
npm.cmd run dev
```

The local `.env` already exists on this machine. `npm.cmd start` runs without file watching. Default address: `http://127.0.0.1:3000`. The Android emulator reaches the host through `10.0.2.2`; no LAN binding or firewall exception is needed. Keep the API on loopback for local development.

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

Use/reuse the account associated with `orwickleproject@gmail.com`, and reuse a matching `orwickle-dev` project before creating one. Remain on the Free plan.

1. In the project's **Connect** dialog, use the PostgreSQL **Session pooler** URI (supports IPv4). Put it only in `backend/.env` as `DATABASE_URL`. URL-encode password characters. Omit URI query parameters; the driver configures TLS separately and rejects attempts to override it.
2. TLS certificate and hostname verification are always enabled. If Supabase's certificate requires its own CA, download the CA from the dashboard and save it in ignored `backend/.secrets/supabase-ca.crt`; set `DATABASE_SSL_CA_FILE=.secrets/supabase-ca.crt`. Never set `rejectUnauthorized: false` or disable TLS.
3. Run from `backend/`:

   ```powershell
   npm.cmd run verify:db
   npm.cmd run storage:setup
   ```

4. Restart Express after changing `.env`. Verify `/health/ready`, then rerun the emulator test with `REQUIRE_DATABASE=true` below.

`storage:setup` idempotently creates the `orwickle-confidential` bucket with `public=false` and a 10 MiB file limit. It verifies privacy and refuses to call an existing public bucket safe. It creates no upload/download policies. Confidential files must be authorized by Express before access or short-lived signed URLs are provided. Do not make the bucket public.

Connection options follow the [Supabase PostgreSQL connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

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
