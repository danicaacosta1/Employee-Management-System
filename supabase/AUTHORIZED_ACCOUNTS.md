# Authorized EMS accounts

The owner requested ID assignment and account creation on October 14, 2026.

| Employee ID | Email | Role |
|---|---|---|
| EMS-0001 | danicaacosta544@gmail.com | department_manager |
| EMS-0002 | margaretsubong92@gmail.com | employee |

Both eligibility records and linked, unverified Supabase Auth users now exist in project `yckjdcwvvcbmkbgjqzsg`. Status: `provisioned`; onboarding incomplete. No password was assigned and no email was sent. Existing Auth users were inspected before creation.

Activate at `http://localhost:3000/activate` using the ID and matching email. Supabase sends email when activation is requested. Templates, SMTP and redirects must match DEPLOYMENT.md. Email delivery and completed login remain unverified.

The minimal authentication schema was already installed when provisioning began. This operation changed no migrations or remote settings. MCP remains read-only; provisioning used the existing server-only key without exposing credentials.

`provision_authorized_accounts.mjs` records the operation and preserves matching existing identities on reruns. For the SQL alternative, set `ems.provision_manager_code` to `EMS-0001` and `ems.provision_employee_code` to `EMS-0002` in the same session before executing `provision_initial_accounts.sql`.

This current status supersedes the earlier deployment documents' pending-ID and zero-account audit notes.

The owner subsequently requested the role and employee ID on each Auth user.
Both now have `app_metadata.role` and `app_metadata.employee_id` matching the table above.
Existing metadata and credentials were preserved. Database roles remain authoritative.
These fields appear in the Auth user's metadata/details; they do not replace its UUID or the built-in `authenticated` API role.
