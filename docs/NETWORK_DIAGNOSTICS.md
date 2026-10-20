# Hosted PostgreSQL connection blocker

Checked 2026-10-20, after both normal Wi-Fi and the user's mobile-data hotspot were tried. No cloud project or region was recreated, and no credentials or TLS checks were bypassed.

| Check | Evidence |
| --- | --- |
| Actual project endpoint | Supabase Management API `config/database/pooler`, PRIMARY connection settings, returns `aws-0-ap-south-1.pooler.supabase.com`; exact match with the saved URI. The hostname was not inferred from a region. |
| Project status | Existing `orwickle-dev`, ref `pteqcyrstpxvvwkwujuj`, reports `ACTIVE_HEALTHY`. |
| IP restrictions/bans | Network restrictions allow IPv4 and IPv6; no banned IPv4 addresses returned. |
| DNS | System resolver returns two IPv4 addresses. Google's independent DNS-over-HTTPS resolver returns the same addresses. |
| TCP | Each IPv4 address times out on both ports 5432 and 6543 (`ETIMEDOUT`). |
| Independent execution | The command runner and the separate Node REPL runtime both produce the same TCP timeouts. |
| Normal Windows terminal | User reported the same DNS success and TCP/query timeouts from the supplied read-only diagnostic outside the tools. |
| Hotspot retry | After the user connected the PC to phone mobile data, the command runner again timed out on both addresses/ports. |
| Authenticated PostgreSQL/TLS | Driver error: `Connection terminated due to connection timeout` (Error class, no driver error code). The TLS connection is never established; this is not evidence of a bad password or certificate. |
| HTTPS management SQL | Real queries succeed; auth schema, restricted runtime role and separate administrator account were provisioned through this setup-only interface. |
| SMTP/IMAP | Encrypted SMTP authentication and actual tagged OTP delivery/retrieval both passed. |

The precise cause of the TCP failure is not established. These observations do not prove an ISP fault, a firewall fault or a provider outage. No additional network change or paid service is assumed to fix it.

Rerun from a normal Windows terminal:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Flutter_dev\projects\Orwickle\scripts\diagnose-database.ps1
```

It reads the existing ignored environment, tests DNS and both TCP ports, attempts a verified TLS query, prints no credential, and saves a sanitized report in ignored `.local/windows-network-check.json`. Tool-invoked comparisons use `.local/tool-network-check.json`. The existing pooler hostname can be compared again with project settings before escalation to the provider/network administrator; sharing credentials is unnecessary.

When authenticated PostgreSQL access succeeds, restart the backend and run `npm.cmd run verify:auth:live` from `backend/`, followed by the emulator check with `REQUIRE_DATABASE=true`. Those checks remain required before calling the authentication task complete. The HTTPS setup interface is not used as a runtime database fallback.
