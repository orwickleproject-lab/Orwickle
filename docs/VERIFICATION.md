# Setup verification

## Mobile reference UI, 2026-10-20

The four supplied reference screens are implemented in Flutter: sign-in, signup with Student/Investor/Buyer cards, six-cell email verification, and password recovery. Shared styles use white, navy and teal, a vector brand mark, and bundled Plus Jakarta Sans under the included SIL Open Font License. The existing authentication API and session storage remain connected.

Flutter analysis is clean and all eight unit/widget tests pass. New interaction coverage checks OTP paste, digit filtering, deletion, six-digit validation and cell selection; compact 320px signup checks role submission, independent password visibility and navigation back from verification. Existing OTP session-gating and revoked-session tests also pass.

The Android presentation smoke test passed on `emulator-5554` and all four captured screens were visually inspected. It uses explicit mocked HTTP and empty in-memory session storage, saving PNGs to ignored `.local/ui-screenshots/`; these screenshots do not establish real email delivery or database-backed authentication. Run it with the command in the README. Real backend reachability is tested separately using `backend_connection_test.dart`. The debug diagnostic panel now opens by pressing and holding the Orwickle logo.

The updated real Android-to-Express connection test also passed through this diagnostic panel. It confirms backend HTTP reachability while PostgreSQL readiness remains unavailable, consistent with the network blocker below. No database success or live authentication is simulated in the normal app.

## Authentication implementation — current status, 2026-10-20

**Implementation is present and locally tested. Full live authentication is not complete: hosted PostgreSQL TCP access still times out.** Foundation results below are historical evidence from before this change, not a claim that its live connection still passes today.

| Check | Current result |
| --- | --- |
| Scope / checkpoint | Exact request saved in `AUTH_SCOPE.md`; pre-change tag `checkpoint/pre-auth-20261020` at `a066265`. |
| Backend checks | Syntax checks and 16 tests pass. Auth scenarios use a real isolated PostgreSQL engine through PGlite, with an in-memory sender; health tests use injected doubles. Includes failed-session-persistence and sanitized post-response failure regression checks. |
| Backend coverage | All 17 tests pass. Signup and all public roles; no Administrator signup; password-before-OTP; purpose binding, invalid/expired/reused codes, attempt/resend caps; server role restrictions; durable server session restoration; current-login logout without affecting other logins; removed session-management endpoints return 404; reset grant reuse rejection and session revocation; administrator OTP and absolute expiry; restricted-role SQL escalation rejection. Administrator-only user search/pagination and name/public-role edits reject unauthenticated/public clients, administrator targets, promotion, extra fields and invalid queries. Role changes invalidate the affected user's old login/challenges. |
| Flutter | Analysis clean; eight unit/widget tests pass with mocked HTTP and in-memory credential storage where applicable. Signup roles, validation, OTP gate, six-cell input behavior, compact layout and clearing a revoked saved session are covered. The updated reference UI was built and visually inspected on the emulator. |
| Real Android storage | `secure_storage_test.dart` passes on `emulator-5554`; Keystore-backed plugin writes, reads through a new storage instance and deletes probe material. |
| Real Android → Express | Updated app's `backend_connection_test.dart` passes against actual Express. This run proves HTTP reachability while PostgreSQL is unavailable; it does not prove a current real database connection. |
| React | Four client/interaction tests cover OTP-gated access, logout/expiry, user search, editing and retry after a failed save. The production build and responsive browser test pass. Browser/React tests use explicit API fixtures, not live administrator authentication. Desktop and 390px layouts were visually inspected. |
| User-management database | `003_user_management.sql` applied to the existing database. A real runtime-role transaction verified user update and rejection of Administrator promotion, then rolled back the temporary fixture. This verifies the database operation and permissions, separately from real email/admin browser authentication. |
| Dependency audits | Backend and administrator production dependency audits report zero vulnerabilities. |
| Real email | Gmail SMTP authentication with encryption passed. A real random OTP email was delivered and retrieved from the project inbox by its exact new challenge header; neither its code nor the replacement credential was displayed. This standalone delivery check does not prove a database-backed login. |
| Credential incident resolved | The first generated app password was inadvertently exposed through an accessibility heading, immediately revoked, and its absence verified in Google. A replacement was captured directly into the ignored user-only `.env`, without emitting page contents. |
| Actual Supabase schema | `orwickle_auth` schema, six auth tables, RLS and a restricted `orwickle_app` role created on existing `orwickle-dev` through authenticated HTTPS management setup. Actual privilege metadata confirms no public-table creation, storage reads or account-role updates. Runtime `.env` now uses this role; owner URI stays in `.env.migrations`. |
| Administrator | Project-email Administrator provisioned separately using owner setup access and an unknowable initial password hash. Use the verified email recovery UI to choose a password once backend database connectivity works. No initial password is saved or displayed. |
| Current hosted PostgreSQL/TLS | Fails before connection: `Connection terminated due to connection timeout`. Verified project-provided hostname and matching independent DNS; both addresses time out on 5432/6543 in two tool runtimes, the user's normal terminal, and after a hotspot retry. See `NETWORK_DIAGNOSTICS.md`. |
| Full real auth integration | Runner implemented, but its actual run stops at database preflight. Real database-backed OTP flows, reset/revocation and hosted role enforcement through the normal Express PostgreSQL connection remain unverified. |
| Source/history secret scan | Actual local runtime/owner DB credentials, session secrets, OTP pepper and SMTP credential are checked against source, Git objects and local setup logs before commit. |

No Firebase, Supabase Auth, marketplace features, new cloud projects, paid services or production deployment were introduced. The management token remains outside the backend runtime. Browser automation was stopped when the user pressed Escape; subsequent work used development commands only.

Android auth changes add the standard Internet permission and disable session backup. The existing debug-only loopback HTTP policy remains; release cleartext access is not enabled. Plugin builds required Android SDK Platform 35 and CMake 3.22.1, installed alongside the existing SDK. A project-local in-process Kotlin compiler setting resolves Windows daemon process creation errors. Application ID, Flutter SDK, signing and existing emulator remain unchanged.

## Earlier foundation verification (historical)

Date: 2026-10-20 (Asia/Karachi).

| Item | Result |
| --- | --- |
| Existing Flutter starter | Analysis and original widget test passed before edits; preserved as first commit `2251b47` |
| Git root / branch | `C:\Flutter_dev\projects\Orwickle` / `main` |
| GitHub account | GitHub CLI authenticated and API identity verified as `orwickleproject-lab` |
| GitHub repository | Created and verified private: [orwickleproject-lab/Orwickle](https://github.com/orwickleproject-lab/Orwickle) |
| Supabase identity | CLI `whoami` authenticated as `orwickleproject@gmail.com` using `SUPABASE_ACCESS_TOKEN` |
| Organization / plan | `Orwickle` (`eqoaxixdinhezbdwiegt`); Management API verifies `plan: free` |
| Supabase `orwickle-dev` | [Project dashboard](https://supabase.com/dashboard/project/pteqcyrstpxvvwkwujuj), ref `pteqcyrstpxvvwkwujuj`; `ACTIVE_HEALTHY`, Mumbai `ap-south-1`, PostgreSQL `17.11.0.003` |
| Real PostgreSQL query | Passed: `npm.cmd run verify:db` executed `SELECT 1` and a timestamp via the real session pooler with authenticated TLS |
| Database SSL enforcement | Enabled and successfully applied, verified through the Management API |
| Express database readiness | Passed: real `/health/ready` returned HTTP 200 with `database: ok`, `tls: true`, and a database timestamp |
| Private storage | `orwickle-confidential` verified `public=false`, 10 MiB limit; `storage.objects` RLS enabled, zero client access policies |
| Express syntax and automated tests | Passed: syntax checks and 9 tests |
| npm production dependency audit | Passed: 0 reported vulnerabilities |
| Flutter analysis / widget tests | Passed: analysis and 4 widget tests |
| Host → real Express | Passed: `/health/live` HTTP 200 with service `orwickle-backend` |
| Readiness without credentials | Passed: `/health/ready` HTTP 503 (no simulated database success) |
| Android emulator → real Express | Passed with `REQUIRE_DATABASE=true`: secure-database success UI and original counter increment on Android 17 |
| Foundation commit / push | Foundation committed and pushed to private `origin/main`; remote SHA checked against local HEAD during setup |
| Account token storage | Windows-user DPAPI encryption outside the repository, user-only ACL, decryption verified; temporary plaintext token file removed |
| Credential audit | Actual token, database password, and connection URL absent from tracked source, Git history, and local setup logs |

Backend unit tests use database doubles. The PostgreSQL script, Express readiness endpoint, storage checks, and Android integration test used the actual hosted development database. Supabase access is available through `scripts/supabase.ps1`, which loads the encrypted account token into the CLI environment only for the command's lifetime.

One initial Android attempt did not reach the success UI within its wait window. Two subsequent runs passed, including after restarting Express with an empty connection pool; failure diagnostics now include the displayed app text. The app offers a retry button and distinguishes backend reachability from database readiness.

The local starter's Flutter SDK, Android application ID, Gradle configuration, signing configuration, and generated local SDK paths were preserved. The only Android configuration added is a debug-only HTTP network policy for the local emulator connection.

Production deployment and marketplace authentication/features are outside the requested development foundation. No Firebase was introduced.
