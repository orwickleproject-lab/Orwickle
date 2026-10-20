# Setup verification

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
