# Authentication boundaries

The exact authorized scope is preserved verbatim in [AUTH_SCOPE.md](AUTH_SCOPE.md). The pre-change Git checkpoint is `checkpoint/pre-auth-20261020` at `a066265`. No accounts, organizations, cloud projects, paid plans or production deployments are added by this change.

## Identity, passwords and permissions

Express owns authentication. PostgreSQL in the existing `orwickle-dev` project stores accounts, challenges, reset grants and sessions in the private `orwickle_auth` schema. Flutter and React call Express. Neither client receives Supabase credentials; Supabase Auth and Firebase are not used.

Passwords use Argon2id with 64 MiB memory, three iterations and one lane. New passwords have 12–128 characters, with confirmation. Login accepts existing passwords without applying new-password length rules. Password values and hashes are never logged or returned.

Public signup strictly accepts Student, Investor or Buyer. Request schemas reject extra identity/role fields. Every protected request reads the account and role from PostgreSQL after checking its server-side session, expiry and authentication version. Role endpoints and administrator account access enforce permissions on the server. Session operations always constrain both the account ID and session ID. Browser labels and mobile role selection confer no authority.

The runtime `orwickle_app` login has no superuser, create-role, create-database, replication or RLS-bypass privilege. It receives usage on the private schema, selected table operations, column-limited account updates and narrowly scoped public-account registration/update functions. These security-definer functions have an empty search path and reject Administrator roles. The runtime cannot directly insert accounts or update their name/role. Tables have RLS policies only for the trusted Express role; `anon`, `authenticated` and `PUBLIC` receive no access to this schema. These policies isolate the backend from public Supabase API roles; **Express performs per-account authorization** within the trusted runtime role.

Administrator-only `GET /api/admin/users` returns at most 20 public users per page with validated search/page parameters and no credential fields. CSRF-protected `PATCH /api/admin/users/:id` accepts only a name and public role. Its database function refuses to modify administrator accounts, even if called directly by the runtime role. Role changes invalidate existing logins, reset grants and outstanding OTP challenges for the affected user in the same transaction. Name-only edits preserve valid logins. The interface provides no account deletion, email reassignment or administrator promotion.

The owner URI belongs only in ignored `.env.migrations`; the restricted runtime URI belongs in ignored `.env`. Migration generates a random runtime password and independent session/OTP secrets without displaying them. Windows helpers apply user-only file ACLs. Database TLS always verifies the certificate and hostname with the existing trusted Supabase CA. Private storage remains unchanged.

## Codes and recovery

Codes use six cryptographically random digits. Only an HMAC-SHA256 digest, bound to challenge ID, account ID, purpose and client audience, is stored. The independent HMAC secret stays outside the database. Codes expire after ten minutes, work once, allow five attempts, and cannot move between signup, login, recovery, mobile and administrator flows. Verification locks rows and commits failed-attempt increments. A challenge allows three resends, at least 60 seconds apart, within a 30-minute absolute lifetime. Resends rotate the code and preserve cumulative attempts. Delivery failures consume resend reservations.

Password verification precedes login email delivery; that step grants no authenticated access. Signup verification returns to normal login. Each fresh login, including Administrator, requires a new email code. Existing valid sessions need no new code on launch.

Recovery requests use generic eligibility wording. Unknown/ineligible emails receive decoy challenge metadata without email. A verified recovery code creates a random, purpose-specific, single-use reset grant, stored hashed and valid for five minutes. Successful password reset consumes grants and challenges, increments the account authentication version, revokes all session registry entries and deletes stored sessions in one transaction. It does not sign the user in. Account version and registry checks protect against stale concurrent session writes.

IP-based HTTP rate limits supplement persistent per-email/action hourly buckets (signup 5, login 12, recovery 5). Authentication routes allow 40 requests per IP per 15 minutes; general API traffic allows 120 per minute. These development limits deliberately restrict repeated live test runs; use separate fixture aliases or wait, without disabling production protections.

## Sessions and clients

`express-session` signs opaque random session identifiers; `connect-pg-simple` stores session state in PostgreSQL. Successful OTP verification regenerates the session ID and CSRF token. Only verified server state establishes identity. Clients offer only current-login sign-out; the active-session list and remote-session revocation endpoints have been removed. Session expiry is seven days of inactivity with a 30-day absolute maximum. The internal registry is checked on every protected request, so revoked or expired entries cannot regain access even if an in-flight request rewrites adapter state. Normal sign-out revokes only the requesting login; password reset still revokes all logins for that account.

The web panel uses HttpOnly, SameSite=Strict cookies, synchronizer CSRF tokens and a configured Origin allowlist. Cookies are Secure with the `__Host-` prefix in production; development HTTP is loopback only. Tokens stay in React memory, with no localStorage/sessionStorage credential persistence. Vite proxies same-origin `/api` calls to Express. Use `http://localhost:5173`, matching `ADMIN_ORIGIN`.

Android persists the authenticated opaque cookie only after successful OTP, using `flutter_secure_storage` and Android Keystore-backed storage. Anonymous challenges and reset grants remain in memory. No password or email code is persisted. Server expiry/revocation clears the saved cookie. Android backups are disabled to avoid restoring unusable encrypted session material. HTTP remains scoped to emulator/loopback in the existing debug-only network configuration; deployed services require HTTPS.

Administrator provisioning is an owner-only local script, outside public routes. It refuses to promote or overwrite an existing public account. The real integration runner can provision the project-email administrator with an unknowable random initial password after successful live tests; its owner then uses the ordinary verified recovery flow to choose a password. Alternatively, `scripts/provision-admin.ps1` accepts an initial password at a local hidden prompt. The basic user-management panel edits only public users; administrator provisioning remains owner-only.

## Email and verification

Nodemailer uses authenticated, encrypted Gmail SMTP with debug logging disabled. The email helper accepts a Google app password at a hidden local prompt and verifies SMTP authentication. It never places the password in command arguments or chat. An SMTP verification alone does **not** establish delivery.

The opt-in `verify:auth:live` script uses actual Express, the existing Supabase database, Gmail SMTP and IMAP. IMAP is used only for exact newly issued integration challenge headers; it does not browse unrelated messages or change mailbox contents. Codes, passwords, cookies, reset grants, database URLs and sender credentials are never printed. Fixture accounts use Gmail plus aliases and are removed afterward; test emails remain in the mailbox. Its success evidence is written to ignored `.local/auth-live-result.json`. Do not run it against a production service.

Local automated tests instead use PostgreSQL through PGlite and an in-memory sender, plus mocked client responses. Those results must remain distinct from live verification. See [VERIFICATION.md](VERIFICATION.md) for current evidence and outstanding prerequisites.
