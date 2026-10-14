# EMS auth-only release gate

- [x] Inspect five historical migrations; avoid deploying the full-HR chain.
- [x] Read-only remote audit: four migrations, eight HR tables, zero Auth users/profiles (2026-10-14).
- [x] Prepare auth-only SQL and fixed two-email/role provisioning without remote writes.
- [ ] Confirm two distinct employee IDs (PENDING) and canonical origin.
- [ ] Reinspect target and back up before approved deployment.
- [ ] Obtain explicit approval for auth_only.sql plus eligibility provisioning with confirmed IDs.
- [ ] Verify manual signup restrictions, Site URL, redirects, password policy and invite/recovery templates.
- [ ] Verify existing Brevo SMTP/verified sender without copying or requesting credentials.
- [ ] Obtain separate approval for settings changes and real Auth identity/email tests.
- [ ] Complete both accounts' activation, verification, setup, login, role guards, session, logout and recovery tests, including expired/reused links.
- [ ] Record static/isolated SQL results separately from live authentication/email verification.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact scopes/settings. Earlier LOCAL_SQL_VALIDATION.json describes historical full-HR fixtures, not final live readiness.
