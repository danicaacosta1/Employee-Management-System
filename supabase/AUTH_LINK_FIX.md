# Activation link investigation and local fix

## Evidence and cause

Read-only Auth logs show invitation delivery at October 14, 2026, 13:22:32 Asia/Taipei, a successful GET /verify with user_signedup at 13:22:58, then another /verify visit at 13:23:07. Recovery was requested at 13:23:40, followed by a successful /verify login at 13:23:51 and subsequent failed /verify visits. Tokens, query strings, addresses and request headers were excluded from log output.

The observed email/browser flow used Supabase's /auth/v1/verify handler, not a direct token_hash verification POST from the Next.js callback. The original server callback accepts token_hash or recovery PKCE code. It cannot establish a server cookie from the implicit flow's browser-only URL fragment. A first successful Supabase verification can therefore consume the link without reaching setup; reopening the consumed link then fails. This mechanism fits the observed state and reproduces in mocks. The exact initial redirect/template and whether a human, scanner or preview consumed the first link remain unproven. The connected Gmail search did not locate the current message; no current email URL was opened or logged. Dashboard Auth settings/templates are not exposed by the available read-only MCP.

Danica: EMS-0001, department_manager, invited, verified email, incomplete onboarding. Margaret: EMS-0002, employee, provisioned, unverified email, incomplete onboarding. Exactly one matching Auth user exists for each identity. Existing account records, schema, passwords and metadata were not changed.

## Local changes

- Prepared templates/invite.html and templates/recovery.html. Both point directly to /auth/confirm using TokenHash, the matching token type, HTML-escaped ampersands and encoded next destinations. They do not use ConfirmationURL or perform a second verification of an already-consumed token.
- Confirmation callback resumes /setup for an eligible account with incomplete onboarding, even when a recovery email requests /reset-password. Completed recovery users reach /reset-password. Database session_profile remains authoritative; Auth app_metadata cannot grant a role.
- Callback cookie writes fail explicitly rather than being silently swallowed. Account/session failures receive distinct safe reason codes; expired/reused tokens still fail closed. Provider error URLs are rejected before Auth calls. No provider messages or token values are logged or reflected.
- Error screen now describes verification failure accurately instead of calling every failure expiration. Existing authentication layout and portal screens are unchanged.
- Development logging excludes callback/error request URLs and Server Function arguments. Production host/proxy logs should also redact token_hash/code queries and credentials; Next development logging configuration does not control external logging.

## Dashboard changes requiring approval

1. Select project yckjdcwvvcbmkbgjqzsg (Employee Management System).
2. Open Authentication > URL Configuration. Set Site URL to the exact EMS_APP_URL origin: currently http://localhost:3000. Do not append /auth/error or another path. Production must use the actual HTTPS application origin.
3. Add exact Redirect URLs matching the current server actions: http://localhost:3000/auth/confirm?next=/setup and http://localhost:3000/auth/confirm?next=/reset-password. For a production origin, add its two equivalents. Do not put tokens in the allowlist.
4. Open Authentication > Emails > Templates (older Dashboard labels: Email Templates). Choose Invite user, replace the HTML body with templates/invite.html, then save after owner approval.
5. Choose Reset password, replace its HTML body with templates/recovery.html, then save after owner approval. Recovery resumes first-time setup when needed; existing activated accounts reach Reset Password.
6. Verify the configured Brevo sender/SMTP and token expiration/rate limits. Keep the existing SMTP key. If Brevo link tracking is enabled, disable it for Auth email delivery after approval; rewritten verification URLs are unsuitable. Do not disable email verification or lengthen expiry as a substitute for fixing the flow.

Supabase references: https://supabase.com/docs/guides/auth/auth-email-templates and https://supabase.com/docs/reference/javascript/auth-verifyotp.

## If scanners are confirmed

Supabase documents email prefetching as a cause of consumed one-time links. If direct GET links still get consumed before a human click, use a confirmation-page flow: the first GET stores a validated payload in a short-lived signed/encrypted HttpOnly cookie and redirects to a clean URL; an explicit same-origin, CSRF-protected POST verifies the token and establishes the session. The landing GET must never call verifyOtp. Do not put the token in client components, form HTML, client storage or logs. This is proposed, not implemented: scanner involvement has not been established, and no such redesign is required to repair the proven flow mismatch.

## Safe fresh-link test after approval

Restart the app with the local fix; verify templates and origin first. Stop opening old messages. Wait at least 60 seconds after the previous request (activation also uses a five-minute lease if a request was interrupted). Open /activate once and use the matching ID/email. For Danica's already-confirmed incomplete account, activation deliberately sends a recovery link; the callback sends her to /setup. For Margaret's unconfirmed account, activation sends an invitation. Do not manually delete/recreate users or generate extra links in the Dashboard.

Use only the latest message and open it once in a browser that can reach the configured origin. A localhost link needs this computer's running application; it will not reach the app from an unrelated phone/computer. Create credentials yourself on /setup. Verify completed onboarding, both role boundaries, session refresh, logout and ordinary recovery. Ask for another fresh link rather than reusing a consumed link. No live test email was sent during this work.

## Verification and blockers

TypeScript, ESLint and production build pass. All 34 focused/existing application tests pass, including five new regression cases for recovery onboarding, session-write failure, implicit/provider error redirects, cookie persistence/deletion and rendered template URLs. These are mocked/static results, not a successful live email lifecycle.

Awaiting owner approval for Dashboard changes and a separate fresh-email test. Actual installed template, Site URL/redirect values, token lifetime, Brevo tracking, initial browser fragment and scanner involvement remain unverified. No migrations, remote settings, emails, account updates, commits or pushes were performed in this investigation.
