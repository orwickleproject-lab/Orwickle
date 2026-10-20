# Setup verification

Date: 2026-10-20 (Asia/Karachi).

| Item | Result |
| --- | --- |
| Existing Flutter starter | Analysis and original widget test passed before edits; preserved as first commit `2251b47` |
| Git root / branch | `C:\Flutter_dev\projects\Orwickle` / `main` |
| GitHub account | GitHub CLI authenticated and API identity verified as `orwickleproject-lab` |
| GitHub repository | Created and verified private: [orwickleproject-lab/Orwickle](https://github.com/orwickleproject-lab/Orwickle) |
| Supabase `orwickle-dev` | Pending authenticated account access; no project provisioned or reused yet |
| Real PostgreSQL query | Not verified; `backend/.env` has no database credential yet |
| Private storage | Setup SQL/script prepared; bucket creation and privacy not yet verified remotely |
| Express syntax and automated tests | Passed: syntax checks and 9 tests |
| npm production dependency audit | Passed: 0 reported vulnerabilities |
| Flutter analysis / widget tests | Passed: analysis and 4 widget tests |
| Host → real Express | Passed: `/health/live` HTTP 200 with service `orwickle-backend` |
| Readiness without credentials | Passed: `/health/ready` HTTP 503 (no simulated database success) |
| Android emulator → real Express | Passed: actual Android 17 emulator integration test, including live HTTP requests and original counter interaction |
| Foundation commit / push | Foundation commit `6df0c4a` pushed to `origin/main`; remote SHA verified equal to local HEAD |

The initial Edge browser session could not be controlled because its URL could not be verified. The project Chrome profile was subsequently accessible; the GitHub device activation page was opened, the user authorized GitHub CLI, and the authenticated identity and private repository were verified through GitHub's API. Supabase CLI sign-in remains pending direct user action.

The local starter's Flutter SDK, Android application ID, Gradle configuration, signing configuration, and generated local SDK paths were preserved. The only Android configuration added is a debug-only HTTP network policy for the local emulator connection.
