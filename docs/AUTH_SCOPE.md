**Paste this into the Codex chat box in VS Code:**

Build the following features in my existing Orwickle project:

C:\Flutter_dev\projects\Orwickle

First inspect the existing code, Git status, README and setup documentation. Preserve existing work and reuse the working Flutter app, Express backend, Supabase database, credentials helper and private GitHub repository. Do not recreate accounts or cloud projects.

My instructions below override the broader proposal and earlier plans. “Week 8” does not authorize adding other proposal features.

STRICT FEATURE SCOPE

1. Signup
- Full name, email, password and password confirmation.
- Exactly three public roles: Student, Investor and Buyer.
- Verify the signup email through an email OTP.
- No public Administrator signup option.

2. Login with email OTP
- Verify email and password first.
- Then send an email OTP.
- Grant authenticated access only after successful OTP verification.
- Require this sequence on every fresh login, including administrator login.
- A valid existing session can continue without requesting OTP on every app launch.

3. Forgot password
- Request recovery using email.
- Verify a recovery OTP before allowing a new password.
- Revoke existing sessions after a successful password reset.
- Return the user to the normal login flow.

4. Session management
- Securely maintain login across app restarts while the session remains valid.
- Implement session expiry and revocation.
- Show active sessions.
- Support signing out of the current session and other sessions.
- Handle expired sessions clearly.

5. Authentication and authorization
- Manage authentication in Express using established libraries.
- Hash passwords securely.
- Enforce permissions in the backend, not merely by hiding interface controls.
- Obtain account identity and role from verified server-side data.
- Prevent role tampering, self-promotion to Administrator and access to another account’s sessions.
- Provide minimal protected account screens for Student, Investor and Buyer.

6. Basic administrator web panel
- Build a separate React web interface using the same Express backend.
- Provision Administrator access separately.
- Include administrator login, email OTP, protected account access, session management and logout.
- Keep this panel limited to authentication and account/session access. Do not add user-management or marketplace administration features.

UI AND LOGO

Choose the professional UI design, colors, typography, layouts and Orwickle logo yourself. You may reuse or redesign previous concepts; they are not binding. Keep branding consistent across mobile and web.

Make the screens responsive and readable, with clear validation, loading, error, expired-session and access-denied states. Build functioning screens and connected flows, not only mockups.

EXISTING ARCHITECTURE

- Flutter/Dart mobile app in mobile/.
- Existing Express backend in backend/.
- React administrator interface in admin/, unless an appropriate existing folder already exists.
- Existing Supabase PostgreSQL development project: orwickle-dev.
- Authentication and authorization remain backend-managed.
- Do not introduce Firebase or silently replace this architecture with Supabase Auth.

SECURITY AND EMAIL DELIVERY

Use expiring, single-use, purpose-bound OTPs with attempt limits and resend limits. Signup, login and password-recovery codes must not be interchangeable.

Configure real backend email delivery. Reuse the project email where practical. If sender credentials or an unavoidable account action require my involvement, give me one precise local setup instruction and continue independent work meanwhile.

Never request or display passwords, tokens or OTPs in chat. Keep secrets out of source control and logs. Use secure mobile credential storage, appropriate protected browser sessions and least-privileged application database access.

SCOPE EXCLUSIONS

Do not add project listings, discovery, search, access requests, offers, chat, document sharing, notifications, agreements, reports, evidence review, rich profile forms, payments, analytics or any other functionality. Do not upgrade paid services or deploy to production.

EXECUTION AND VERIFICATION

Record this exact scope in the project documentation. Make routine implementation and design decisions independently and continue through implementation and verification.

Run appropriate backend, Flutter and web checks. Verify real database-backed flows, real email OTP delivery, invalid/expired/reused OTP handling, password recovery, session revocation and role restrictions. Preserve existing health checks.

Save a Git checkpoint before changes and commit completed work after verification. Reuse the existing repository.

Finish with a concise report covering:
- What actually works.
- What was tested and the results.
- How to run the backend, mobile app and web panel.
- Any exact remaining dependency.

Clearly distinguish mocked tests from real integration checks. Do not claim completion while real OTP delivery or another required flow remains unverified.