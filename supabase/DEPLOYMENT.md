# EMS authentication-only deployment

No remote writes, users, settings, or emails were changed. Portals use local sample HR data.

## Read-only remote audit (2026-10-14)

Eight historical HR tables and four applied migrations: auth_employees, employee_portal, manager_portal, activation_safety. Fifth portal_hardening is absent. Zero Auth users and zero employee profiles, including both authorized identities. Reinspect before any approved write; remote state may change.

Do not apply the historical five-migration chain. Files and old validation evidence remain historical full-HR fixtures, not this release's readiness proof.

## Minimal schema

Apply reviewed auth_only.sql separately through migration tracking only after approval. It supports a fresh database or audited first-four schema. It retains employees and role/status enums to preserve contracts, removes HR dependencies from activation/setup, adds narrow session_profile() and service-only can_recover_account(text), and enforces exactly two email/role pairs. It never drops HR tables or edits Auth users. Unauthorized existing profiles fail the transaction for explicit reconciliation.

Account fields: UUID, linked Auth UUID, unique employee code/email/username, display names, authoritative role, status, onboarding timestamp, invite/activation timestamps and private activation lease/cooldown. Passwords remain exclusively in Supabase Auth. Application users have no direct account table reads/writes; authenticated bootstrap/setup and server-only activation/recovery RPCs provide access. Historical HR table/RPC app privileges are revoked; no HR data or managed Storage objects are deleted. Restrictive Storage RLS blocks the two retired HR buckets without changing unrelated buckets. Fresh installations create no HR tables.

Employee IDs are **PENDING**. After confirmation, set ems.provision_manager_code and ems.provision_employee_code in the same SQL session and run separately reviewed provision_initial_accounts.sql. Manager: danicaacosta544@gmail.com / department_manager. Employee: margaretsubong92@gmail.com / employee. Codes must be distinct, uppercase, 3–32 letters/digits/hyphens. Matching reruns preserve onboarding; conflicts fail. Provisioning creates eligibility rows only.

## Exact approval scopes

1. Database: backup/reinspect, apply only auth_only.sql, insert the two eligibility rows using provision_initial_accounts.sql with confirmed IDs. Preserve existing Auth users; no HR inserts/deletes or Storage data changes. Restrictive Storage RLS denies application access to the two retired HR buckets only.
2. Settings: verify/change only required Auth configuration below; no MCP permission changes.
3. Live account/email test: activate each authorized identity, create or reconcile Auth identity without duplicates, send invite (or setup recovery for existing confirmed identity), verify callback, set username/password, verify role portal/session/logout, send/test ordinary recovery. Owners enter passwords; never log credentials. This approval is separate from database deployment.

Pending: confirmed IDs, canonical origin, settings approval, live email/account approval.

## Manual Supabase/Brevo settings

Supabase Dashboard ? Authentication ? Email/SMTP (or Settings ? SMTP Settings): custom SMTP enabled, host smtp-relay.brevo.com, port 587, sender name Ridleys Corp - EMS, existing verified sender address. Leave the stored SMTP key intact. Brevo ? Settings ? Senders, Domains & Dedicated IPs ? Senders: exact sender verified. Never put Brevo credentials in .env.local or request a key unless replacement is necessary. Supabase handles delivery.

Authentication ? URL Configuration: Site URL = approved EMS_APP_URL origin. Exact Redirect URLs: <origin>/auth/confirm?next=/setup and <origin>/auth/confirm?next=/reset-password for each approved environment; no production wildcard. Authentication ? Sign In / Providers ? Email: disable public signup, keep Email enabled, disable unused providers. Verify password policy against application validation, token expiration and email limits. Available SQL MCP cannot inspect these dashboard settings; labels may differ.

Authentication ? Email Templates ? Invite User HTML:

    <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=invite">Activate account</a>

Recovery HTML:

    <a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">Set password</a>

RedirectTo already includes next. Supabase TokenHash/verifyOtp handles verification; no separate verification system. Verify rendered links during approved live email testing. Invite goes to setup; recovery supports setup for confirmed incomplete accounts and reset-password for completed accounts. Generic responses send no mail to unapproved recovery identities.

Set Supabase URL, publishable key, server-only secret key, canonical EMS_APP_URL from .env.example. HTTPS except localhost. Add deployment-edge per-IP activation/recovery limiting; account activation cooldown/lease is per profile, not global.

## Verification/release

Run TypeScript, ESLint, production build, focused application tests and auth-only isolated PostgreSQL checks. Fixtures do not prove Supabase Auth, SMTP, PostgREST, dashboard configuration or real email callbacks. Readiness needs both authorized users' approved activation ? verification ? setup ? login ? role routing ? logout ? recovery and expired/reused token tests. Backup and maintenance until deployment/live checks pass. Rollback needs separate review; do not reopen grants or delete objects.


Local SQL verification: `node supabase/tests/auth-only-postgres.mjs` passed both fresh and existing-four-migration paths (37 assertions). Checks cover provisioning refusal with pending IDs, exact reruns, email/role enforcement, unique employee IDs, table/RPC privileges, activation lease/link, invited?setup?active, repeated setup refusal, disabled session/recovery denial, anonymous bootstrap denial and retired Storage upload denial. Engine: in-memory PostgreSQL via pinned existing PGlite test install. No live Auth API, SMTP or network was used.
