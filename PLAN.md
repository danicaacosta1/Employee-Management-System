# EMS — Employee Management System: Implementation Plan

> Historical full-HR plan, superseded by the final auth-only scope. See README.md,
> FINAL_REPORT.md and supabase/DEPLOYMENT.md for current implementation and approval gates.

> Status: **PLANNING ONLY** — no application code, packages, migrations, or Supabase changes have been made.
> Plan date: 2026-10-14. Owner approval is required before Phase 1 begins.

---

## Table of Contents

1. Project Overview
2. Technical Stack
3. Figma Design Inventory
4. Functional Requirements
5. Role and Permission Matrix
6. Authentication and Activation Workflow
7. Employee Portal Specifications
8. Department Manager Portal Specifications
9. Supabase Database Design
10. RLS and Security Strategy
11. Storage and File Handling
12. Suggested Project Structure
13. Shared Components and Design Tokens
14. API / Data Access Strategy
15. Implementation Phases
16. Testing Strategy
17. Assumptions and Open Questions
18. Definition of Done
19. Final Launch Checklist

---

## 1. Project Overview

### 1.1 Goal

Build a fully functional, role-based Employee Management System (EMS) that replicates the Figma design
"EMS — Acosta, Danica T." as closely as possible. The Figma file is the visual source of truth. This is a
Figma-to-code project, not a redesign.

### 1.2 Users and roles

| Role | Initial account | Scope |
|---|---|---|
| `department_manager` | danicaacosta544@gmail.com | Records of the department(s) the manager is assigned to |
| `employee` | margaretsubong92@gmail.com | Own records only, plus published announcements of own department |

These two are the first real accounts. The system must support any number of later employees, departments,
and managers. There is **no public sign-up**. Roles are assigned only by trusted provisioning, never by the user.

### 1.3 Current project state (audit result, 2026-10-14)

| Item | Finding |
|---|---|
| Framework | Next.js **16.4.0** (App Router), React **19.3.0**, TypeScript 5, Tailwind CSS **v4** (via `@tailwindcss/turbopack`) |
| Git | Branch `master`, one commit ("Initial commit from Create Next App"). Untracked: `.agents/`, `public/images/` |
| `next.config.ts` | `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback: true`, Turbopack CSS rule for Tailwind |
| App code | Only the create-next-app starter: `app/layout.tsx` (Geist fonts), `app/page.tsx` (starter page), `app/globals.css` (default tokens, dark-mode media query) |
| Dependencies | `next`, `react`, `react-dom` only. **No** Supabase client, shadcn/ui, Lucide, validation, or test libraries installed |
| Assets | `public/images/auth-bg.png` (1512×982, blurred open-plan office photo — almost certainly the auth screen background). Default Next.js SVGs in `public/` (unused, deletable later) |
| Supabase | No `supabase/` directory, no env files, no migrations. The Supabase MCP plugin is authenticated in this environment but was **not** queried or modified (per instructions) |
| Agent docs | `AGENTS.md` warns that Next.js 16 differs from older versions; guides live in `node_modules/next/dist/docs/` |
| Reusable implementation | None. Plan from scratch. Keep `next.config.ts` flags and `AGENTS.md` as-is |

### 1.4 Next.js 16 facts that shape this plan (verified in local docs)

- **Middleware is now called Proxy.** File is `proxy.ts` at the project root, exporting `proxy()` (see
  `docs/01-app/01-getting-started/16-proxy.md`). Proxy is for optimistic checks and session refresh only —
  not the full authorization layer.
- **Cache Components is enabled.** Reading `cookies()` outside a `<Suspense>` boundary is a **build error**.
  All session-dependent UI must stream behind `<Suspense>` (see `docs/01-app/02-guides/authentication-with-cache-components.md`).
  A plain `'use cache'` function must never read `cookies()`.
- Mutations use Server Actions with `useActionState` for pending state; after a mutation, call `refresh()` /
  `revalidatePath()` / `updateTag()` from `next/cache` (see `07-mutating-data.md`).
- `unauthorized()` / `forbidden()` functions exist (see `03-api-reference/04-functions/`). Check whether they
  still require an experimental flag before use in Phase 3.
- Data security guidance (`02-guides/data-security.md`) recommends a server-only Data Access Layer. This plan follows it.

**Rule for every phase:** before writing code for a Next.js feature, read the relevant guide in
`node_modules/next/dist/docs/`.

---

## 2. Technical Stack

### 2.1 Primary (mandated)

| Layer | Choice |
|---|---|
| Framework | Next.js 16.4 App Router, React 19.3, Server Components + Server Actions |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens in `app/globals.css`) |
| Backend | Supabase: Postgres, Auth, Storage, RLS |

### 2.2 Supporting packages to add (Phase 1, needs approval)

| Package | Why | Status |
|---|---|---|
| `@supabase/supabase-js`, `@supabase/ssr` | Official Supabase client + cookie-based SSR sessions | Required |
| `shadcn/ui` (CLI-generated components) + its deps (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`) | Accessible primitives (Dialog, Select, Popover, Tabs, Checkbox, Tooltip, DropdownMenu) restyled to Figma | Allowed by brief |
| `lucide-react` | Icons | Allowed by brief |
| `zod` | Shared server/client validation schemas | **Needs approval** (not in brief; alternative is hand-written validators) |
| `server-only` | Compile-time guard for the Data Access Layer | Tiny Next.js-recommended package |
| `supabase` CLI (devDependency) | Local stack, migrations, type generation, `supabase test db` | Required for migrations |
| `vitest` (dev) | Unit tests for pure logic (working-day calculation, CSV escaping, validators) | **Needs approval** |
| `@playwright/test` (dev) | E2E auth/role flows and screenshot comparison against Figma exports | **Needs approval** |

**Not used:** ORMs (Prisma/Drizzle), separate backend frameworks, Redux/Zustand, React Query, date libraries
(use `Intl.DateTimeFormat` and small date helpers), external email/Slack/Calendar integrations.

### 2.3 Environment variables

| Name | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Publishable (anon) key — RLS applies |
| `SUPABASE_SECRET_KEY` | **Server only** | Service-role / secret key. Used only in the activation Server Action and provisioning scripts. Never imported by client code |
| `NEXT_PUBLIC_SITE_URL` | Public | Base URL for auth email redirects |

`.env.local` is git-ignored (already covered by `.gitignore` `.env*`). Commit only `.env.example`.

---

## 3. Figma Design Inventory

### 3.1 Access limitation (BLOCKER for visual accuracy)

- File: `https://www.figma.com/design/MXgGbnsNyLtl4Roh2GjU5/EMS-Acosta--Danica-T?node-id=0-1`
- Result on 2026-10-14: the link opened in the connected Chrome browser returned **Figma 404** — the file is
  private or not shared with the signed-in account.
- No Figma MCP / Dev Mode integration is available in this environment.
- No screenshots of the screens exist in the repository. The only design asset is `public/images/auth-bg.png`.

**Consequence:** this plan specifies *behavior, data, and structure* fully, but **all measurements, colors,
typography, and exact layouts are TBD** and must be extracted in Phase 0. No pixel-accuracy claims are made.
Nothing in this plan should be read as a visual specification where it conflicts with Figma.

**Required from the owner (pick one):**

1. Share the Figma file ("can view") with the account used in Chrome, or set link sharing to "Anyone with the link can view"; **or**
2. Export every frame as PNG at 1× **and** 2× into `design/reference/<module>/<frame-name>.png`, plus any logos/icons/illustrations as SVG into `public/images/`; **or**
3. Connect a Figma Dev Mode MCP server so frames, variables, and measurements can be read directly.

Option 1 or 3 is preferred because it exposes exact measurements, variables (tokens), and component properties.

### 3.2 Expected frame inventory (from the brief — to be confirmed against Figma in Phase 0)

| # | Module | Frame / state | Notes |
|---|---|---|---|
| A1 | Auth | Activate Account (default, error, loading) | Likely uses `auth-bg.png` full-bleed background |
| A2 | Auth | Login (default, password visible, error, loading) | |
| A3 | Auth | First-Time Setup (default, validation errors) | |
| A4 | Auth | Forgot Password / Reset Password / Link Expired | Not listed explicitly in brief; may not exist in Figma — derive from A2 styling if missing |
| E1 | Employee | Dashboard | |
| E2 | Employee | Attendance Records | |
| E3 | Employee | My Tasks + Task Details & Status Update modal | |
| E4 | Employee | Announcements (collapsed + expanded item) | |
| E5 | Employee | Leave Requests + New Leave Request modal + Request details | |
| E6 | Employee | My Profile (view/edit, update password) | |
| M1 | Manager | Dashboard | |
| M2 | Manager | Employees + Employee details + Quick Assign Task modal (+ Department Note?) | |
| M3 | Manager | Attendance | Confirm read-only vs editable |
| M4 | Manager | Tasks + Create & Assign modal + Update Progress tab | |
| M5 | Manager | Leave Requests + Review Request modal/panel | |
| M6 | Manager | Announcements + Create/Edit modal + details | Check for Slack/Calendar/email indicators |
| S1 | Shared | Sidebar (employee + manager variants), top bar, user menu | |
| S2 | Shared | Empty, loading, error, 404 states | Probably missing in Figma — derive from existing components |

### 3.3 Phase 0 extraction checklist (per frame)

For every frame record in `design/INVENTORY.md`:

- Frame name, node ID, size (expected desktop width 1440 or 1512 — `auth-bg.png` is 1512×982, hinting at a 1512 MacBook frame)
- Layout grid, sidebar width, top bar height, content max-width, page padding
- Colors (fills, strokes, text) → map to tokens
- Text styles (family, size, weight, line-height, letter-spacing) → map to type scale
- Component dimensions: button heights, input heights, table row height, header height, badge sizes, radii, shadows
- Modal widths and paddings
- Icons used (match Lucide equivalents; list any custom icon needing SVG export)
- Every interactive element and its states (hover/focus/disabled/error) if drawn
- Any decorative/integration indicators (Slack, Google Calendar, email) → classify as reference-only

---

## 4. Functional Requirements

### 4.1 Feature classification legend

- **[S] Supported** — fully implementable with the planned stack.
- **[C] Clarification** — implementable, but product rules are missing; a default is proposed in §17.
- **[R] Reference-only** — shown in design but depends on an unavailable integration; rendered as static/disabled and documented, never faked.

### 4.2 Cross-cutting requirements

| Requirement | Class | Implementation |
|---|---|---|
| No public sign-up | S | Disable "Allow new users to sign up" in Supabase Auth; accounts created only through provisioning/activation |
| Role-based routing | S | Proxy optimistic redirect + layout-level DAL check + RLS |
| Every statistic from live DB | S | Aggregates via SQL views / RPCs, RLS-scoped |
| Search, filter, sort, pagination | S | URL `searchParams` → server query with `.range()` and `count: 'exact'` |
| CSV export | S | Route Handler streams CSV using the user-scoped client (RLS applies) |
| Loading states | S | `<Suspense>` skeletons per section; `useActionState` pending state on buttons |
| Error states | S | Inline field errors from validation; `error.tsx` per route group; toast for action failures |
| Empty states | S | Shared `EmptyState` component per table/feed |
| Audit of critical decisions | S | `audit_logs` written inside security-definer RPCs |
| Time zone | C | All dates stored UTC (`timestamptz`) or as `date`; display in `Asia/Manila` (assumed — confirm) |

### 4.3 Per-element interaction specifications

Per-screen tables in §7 and §8 list, for every interactive element: action, DB operation, validation,
permission, success, error, and loading behavior.

---

## 5. Role and Permission Matrix

`Own` = rows where `employee_id = current employee`. `Dept` = rows belonging to a department the manager is
assigned to via `department_managers`. `—` = no access.

| Resource | Employee: read | Employee: write | Manager: read | Manager: write |
|---|---|---|---|---|
| `employees` (profile) | Own row; limited directory fields of own department's manager (approver name) | Own **permitted** fields only (phone, username, avatar, emergency contact) via RPC | Dept | Dept non-sensitive fields (position, office, notes); **not** role, department, email, employee code |
| `departments` | Own department | — | Assigned departments | — |
| `department_managers` | — (approver name exposed through view) | — | Own assignments | — |
| `attendance_records` | Own | — | Dept | — (read-only, see §8.3) |
| `shifts`, `holidays`, `leave_types` | All (reference data) | — | All | — |
| `tasks` | Assigned to self | Status + remarks only, via `update_task_progress` RPC | Dept | Create, edit, reassign within Dept |
| `task_progress_updates` | For own tasks | Insert via RPC only | Dept | Insert via RPC only |
| `leave_requests` | Own | Create (pending), cancel own pending | Dept (excluding none) | Decide via `decide_leave_request` RPC only; cannot decide own request |
| `leave_balances` | Own | — | Dept | — (changed only by decision RPC / admin) |
| `leave_request_attachments` | Own | Upload for own pending request | Dept | — |
| `announcements` | Published, own department | — | Dept (all statuses) | Create, edit, publish, unpublish/archive, delete draft |
| `announcement_attachments` | Of visible announcements | — | Dept | Upload/remove on Dept announcements |
| `employee_notes` | — | — | Dept | Create; edit/delete own notes |
| `audit_logs` | — | — | — (phase 9 option: Dept read-only) | — (written by RPCs only) |
| Role / department / employee code / email | Read own | **Never** | Read Dept | **Never** (admin provisioning only) |

**Admin/provisioning** is not an application role. It is performed by the project owner using the Supabase
dashboard or `scripts/provision-*.ts` with the secret key. This keeps exactly two app roles as required.

---

## 6. Authentication and Activation Workflow

### 6.1 Identity model

- **Supabase Auth is the only identity provider.** Passwords exist only in `auth.users`. No credential columns in public tables.
- `public.employees` is the HR/profile record. It exists **before** the auth user ("provisioned"). After
  activation, `employees.user_id` links to `auth.users.id`.
- Role is stored in `employees.role` (source of truth, not user-writable) and mirrored to
  `auth.users.raw_app_meta_data.role` (`app_metadata` is not editable by the user) so the proxy can redirect
  without a DB query. RLS never trusts the JWT role alone for writes — it uses DB helper functions.

### 6.2 Provisioning (before activation)

Performed by the owner, never by end users:

1. Migration seeds reference data only (shifts, leave types, holidays).
2. `scripts/provision-employees.ts` (run locally with `SUPABASE_SECRET_KEY`, reads a git-ignored
   `provisioning/employees.csv`) upserts:
   - the department (name/code from owner — **open question**),
   - `employees` rows: employee code, company email, names, role, department, position, hire date, approving manager,
   - `department_managers` row for the manager,
   - initial `leave_balances` for the current year.
3. `account_status = 'provisioned'`, `user_id = NULL`. No auth user yet; no password anywhere.
4. Script prints a summary only — never secrets.

Initial data for the two known accounts:

| Email | Role | Employee code | Department | Approver |
|---|---|---|---|---|
| danicaacosta544@gmail.com | department_manager | TBD by owner | TBD | — |
| margaretsubong92@gmail.com | employee | TBD by owner | Same as manager | Danica Acosta |

### 6.3 Activate Account flow ([S], with SMTP caveat)

```
User → /activate (Employee ID + company email)
  → Server Action activateAccount()
     1. Validate format (zod): employee code pattern, email format, normalized lowercase.
     2. Rate-limit: max 5 attempts / 15 min per IP hash and per email (table activation_attempts).
     3. Service-role lookup: employees WHERE employee_code = $1 AND lower(email) = $2.
        - No match → generic error "We couldn't verify these details. Check your Employee ID and company email."
          (same message for wrong ID or wrong email — no field-level enumeration).
        - account_status = 'active' (already activated) → redirect /login?notice=already-active.
        - account_status = 'disabled' → same generic error.
        - provisioned / invited → step 4.
     4. auth.admin.inviteUserByEmail(email, { redirectTo: SITE_URL/auth/confirm?next=/setup,
          data: {} }) and set app_metadata.role, link employees.user_id, account_status='invited', invited_at=now().
        (If a pending invite exists, resend via generateLink type 'invite' — idempotent.)
     5. Show success state: "Activation link sent to your company email."
  → User clicks email link → /auth/confirm (Route Handler)
     verifyOtp({ type: 'invite', token_hash }) → session cookie set → redirect /setup
     invalid/expired token → /auth/error?reason=link-expired (offer "Request a new link" → /activate)
```

Why this is secure:
- Knowledge of Employee ID + email alone never grants access; possession of the company mailbox is proven by the invite link.
- No password is set until the authenticated `/setup` step.
- The secret key is used only inside a Server Action on the server; inputs are validated; attempts are rate-limited.

**Email delivery caveat [C]:** Supabase's built-in SMTP is heavily rate-limited and intended for testing
(only delivers to project team members). Production needs **custom SMTP** configured in Supabase Auth
(e.g., the company mail server). This is a configuration step, not a new service in the app. Owner must provide SMTP details.

The email template (Supabase "Invite user" and "Reset password") must use the `token_hash` link format
pointing to `/auth/confirm` (SSR PKCE-compatible pattern).

### 6.4 First-Time Setup ([S])

- Route `/setup`; reachable only with a session where `employees.setup_completed_at IS NULL`.
- Fields: new username, new password, confirm password.
- Validation (client + server, shared schema):
  - Username: 3–30 chars, `^[a-z0-9._]+$`, unique (case-insensitive) — DB unique index on `lower(username)`.
  - Password: min 12 chars, at least 1 upper, 1 lower, 1 digit, 1 symbol (also set the same policy in Supabase Auth password settings; enable leaked-password protection if plan allows).
  - Confirm must match.
- Save Changes → Server Action:
  1. `supabase.auth.updateUser({ password })` (user-scoped session).
  2. RPC `complete_first_time_setup(p_username)` → sets username, `setup_completed_at = now()`, `account_status = 'active'`, `activated_at = now()`; writes audit log.
  3. Redirect by role: employee → `/employee/dashboard`, manager → `/manager/dashboard`.
- Errors: username taken (unique violation → field error), weak password (Supabase `weak_password` → field error), session expired → `/login`.
- Gate: every portal layout redirects to `/setup` while `setup_completed_at IS NULL`.

### 6.5 Login ([S])

- Fields: company email, password (show/hide toggle), "Remember this workstation", Forgot password link, Login, link to Activate Account.
- Server Action `signIn()` → `supabase.auth.signInWithPassword`.
- Errors: `invalid_credentials` → "Incorrect email or password." (generic). Disabled account → same generic
  message plus sign-out. Network/5xx → "We couldn't sign you in. Try again." Rate limit (`over_request_rate_limit`) → explicit wait message.
- Success → redirect by role (or `/setup` if not completed). Respect a safe `?next=` param (same-origin relative paths only).
- **Remember this workstation [S]:** when unchecked, store an `ems_session_scope=browser` cookie; the
  Supabase SSR cookie adapter (`setAll`) then strips `maxAge`/`expires` so auth cookies become session
  cookies cleared when the browser closes. When checked, default persistent cookies apply. No credentials are stored client-side.
- Login by **email** (as specified). Username is a display/handle only. → open question if Figma shows "username or email".

### 6.6 Account Recovery ([S])

- `/forgot-password`: email field → `resetPasswordForEmail(email, { redirectTo: SITE_URL/auth/confirm?next=/reset-password })`.
  Always show the same confirmation ("If an account exists, a reset link has been sent") — no enumeration.
- `/auth/confirm` handles `type=recovery` → session → `/reset-password`.
- `/reset-password`: new + confirm password (same policy) → `updateUser({ password })` → sign out other
  sessions (`signOut({ scope: 'others' })`) → redirect to dashboard with success toast.
- Expired/invalid/used link → `/auth/error?reason=link-expired` with "Request a new link".
- Accounts with `account_status != 'active'` cannot use recovery to bypass activation: `/reset-password` checks status and routes to `/setup` if setup not completed.

### 6.7 Session, sign-out, route protection

- `proxy.ts`: refreshes the Supabase session cookie (`@supabase/ssr` `updateSession` pattern) and performs
  **optimistic** redirects only:
  - unauthenticated user on `/employee/*` or `/manager/*` → `/login?next=…`
  - authenticated user on `/login`, `/activate` → role dashboard
  - `app_metadata.role` mismatch with path prefix → own dashboard
- Real enforcement: `requireUser()` / `requireRole()` in the DAL (server-only), called in each portal layout
  **and** in every Server Action and Route Handler; RLS as the final layer.
- Always use `supabase.auth.getUser()` / `getClaims()` (verified) on the server, never trust `getSession()` alone.
- Sign-out: Server Action `signOut()` from the user menu → `/login`.
- Users can never change role: no UI, `role` column excluded from update grants, `app_metadata` writable only by the secret key.

---

## 7. Employee Portal Specifications

Route prefix `/employee`. Layout: employee sidebar + top bar (exact structure TBD from Figma S1).
All data is filtered by RLS to the authenticated employee; queries also filter explicitly by `employee_id` for index use.

### 7.A Dashboard — `/employee/dashboard`

| Element | Data source | Notes |
|---|---|---|
| Welcome ("Good morning, Margaret") | `employees.first_name`; greeting by local time | Date display in configured TZ |
| Attendance statistics (present/late/absent this month, rate) | `v_attendance_monthly_summary` for own `employee_id` | |
| Pending tasks / Completed tasks counts | `tasks` count by status where `assigned_to = me` | "Pending" = `todo + in_progress` (confirm label) |
| Pending leave requests | `leave_requests` count where status `pending` | |
| My Tasks preview (top 5 by due date, not completed) | `tasks` | Row click → `/employee/tasks?task=<id>` opens modal |
| Latest Announcements preview (3) | `announcements` published, own dept, `published_at desc` | Click → `/employee/announcements?open=<id>` |
| "View all" links | Navigation | |

States: per-card skeletons inside `<Suspense>`; empty states ("No tasks assigned", "No announcements yet");
section-level error boundary with Retry.

### 7.B Attendance Records — `/employee/attendance`

| Element | Action | DB operation | Validation | Success | Error | Loading |
|---|---|---|---|---|---|---|
| Summary cards (Present/Late/Absent/Total hours) | — | `v_attendance_summary` filtered by selected month | month param valid `YYYY-MM` | values | card error text | skeleton |
| Month/date filter | update `?month=` or `?from=&to=` | re-query | range ≤ 366 days, from ≤ to | table refresh | inline error | table skeleton |
| Status filter | `?status=present\|late\|absent\|on_leave` | `.eq('status')` | enum whitelist | | | |
| Search | `?q=` (notes, shift name, date text) | `ilike` on notes / shift name | max 100 chars, escaped `%_` | | | debounced 300 ms |
| Table columns | Date, Shift, Time In, Time Out, Total Hours, Status badge, Notes | `attendance_records` join `shifts` | | | empty state | |
| Pagination | `?page=&size=` | `.range()` + exact count | size ∈ {10,20,50} | | | |
| Export CSV | GET `/api/export/attendance?scope=me&…filters` | same query, no pagination, max 5,000 rows | same filters | file download `attendance-YYYY-MM.csv` | toast | button spinner |

**How attendance records are created [C]:** the brief lists no clock-in UI. Plan default:
1. Records are **imported** (biometric/timekeeping CSV) by the owner via `scripts/import-attendance.ts`
   (secret key, validated, idempotent on `(employee_id, work_date)`), `source = 'import'`.
2. Status (`present`/`late`) is **computed by a DB trigger** from `time_in` vs `shift.start_time + grace_minutes`.
3. `absent` rows: created by the import for scheduled days without punches, or by an optional nightly
   `pg_cron` job (Supabase built-in) that inserts `absent` for scheduled working days with no record and no approved leave → **owner decision**.
4. `on_leave`: set when an approved leave covers the day (trigger on leave approval).
5. If Figma shows a "Time In / Time Out" button, add a `clock_in()/clock_out()` RPC (server time only, one record per day) — **only if present in design**.
Development uses clearly labelled seed data (`source = 'seed'`).

### 7.C My Tasks — `/employee/tasks`

| Element | Action | DB operation | Validation | Permission | Success | Error | Loading |
|---|---|---|---|---|---|---|---|
| To Do / In Progress / Completed cards | — | count by status (assigned_to = me) | | own | | | skeleton |
| Search | `?q=` title/description/task code | `ilike` | ≤100 chars | | | | debounce |
| Filters: status, priority, due (overdue/this week) | searchParams | `.eq`/date range | enum whitelist | | | | |
| Table: Task ID, Title, Priority badge, Due date (overdue highlight), Status badge, Action | | `tasks` | | own | | empty state | |
| Row / "View" | open modal `?task=<id>` | fetch task + `task_progress_updates` | id is uuid | own (RLS → 404 if not) | modal | "Task not found" | modal skeleton |
| Modal: status select | choose `todo`/`in_progress`/`completed` | — | allowed transitions: any → any except from `completed` back requires remark (confirm) | | | | |
| Modal: progress remarks | text | — | 0–1000 chars; required when status changes to `completed` (confirm) | | | | |
| Save Changes | Server Action `updateTaskProgress` → RPC `update_task_progress(task_id, status, remark)` | updates `tasks.status`, `completed_at`; inserts `task_progress_updates`; audit | server re-validates | RPC checks `assigned_to = me` | toast "Task updated", modal closes, list refresh | field errors / "You can't update this task" | button disabled + spinner |

Employees cannot edit title, description, due date, priority, or assignee.

### 7.D Announcements — `/employee/announcements`

| Element | Behavior |
|---|---|
| Feed | Published announcements of own department (`status='published'`, `published_at <= now()`); pinned first if design has pinning |
| Category filter | `?category=` from `announcement_categories` enum/table |
| Keyword search | `?q=` against title + body (Postgres full-text `tsvector` generated column, `websearch_to_tsquery`) |
| Sorting | `?sort=newest\|oldest` (and `?sort=category` if shown) |
| Expand/collapse | Client-side toggle; `?open=<id>` deep link expands and scrolls to the item |
| Attachments | List with signed download URLs (60 s) |
| Pagination | page/size |
| Read tracking [C] | Optional `announcement_reads` insert on expand — only if "audience reach / seen" metric is required (§8.F) |

### 7.E Leave Requests — `/employee/leave`

Summary cards: remaining balance per main leave type, Pending, Approved, Rejected counts (current year).

Table: Request ID, Leave type, Inclusive dates, Duration (working days), Date filed, Status badge, View.
Filters: status, leave type, year; search by request code/reason; pagination.

**New Leave Request modal**

| Field | Validation |
|---|---|
| Leave type | required; active `leave_types` |
| Start date / End date | required; `start <= end`; start ≥ today (except `sick` which allows up to 7 days back — **confirm**); range ≤ 60 calendar days; no overlap with own pending/approved requests (DB exclusion constraint + friendly message) |
| Calculated duration | read-only; `count_working_days(start, end)` = Mon–Fri excluding `holidays`; must be > 0; half-day option only if design shows it |
| Reason for absence | required, 10–1000 chars |
| Supporting document | optional (required if `leave_types.requires_document` and duration > N — confirm); PDF/JPG/PNG, ≤ 5 MB |
| Approving manager | read-only, auto-filled from `employees.approver_id` (fallback: primary manager of department) |
| Balance check | if duration > remaining balance → block submit with message (for paid types) |

Submit → Server Action `createLeaveRequest`:
1. Validate with shared schema; recompute working days **on the server** (client value ignored).
2. Insert `leave_requests` (status `pending`) via RPC `submit_leave_request` (computes duration, checks balance incl. other pending days, sets approver).
3. If a file is attached: upload to `leave-documents/{employee_id}/{request_id}/{uuid}-{safe_name}` after insert; insert `leave_request_attachments`. On upload failure: keep request, show "Request filed, attachment failed — retry from details".
4. Success: toast, modal closes, table refresh. Loading: submit disabled + spinner; double-submit prevented by `pending` and an idempotency key column (`client_request_id` unique).

Request details (drawer/modal `?request=<id>`): all fields, approver, decision, manager remarks, decided at, attachments.
Cancel own **pending** request → RPC `cancel_leave_request` (if design has a cancel control — confirm).

### 7.F My Profile — `/employee/profile`

| Section | Fields | Editable by employee |
|---|---|---|
| Header | Avatar, full name, position, employee ID, status | Avatar only |
| Personal / contact | Email (company), phone, personal email?, address?, emergency contact? | Phone, emergency contact, personal email (confirm list from Figma) |
| Department / position | Department, position, approving manager | No |
| Office information | Office location, work schedule/shift | No |
| Employment information | Hire date, employment type, status | No |
| Account | Username | Yes (unique) |
| Update password | Current password, new, confirm | Yes |

- Save profile → RPC `update_own_profile(p_phone, p_emergency_contact, …)` (whitelisted columns only).
- Update password → Server Action: re-authenticate with current password (`signInWithPassword` against the same email) then `updateUser({ password })`. Errors: wrong current password, weak password, same as old.
- Avatar → `avatars/{employee_id}/{uuid}.webp`, ≤ 2 MB, JPG/PNG/WebP.

---

## 8. Department Manager Portal Specifications

Route prefix `/manager`. All lists are scoped to departments in `department_managers` for the current user.
With one department (initial state) no department switcher is shown; if a manager has several, add a
department filter (only if design allows — otherwise list all assigned).

### 8.A Dashboard — `/manager/dashboard`

| Element | Data |
|---|---|
| Welcome | manager first name, date |
| Department overview | department name, headcount |
| Total employees | count `employees` in dept, `employment_status = 'active'` |
| Attendance issues | today's (or this week's — confirm) `late` + `absent` count |
| Pending leave requests | count pending in dept |
| Active tasks | count `todo + in_progress` in dept |
| Recent leave requests (5) | latest in dept; click → `/manager/leave?request=<id>` |
| Quick action: Assign Task | opens Create & Assign Task modal (shared component) |
| Quick action: Post Announcement | opens Create Announcement modal |
| Quick action: Review Leaves | link → `/manager/leave?status=pending` |

### 8.B Employees — `/manager/employees`

| Element | Behavior |
|---|---|
| Summary cards | Total, Active, On leave today (approved leave covering today), Inactive — final list from Figma |
| Table | Avatar + name, Employee ID, Position, Contact (email/phone), Status badge, Actions |
| Search | name, employee code, email, position |
| Filters | status, position |
| Pagination | page/size |
| View details | `/manager/employees/[id]` page or drawer (follow Figma): profile, attendance summary, current tasks, leave history, notes |
| Quick Assign Task | Create & Assign modal pre-filled with employee |
| Add Department Note [C] | Only if present in Figma: `employee_notes` insert (1–2000 chars), visible to managers of that dept only; never shown to the employee |

Managers can edit only non-sensitive work fields (position, office location, work shift) if the design has an edit control; otherwise employee directory is read-only. Role, department, employee code, email: never.

### 8.C Attendance — `/manager/attendance`

- Present / Late / Absent statistics for the selected date range.
- Table: Employee, Employee ID, Date, Shift, Time In, Time Out, Total Hours, Status, Notes.
- Search (employee name/ID), filters: status, shift, date range, employee; pagination; CSV export (`scope=department`).
- **Assumption: read-only.** No editing is planned unless Figma shows edit controls. If it does, add
  `manager_correct_attendance(record_id, time_in, time_out, notes, reason)` RPC with mandatory reason and audit log — documented as a scope change.

### 8.D Tasks — `/manager/tasks`

| Element | Action | DB / RPC | Validation | Success / Error |
|---|---|---|---|---|
| Stats cards | — | counts by status in dept | | |
| Table | Task ID, Title, Assigned employee, Priority, Due date, Status, Last update | `tasks` + latest `task_progress_updates` | | empty state |
| Search / filters | status, priority, assignee, due range, overdue | | whitelists | |
| Create & Assign New Task (modal) | Server Action `createTask` → insert `tasks` | | title 3–150; description ≤ 5000; assignee must be active employee in manager's dept (DB check in policy + trigger); due date ≥ today; priority enum; initial status `todo`\|`in_progress` | toast "Task assigned" / field errors |
| Task identifier | auto `TSK-000123` from sequence (read-only, shown after save or as preview "Auto-generated") | | | |
| Edit task (Update Task) | `updateTask` → update allowed columns | | same as create; reassign only within dept | |
| Update Progress tab | timeline of `task_progress_updates` (employee remarks + status changes); manager can add a review remark and change status via `update_task_progress` | | remark ≤ 1000 | |
| Delete / archive [C] | only if in design; soft-delete `archived_at` | | | |

### 8.E Leave Requests — `/manager/leave`

- Stats: Pending review, Approved, Rejected (current year or selected period).
- Table: Request ID, Employee, Leave type, Dates, Duration, Filed on, Status, Review.
- Review Request modal/panel (`?request=<id>`):
  - Employee info (name, ID, position, avatar)
  - Leave balance for that type: entitled, used, pending, remaining (live from `leave_balances` + pending sum)
  - Inclusive dates, working-day duration, filed date
  - Employee reason, supporting documents (signed URLs)
  - **Team coverage assessment [S/C]:** computed from real data — list of other dept employees with approved/pending leave overlapping the range, and count of tasks assigned to the requester due within the range. No invented "coverage score".
  - Manager remarks textarea (required for Reject, optional for Approve; ≤ 1000 chars)
  - Approve Leave / Reject Leave buttons
- Decision → Server Action → RPC `decide_leave_request(p_request_id, p_decision, p_remarks)`:
  1. `SELECT … FOR UPDATE` the request.
  2. Verify caller manages the employee's department **and** is not the requester.
  3. Verify `status = 'pending'` → otherwise raise `already_decided` (UI: "This request was already approved/rejected by …"; refresh).
  4. On approve: recheck remaining balance (entitled − used ≥ duration) → else raise `insufficient_balance`; increment `used_days`; mark attendance days `on_leave` if records exist.
  5. Set status, `decided_by`, `decided_at`, `manager_remarks`.
  6. Insert `audit_logs`.
  All in one transaction. Buttons disabled while pending; both disabled after a decision.
- Conflicts prevented by: exclusion constraint on overlapping active leave per employee; status check constraint; row lock; transition check (only `pending → approved|rejected|cancelled`).

### 8.F Announcements — `/manager/announcements`

| Element | Behavior |
|---|---|
| Stats: Total bulletins, Published, Drafts | counts in dept |
| Audience reach [C] | Default: number of active employees in the department (measurable). If Figma shows "seen by X", implement `announcement_reads` and show reads ÷ headcount |
| Search / filters | keyword, category, status, date |
| Create Department Announcement modal | title (5–150), category (required), body (20–10,000, plain text with line breaks; rich text only if Figma shows a toolbar — confirm), attachments (≤ 5 files, ≤ 10 MB each, PDF/DOCX/XLSX/JPG/PNG) |
| Save Draft | insert/update with `status='draft'` |
| Publish Announcement | set `status='published'`, `published_at=now()`; immediately visible to department employees via RLS |
| Edit Announcement | drafts editable freely; published edits update `updated_at` and show "Edited" label |
| Unpublish/Archive, Delete draft [C] | only if in design |
| Details view | full body, attachments, author, timestamps, reach |
| Slack / Google Calendar / email notification toggles | **[R] Reference-only.** Rendered disabled with tooltip "Not available" or omitted — decision recorded in `design/INVENTORY.md`. Never simulate a send |

---

## 9. Supabase Database Design

### 9.1 Conventions

- Schema `public` for app tables exposed via the Data API; schema `private` for helper functions (not exposed).
- PK: `uuid default gen_random_uuid()` except reference tables with natural keys.
- Every table: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  maintained by a shared trigger `private.set_updated_at()`.
- Enums as Postgres `enum` types for stable state machines; reference lists as tables.
- Emails stored lowercase with `check (email = lower(email))`.
- Extensions: `btree_gist` (exclusion constraint), `pg_trgm` (optional search), `pg_cron` (optional absent job).
- Human-readable codes: sequences + `to_char` defaults (e.g., `'TSK-' || lpad(nextval('task_code_seq')::text, 6, '0')`).

### 9.2 Enum types

```sql
app_role            : 'employee' | 'department_manager'
account_status      : 'provisioned' | 'invited' | 'active' | 'disabled'
employment_status   : 'active' | 'on_leave' | 'inactive'
attendance_status   : 'present' | 'late' | 'absent' | 'on_leave' | 'holiday'
record_source       : 'seed' | 'import' | 'system' | 'manager'
task_status         : 'todo' | 'in_progress' | 'completed'
task_priority       : 'low' | 'medium' | 'high'            -- confirm 'urgent' from Figma
leave_status        : 'pending' | 'approved' | 'rejected' | 'cancelled'
announcement_status : 'draft' | 'published' | 'archived'
```

### 9.3 Tables

**departments**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| code | text | unique, not null |
| name | text | not null |
| created_at / updated_at | timestamptz | |

**employees** (the profile table — replaces a separate `profiles` table to avoid duplication)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | unique, null, FK `auth.users(id) on delete set null` |
| employee_code | text | unique, not null (format from owner, e.g. `EMP-0001`) |
| email | text | unique, not null, lowercase check |
| username | text | null; unique index on `lower(username)` |
| first_name, middle_name, last_name | text | first/last not null |
| role | app_role | not null default `employee` |
| department_id | uuid | FK departments, not null |
| position | text | |
| employment_type | text | check in ('full_time','part_time','contract','probationary') — confirm |
| employment_status | employment_status | default `active` |
| hire_date | date | |
| phone | text | check length ≤ 20 |
| personal_email, emergency_contact_name, emergency_contact_phone, address | text | confirm from Figma |
| office_location | text | |
| default_shift_id | uuid | FK shifts |
| approver_id | uuid | FK employees(id), null; check `approver_id <> id` |
| avatar_path | text | storage object path |
| account_status | account_status | default `provisioned` |
| invited_at, activated_at, setup_completed_at | timestamptz | |
| created_at / updated_at | | |

Indexes: `(department_id)`, `(user_id)`, `(approver_id)`, trigram on full name (optional).

**department_managers** (manager ↔ department assignment)
| Column | Type | Constraints |
|---|---|---|
| department_id | uuid | FK, PK part |
| employee_id | uuid | FK employees, PK part |
| is_primary | boolean | default true; partial unique index on `(department_id) where is_primary` |
| created_at | | |
Trigger: employee must have `role = 'department_manager'`.

**shifts**
| id uuid PK | code text unique | name text | start_time time | end_time time | grace_minutes int default 15 check ≥ 0 | crosses_midnight boolean |

**holidays**
| holiday_date date PK | name text | is_working_day boolean default false |

**attendance_records**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| employee_id | uuid | FK, not null |
| department_id | uuid | FK, not null (denormalized for RLS/index; set by trigger from employee) |
| work_date | date | not null |
| shift_id | uuid | FK shifts |
| time_in, time_out | timestamptz | check `time_out is null or time_out > time_in` |
| worked_minutes | int | generated: `extract(epoch from time_out - time_in)/60` (minus break if policy) |
| status | attendance_status | not null; computed by trigger when `time_in` present |
| notes | text | ≤ 500 |
| source | record_source | not null |
| unique | | `(employee_id, work_date)` (one record per day — confirm split shifts not needed) |
Indexes: `(employee_id, work_date desc)`, `(department_id, work_date desc)`, `(department_id, status, work_date)`.

**tasks**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| task_code | text | unique, default from sequence |
| department_id | uuid | FK, not null |
| title | text | 3–150 |
| description | text | ≤ 5000 |
| assigned_to | uuid | FK employees, not null |
| created_by | uuid | FK employees, not null |
| due_date | date | not null |
| priority | task_priority | not null default `medium` |
| status | task_status | not null default `todo` |
| started_at, completed_at | timestamptz | `completed_at` set/cleared by trigger with status |
| archived_at | timestamptz | soft delete |
Trigger: `assigned_to` must belong to `department_id`. Indexes: `(assigned_to, status, due_date)`, `(department_id, status, due_date)`.

**task_progress_updates** (append-only history)
| id uuid PK | task_id FK on delete cascade | author_id FK employees | from_status task_status null | to_status task_status null | remark text ≤ 1000 | created_at |
Index `(task_id, created_at desc)`. No UPDATE/DELETE grants.

**leave_types**
| id uuid PK | code text unique | name | is_paid bool | default_annual_days numeric(5,1) | requires_document bool | max_backdate_days int default 0 | is_active bool |
Seed (confirm): Vacation, Sick, Emergency, Maternity/Paternity, Unpaid.

**leave_balances**
| employee_id FK | leave_type_id FK | year int | entitled_days numeric(5,1) ≥ 0 | used_days numeric(5,1) ≥ 0 | PK (employee_id, leave_type_id, year) | check `used_days <= entitled_days` |
Pending days are computed (sum of pending requests), not stored, to avoid drift.

**leave_requests**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| request_code | text | unique, `LR-000123` |
| employee_id | uuid | FK not null |
| department_id | uuid | FK not null (trigger-set) |
| leave_type_id | uuid | FK not null |
| start_date, end_date | date | check `end_date >= start_date` |
| working_days | numeric(4,1) | check > 0; set by server/RPC |
| reason | text | 10–1000 |
| status | leave_status | default `pending` |
| approver_id | uuid | FK employees |
| decided_by | uuid | FK employees null |
| decided_at | timestamptz | check `(status in ('approved','rejected')) = (decided_at is not null)` |
| manager_remarks | text | ≤ 1000; required (check) when status `rejected` |
| client_request_id | uuid | unique (idempotency) |
| exclusion | | `EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&) WHERE (status in ('pending','approved'))` |
Status transition trigger: only `pending → approved | rejected | cancelled`. Indexes: `(employee_id, start_date desc)`, `(department_id, status, created_at desc)`.

**leave_request_attachments**
| id uuid PK | leave_request_id FK cascade | storage_path text unique | file_name | mime_type check in whitelist | size_bytes check ≤ 5 MB | uploaded_by FK | created_at |

**announcements**
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| department_id | uuid | FK not null |
| author_id | uuid | FK employees not null |
| title | text | 5–150 |
| body | text | 20–10000 (draft may be shorter: constraint applies when status = published) |
| category | text | FK `announcement_categories(code)` |
| status | announcement_status | default `draft` |
| is_pinned | boolean | default false (only if design has pinning) |
| published_at | timestamptz | check `(status = 'published') <= (published_at is not null)` |
| search_tsv | tsvector | generated from title + body, GIN index |
Indexes: `(department_id, status, published_at desc)`.

**announcement_categories** — `code text PK, name text, sort_order int` (seed from Figma: e.g., General, Policy, Event, HR, Urgent — confirm).

**announcement_attachments** — same shape as leave attachments, FK announcement (cascade), ≤ 10 MB.

**announcement_reads** [C, only if reach/seen metric needed] — `(announcement_id, employee_id) PK, read_at`.

**employee_notes** [C, only if in design] — `id, employee_id FK, department_id FK, author_id FK, body 1–2000, created_at, updated_at`.

**activation_attempts** — `id bigint identity, ip_hash text, email_hash text, succeeded bool, created_at`; index `(ip_hash, created_at)`, `(email_hash, created_at)`; RLS on with **no** policies (server/secret key only); purge > 30 days via cron or script.

**audit_logs**
| id bigint identity PK | actor_employee_id uuid null | actor_user_id uuid null | action text (e.g. `leave.approved`, `task.status_changed`, `account.setup_completed`, `announcement.published`) | entity_type text | entity_id uuid | department_id uuid | before jsonb | after jsonb | created_at |
Insert only from security-definer functions/triggers; no client grants. Index `(entity_type, entity_id)`, `(department_id, created_at desc)`.

### 9.4 Views (with `security_invoker = true` so RLS applies)

- `v_attendance_summary(employee_id, department_id, month, present, late, absent, on_leave, worked_minutes)`
- `v_task_counts(employee_id/department_id, status, count)`
- `v_leave_balance(employee_id, leave_type, year, entitled, used, pending, remaining)`
- `v_employee_directory` — safe columns for manager lists (excludes personal fields not in design)
- `v_my_approver` — exposes only approver name/position to the employee

### 9.5 Functions / RPCs

All `security definer`, `set search_path = ''`, explicit permission checks, `revoke execute from public, anon`, `grant execute to authenticated`.

| Function | Purpose |
|---|---|
| `private.current_employee_id()` | `employees.id` for `auth.uid()` (stable) |
| `private.current_app_role()` | role of current user |
| `private.is_manager_of(dept uuid)` | exists in `department_managers` for current employee |
| `private.manages_employee(emp uuid)` | manager of that employee's department |
| `public.count_working_days(start date, end date)` | Mon–Fri minus `holidays` |
| `public.complete_first_time_setup(username)` | §6.4 |
| `public.update_own_profile(...)` | whitelisted self-service fields |
| `public.update_task_progress(task_id, status, remark)` | employee (own task) or manager (dept) |
| `public.submit_leave_request(...)` | computes duration, checks balance/overlap, sets approver |
| `public.cancel_leave_request(id)` | own pending only |
| `public.decide_leave_request(id, decision, remarks)` | §8.E |
| `public.publish_announcement(id)` | manager of dept; sets published_at; audit |

Triggers: `set_updated_at`, `attendance_compute_status`, `tasks_set_completed_at`, `tasks_assignee_in_department`,
`leave_requests_transition_guard`, `set_department_from_employee`, `audit_*` on critical tables.

### 9.6 Migration files (Phase 2)

```
supabase/migrations/
  0001_extensions_and_enums.sql
  0002_core_org.sql              -- departments, employees, department_managers, shifts, holidays
  0003_attendance.sql
  0004_tasks.sql
  0005_leave.sql
  0006_announcements.sql
  0007_notes_audit_activation.sql
  0008_helpers_and_rpcs.sql
  0009_views.sql
  0010_rls_policies.sql
  0011_storage_buckets_and_policies.sql
supabase/seed.sql                -- LOCAL DEV ONLY, clearly labelled fake data (source='seed')
supabase/tests/*.sql             -- pgTAP RLS tests
```

---

## 10. RLS and Security Strategy

### 10.1 Principles

1. RLS **enabled on every public table**; default deny.
2. Policies call `private.*` helpers wrapped as `(select private.fn())` so they evaluate once per query.
3. Writes that need column restrictions or multi-step logic go through security-definer RPCs; direct table
   `UPDATE` grants are limited with column-level `GRANT UPDATE (col, …)`.
4. Never use `user_metadata` in policies (user-editable). Role comes from `employees.role`.
5. The secret key is used only in: activation Server Action, provisioning/import scripts. Never in page rendering.
6. Every Server Action re-checks auth and role (DAL), validates input, and returns sanitized errors (no raw Postgres messages to the client).

### 10.2 Policy summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| departments | member of dept OR manager of dept | — | — | — |
| employees | `user_id = auth.uid()` OR `is_manager_of(department_id)` | — | manager: column grant (position, office_location, default_shift_id) + `is_manager_of(department_id)`; self: via RPC only | — |
| department_managers | `employee_id = current_employee_id()` | — | — | — |
| shifts, holidays, leave_types, announcement_categories | `authenticated` | — | — | — |
| attendance_records | own OR `is_manager_of(department_id)` | — | — | — |
| tasks | `assigned_to = me` OR `is_manager_of(department_id)` | manager of dept, `created_by = me` | manager of dept (column grant excludes `task_code`, `created_by`, `department_id`) | — (archive via update) |
| task_progress_updates | via task visibility | RPC only | — | — |
| leave_requests | own OR manager of dept | RPC only | RPC only | — |
| leave_balances | own OR manager of dept | — | — | — |
| leave_request_attachments | via request visibility | own pending request, `uploaded_by = me` | — | own while request pending |
| announcements | manager of dept (all) OR (`status='published'` AND employee's dept) | manager of dept, `author_id = me` | manager of dept | manager of dept AND `status='draft'` |
| announcement_attachments | via announcement visibility | manager of dept | — | manager of dept |
| employee_notes | manager of dept | manager of dept, `author_id = me` | author only | author only |
| audit_logs, activation_attempts | — | — | — | — |

### 10.3 Security checklist

- No signup: `Auth > Allow new users to sign up = off`.
- Redirect URL allow-list contains only the production and local URLs.
- Email templates use `/auth/confirm?token_hash=…&type=…`.
- Password policy configured in Supabase Auth + mirrored client-side.
- CSV export: escape cells beginning with `= + - @ \t \r` (CSV injection), RLS client, row cap.
- `?next=` redirect: allow only paths starting with `/` and not `//`.
- Security headers in `next.config.ts` (`X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`); CSP evaluated in Phase 9 (see `docs/02-guides/content-security-policy.md`).
- Run Supabase **security advisors** after each migration (Phase 2, 8, 9).
- Server Actions return typed `{ ok, fieldErrors?, message? }` objects; never throw raw DB errors to the client.

---

## 11. Storage and File Handling

| Bucket | Public | Path convention | Max size | MIME types | Read | Write |
|---|---|---|---|---|---|---|
| `avatars` | No | `{employee_id}/{uuid}.{ext}` | 2 MB | image/jpeg, image/png, image/webp | own; managers of dept | own folder only |
| `leave-documents` | No | `{employee_id}/{leave_request_id}/{uuid}-{sanitized}` | 5 MB | application/pdf, image/jpeg, image/png | owner; manager of owner's dept | owner, only while request pending |
| `announcement-attachments` | No | `{department_id}/{announcement_id}/{uuid}-{sanitized}` | 10 MB | pdf, docx, xlsx, jpeg, png | dept members if announcement published; managers of dept always | managers of dept |

- Bucket-level `file_size_limit` and `allowed_mime_types` set in migration.
- `storage.objects` policies use `(storage.foldername(name))[1]` matched against helper functions.
- Downloads via **signed URLs** (60–300 s), generated server-side after a visibility check.
- File names sanitized (`[^a-zA-Z0-9._-]` → `-`, max 100 chars); original name kept in the metadata table.
- Upload flow: client → Server Action receives `File` (FormData) → validates size/type server-side → uploads with user-scoped client (storage RLS applies) → inserts metadata row. Orphan cleanup: metadata insert failure deletes the object.
- Server Action body size limit: raise `serverActions.bodySizeLimit` to ~11 MB in `next.config.ts` (check docs for v16 option name), or use signed upload URLs for large files.

---

## 12. Suggested Project Structure

```
ems-dani/
├─ app/
│  ├─ layout.tsx                       # root: fonts, <html>, Toaster
│  ├─ globals.css                      # Tailwind v4 @theme design tokens
│  ├─ page.tsx                         # redirect to role dashboard or /login
│  ├─ not-found.tsx, global-error.tsx
│  ├─ (auth)/
│  │  ├─ layout.tsx                    # auth-bg.png background + centered card (per Figma)
│  │  ├─ login/page.tsx
│  │  ├─ activate/page.tsx
│  │  ├─ setup/page.tsx
│  │  ├─ forgot-password/page.tsx
│  │  ├─ reset-password/page.tsx
│  │  └─ auth/error/page.tsx
│  ├─ auth/confirm/route.ts            # verifyOtp(token_hash, type) → redirect
│  ├─ (portal)/
│  │  ├─ employee/
│  │  │  ├─ layout.tsx                 # requireRole('employee') inside Suspense, sidebar
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ attendance/page.tsx
│  │  │  ├─ tasks/page.tsx
│  │  │  ├─ announcements/page.tsx
│  │  │  ├─ leave/page.tsx
│  │  │  └─ profile/page.tsx
│  │  └─ manager/
│  │     ├─ layout.tsx                 # requireRole('department_manager')
│  │     ├─ dashboard/page.tsx
│  │     ├─ employees/page.tsx
│  │     ├─ employees/[employeeId]/page.tsx
│  │     ├─ attendance/page.tsx
│  │     ├─ tasks/page.tsx
│  │     ├─ leave/page.tsx
│  │     ├─ announcements/page.tsx
│  │     └─ profile/page.tsx           # if in Figma
│  └─ api/export/attendance/route.ts   # CSV
├─ components/
│  ├─ ui/                              # shadcn primitives restyled to tokens
│  ├─ layout/                          # Sidebar, Topbar, UserMenu, PageHeader, AuthCard
│  ├─ data/                            # DataTable, Pagination, SearchInput, FilterSelect, DateRangeFilter, ExportButton, EmptyState
│  ├─ feedback/                        # StatusBadge, PriorityBadge, StatCard, Skeletons, FormError
│  └─ forms/                           # FormField, PasswordInput, FileDropzone, SubmitButton
├─ features/
│  ├─ auth/        (actions.ts, schemas.ts, components/)
│  ├─ dashboard/
│  ├─ attendance/  (queries.ts, components/, csv.ts)
│  ├─ tasks/       (queries.ts, actions.ts, schemas.ts, components/TaskDetailsModal.tsx, CreateTaskModal.tsx)
│  ├─ leave/       (queries.ts, actions.ts, schemas.ts, working-days.ts, components/)
│  ├─ announcements/
│  ├─ employees/
│  └─ profile/
├─ lib/
│  ├─ supabase/
│  │  ├─ server.ts                     # createServerClient (cookies) — server only
│  │  ├─ client.ts                     # createBrowserClient — only where truly needed
│  │  ├─ admin.ts                      # secret-key client — 'server-only', used by activation only
│  │  └─ proxy.ts                      # updateSession helper used by /proxy.ts
│  ├─ auth/dal.ts                      # getCurrentUser, requireUser, requireRole ('server-only')
│  ├─ search-params.ts                 # parse/whitelist list params
│  ├─ dates.ts                         # TZ formatting, month ranges
│  ├─ csv.ts                           # safe CSV serialization
│  └─ utils.ts                         # cn()
├─ types/
│  ├─ database.ts                      # generated: supabase gen types typescript
│  └─ domain.ts                        # app-level types (Role, Status unions)
├─ proxy.ts                            # session refresh + optimistic redirects
├─ supabase/ (config.toml, migrations/, seed.sql, tests/)
├─ scripts/ (provision-employees.ts, import-attendance.ts)
├─ provisioning/ (git-ignored real CSVs; commit *.example.csv only)
├─ design/ (INVENTORY.md, reference/<module>/*.png)
├─ tests/ (unit/, e2e/)
├─ .env.example
└─ PLAN.md
```

Rules: `features/*/queries.ts` and `actions.ts` import `lib/auth/dal.ts` and `lib/supabase/server.ts` only; client
components never import them. Shared UI has no data fetching.

---

## 13. Shared Components and Design Tokens

### 13.1 Tokens (values TBD from Figma — Phase 0)

Defined once in `app/globals.css` under `@theme`, consumed as Tailwind utilities. Placeholder names:

| Group | Tokens |
|---|---|
| Color — brand | `--color-primary`, `--color-primary-hover`, `--color-primary-foreground` |
| Color — surfaces | `--color-canvas` (app bg), `--color-surface` (cards), `--color-sidebar`, `--color-sidebar-active`, `--color-border`, `--color-input` |
| Color — text | `--color-text`, `--color-text-muted`, `--color-text-subtle` |
| Color — status | success/warning/danger/info each with `-bg` and `-fg` (badges: present/approved/completed = success; late/pending/in_progress = warning; absent/rejected = danger; todo/draft = neutral) — **exact mapping from Figma** |
| Typography | `--font-sans` (Figma family; replace Geist if different), scale `text-xs … text-3xl` with line heights from Figma text styles |
| Spacing | Tailwind 4px base unless Figma uses a different grid |
| Radius | `--radius-sm/md/lg` (inputs, cards, modals) |
| Shadow | `--shadow-card`, `--shadow-modal` |
| Layout | `--sidebar-width`, `--topbar-height`, `--content-max-width`, page padding |
| Component sizes | button height (sm/md), input height, table header/row height, badge height, modal widths (sm/md/lg) |

The starter's dark-mode `prefers-color-scheme` block will be removed unless Figma includes a dark theme.

### 13.2 Shared components

| Component | Used by | Notes |
|---|---|---|
| `Sidebar` (+ role nav config) | both portals | active state from `usePathname`; collapsible drawer < 1024 px |
| `Topbar` / `UserMenu` | both | name, role, avatar, sign out |
| `PageHeader` | all pages | title, subtitle, actions slot |
| `StatCard` | dashboards, summaries | label, value, icon, optional delta |
| `DataTable` | all tables | server-driven; columns config; sticky header; row click |
| `Pagination` | tables, feeds | URL-based |
| `SearchInput`, `FilterSelect`, `DateRangeFilter`, `MonthPicker` | list pages | update URL with `router.replace` + transition |
| `StatusBadge`, `PriorityBadge` | everywhere | single map from status → token |
| `Modal` (shadcn Dialog) | all modals | sizes from Figma; focus trap; Esc; URL-synced open state |
| `FormField`, `PasswordInput`, `SubmitButton`, `FileDropzone` | forms | `useActionState` pending; error slot |
| `EmptyState`, `ErrorState`, skeletons | all | |
| `Toaster` | root | shadcn Sonner (part of shadcn ecosystem) — or inline banner if Figma shows one |
| `AuthCard` | auth pages | over `auth-bg.png` |

### 13.3 Responsive behavior

- Desktop (≥ 1280): exact Figma layout.
- 1024–1279: same layout, tables scroll horizontally inside their card, stat grid wraps.
- < 1024: sidebar becomes off-canvas drawer opened from top bar; stat cards 2 columns; modals full-width with 16 px margin.
- < 640: stat cards 1 column; tables keep horizontal scroll (no card-list rewrite unless Figma has mobile frames).

---

## 14. API / Data Access Strategy

| Concern | Approach |
|---|---|
| Reads | Server Components call `features/*/queries.ts`, which call `requireRole()` then the user-scoped Supabase server client. RLS applies |
| Session in Cache Components | Session-reading components rendered inside `<Suspense>`; layout shell (sidebar frame, page header text) static; user-specific parts stream |
| Caching | No `'use cache'` for RLS-scoped data initially (correctness first). Reference data (shifts, leave types, categories) may use `'use cache'` with `cacheTag` and the publishable-key client (no cookies). Revisit in Phase 9 |
| Mutations | Server Actions in `features/*/actions.ts`: `requireRole` → zod parse → RPC/insert → `refresh()` or `revalidatePath()` → typed result |
| Forms | `useActionState` for pending/error; progressive enhancement where practical |
| Lists | `searchParams` → `parseListParams()` (whitelist sort columns, clamp page size) → `.range(from, to)` with `{ count: 'exact' }` |
| Modals | Open state in URL (`?task=`, `?request=`) so dashboard links deep-link and refresh keeps context |
| CSV | Route Handler, user-scoped client, same filter parser, streamed, `Content-Disposition: attachment` |
| Realtime | Not used (not required). Optional later for leave status updates |
| Types | `supabase gen types typescript` → `types/database.ts`; regenerate after every migration |
| Errors | Map Postgres error codes/RPC `raise exception` codes (`already_decided`, `insufficient_balance`, `overlap`, `forbidden`) to user messages in one `lib/errors.ts` |

---

## 15. Implementation Phases

### Critical path

```
Phase 0 (Figma access + inventory)
   └─► Phase 1 (foundation + tokens) ─┐
Phase 2 (schema + RLS + storage) ─────┼─► Phase 3 (auth) ─► Phase 4 (layouts/nav)
                                      │        └─► Phase 5 (employee) ─┐
                                      │        └─► Phase 6 (manager) ──┼─► Phase 7 (cross-role) ─► Phase 8 (QA) ─► Phase 9 (launch)
```

Phase 1 and Phase 2 can run in parallel after Phase 0. Phase 3 needs both. Visual work in 4–6 is blocked on
Phase 0 measurements; data/logic work is not.

---

### Phase 0 — Project audit and Figma asset inventory

- **Objective:** obtain authoritative design data and freeze open product decisions.
- **Tasks:**
  1. Resolve Figma access (§3.1).
  2. Export every frame to `design/reference/` (1× and 2×) and all brand assets (logo SVG, illustrations, custom icons) to `public/images/`.
  3. Write `design/INVENTORY.md`: frame list, node IDs, tokens table, component measurements, state coverage, reference-only indicators.
  4. Answer open questions in §17 (owner) and record decisions in `PLAN.md` §17.
  5. Confirm Supabase project to use (existing vs new) and SMTP availability.
- **Files:** `design/INVENTORY.md`, `design/reference/**`, `public/images/**`, `PLAN.md` §17.
- **Dependencies:** owner input.
- **Acceptance criteria:** every screen in §3.2 mapped to a frame (or marked "not in design"); token values filled; all [C] items have a decision.
- **Testing:** n/a (review only).
- **Deliverable:** design inventory + decisions log.
- **Checklist:**
  - [ ] Figma accessible or full PNG export present
  - [ ] Tokens extracted (colors, type, spacing, radius, shadows, sizes)
  - [ ] Brand assets exported
  - [ ] Reference-only indicators listed
  - [ ] Open questions answered
  - [ ] Supabase project + SMTP confirmed

### Phase 1 — Foundation, project structure, and design system

- **Objective:** installable, lint-clean skeleton with tokens and primitives matching Figma.
- **Tasks:**
  1. Install approved packages (§2.2). Init shadcn/ui for Tailwind v4 (verify v16 compatibility).
  2. Create folder structure (§12). Add `.env.example`.
  3. Implement tokens in `app/globals.css` `@theme`; load Figma font via `next/font`; remove starter page/assets.
  4. Restyle shadcn primitives: Button, Input, Select, Checkbox, Dialog, Tabs, Textarea, Popover/Calendar, DropdownMenu, Tooltip, Sonner.
  5. Build shared non-data components: StatCard, StatusBadge, PriorityBadge, EmptyState, skeletons, PasswordInput, SubmitButton, FormField.
  6. Internal `/dev/ui` preview page (excluded from production via env check) to compare components with Figma.
  7. Add `typecheck` script (`tsc --noEmit`), configure Vitest.
- **Files:** `app/globals.css`, `app/layout.tsx`, `components/**`, `lib/utils.ts`, `package.json`, `components.json`.
- **Dependencies:** Phase 0 tokens (structure can start before).
- **Acceptance criteria:** `npm run lint`, `typecheck`, `build` pass; component preview matches Figma component measurements within tolerance (±1 px dimensions, exact colors/type).
- **Testing:** lint, typecheck, build; visual side-by-side of preview page vs Figma components.
- **Deliverable:** design system + project skeleton.
- **Checklist:**
  - [ ] Packages installed (approved list only)
  - [ ] Tokens + font applied
  - [ ] Primitives restyled
  - [ ] Shared components built
  - [ ] Lint/typecheck/build green

### Phase 2 — Supabase schema, RLS, and secure storage

- **Objective:** complete, tested database layer.
- **Tasks:**
  1. `supabase init`; link to the confirmed project; local stack for development.
  2. Write migrations 0001–0011 (§9.6). Load the Supabase Postgres best-practices skill before writing SQL.
  3. RPCs and triggers (§9.5), views (§9.4), storage buckets + policies (§11).
  4. Local `seed.sql` with labelled fake data: 1 department, 1 manager, 6 employees, 3 months of attendance, tasks in all statuses, leave in all statuses, announcements (draft/published).
  5. pgTAP tests (§16.3).
  6. Generate `types/database.ts`.
  7. Run Supabase security + performance advisors; fix findings.
  8. Apply to remote project **only after owner approval**.
- **Files:** `supabase/**`, `types/database.ts`.
- **Dependencies:** Phase 0 decisions (statuses, leave types, categories, employee code format).
- **Acceptance criteria:** `supabase db reset` succeeds; all pgTAP tests pass; advisors show no security warnings; no table without RLS.
- **Testing:** pgTAP RLS matrix, constraint tests (overlap, transitions, balances).
- **Deliverable:** migrations + seed + tests + generated types.
- **Checklist:**
  - [ ] Migrations reproducible from scratch
  - [ ] RLS on all tables
  - [ ] RPCs permission-checked
  - [ ] Storage policies tested
  - [ ] Types generated
  - [ ] Advisors clean

### Phase 3 — Authentication, activation, and first-time setup

- **Objective:** secure end-to-end account lifecycle.
- **Tasks:**
  1. `lib/supabase/{server,client,admin,proxy}.ts`, `proxy.ts`, `lib/auth/dal.ts`.
  2. Supabase Auth config: disable signup, redirect URLs, email templates (`token_hash`), password policy, custom SMTP.
  3. Pages: login, activate, setup, forgot-password, reset-password, auth/error; `auth/confirm` route.
  4. Actions: `activateAccount`, `signIn`, `completeSetup`, `requestPasswordReset`, `resetPassword`, `signOut`.
  5. Remember-workstation cookie behavior.
  6. `scripts/provision-employees.ts`; provision the two real accounts (owner runs it with the secret key).
- **Files:** `app/(auth)/**`, `app/auth/confirm/route.ts`, `features/auth/**`, `lib/supabase/**`, `lib/auth/dal.ts`, `proxy.ts`, `scripts/provision-employees.ts`.
- **Dependencies:** Phase 1, Phase 2.
- **Acceptance criteria:** both real users can activate, set up, log in, reset password, and land on the correct dashboard; wrong-role URLs redirect; no auth page leaks account existence beyond the Figma-specified activation error.
- **Testing:** E2E auth flows (local Supabase Inbucket/Mailpit for emails); unit tests for schemas; manual test of expired links.
- **Deliverable:** working auth.
- **Checklist:**
  - [ ] Activation (valid / invalid / already active / expired link)
  - [ ] First-time setup + redirect by role
  - [ ] Login (success / invalid / rate-limited) + remember workstation
  - [ ] Recovery (request / valid link / expired link)
  - [ ] Proxy + DAL protection
  - [ ] Signup disabled, role immutable

### Phase 4 — Shared dashboard layouts and navigation

- **Objective:** both portal shells pixel-matched to Figma.
- **Tasks:** Sidebar (role nav config), Topbar, UserMenu, PageHeader, portal layouts with Suspense, responsive drawer, `loading.tsx` / `error.tsx` / `not-found.tsx`, DataTable + Pagination + filter components wired to URL params, CSV helper.
- **Files:** `components/layout/**`, `components/data/**`, `app/(portal)/*/layout.tsx`, `lib/search-params.ts`, `lib/csv.ts`.
- **Dependencies:** Phase 3.
- **Acceptance criteria:** navigation works for both roles; active states correct; layout matches Figma at 1440/1512 desktop width; usable at 768 and 375.
- **Testing:** E2E navigation per role; visual comparison of shell.
- **Deliverable:** portal shells with empty page placeholders (clearly marked, no fake data).
- **Checklist:**
  - [ ] Sidebar/topbar match Figma
  - [ ] Role-specific nav
  - [ ] Responsive drawer
  - [ ] Table/pagination/filter primitives
  - [ ] Error/loading/not-found boundaries

### Phase 5 — Employee Portal modules

- **Objective:** all six employee screens functional on live data.
- **Order:** Profile → Tasks → Leave → Attendance → Announcements → Dashboard (dashboard last, reuses queries).
- **Tasks:** per §7 — queries, actions, modals, validation, CSV export, uploads.
- **Files:** `app/(portal)/employee/**`, `features/{profile,tasks,leave,attendance,announcements,dashboard}/**`.
- **Dependencies:** Phases 2–4.
- **Acceptance criteria:** every element in §7 performs its specified action with success/error/loading states; employee cannot see others' data (verified by E2E with second seed employee).
- **Testing:** unit (working days, schemas), E2E (task update, leave submission with attachment, CSV content), visual comparison per frame.
- **Deliverable:** complete employee portal.
- **Checklist:**
  - [ ] Dashboard
  - [ ] Attendance (filters, search, pagination, CSV)
  - [ ] My Tasks (modal update + history)
  - [ ] Announcements (filter, search, sort, expand, pagination)
  - [ ] Leave (summary, table, modal, upload, details, balance check)
  - [ ] Profile (permitted edits, avatar, password)

### Phase 6 — Department Manager Portal modules

- **Objective:** all six manager screens functional on live data.
- **Order:** Employees → Tasks → Leave → Announcements → Attendance → Dashboard.
- **Tasks:** per §8, reusing Phase 5 components (DataTable, badges, CreateTask modal shared with dashboard quick action).
- **Files:** `app/(portal)/manager/**`, `features/{employees,tasks,leave,announcements,attendance,dashboard}/**`.
- **Dependencies:** Phases 2–4 (parallel with Phase 5 possible after shared components exist).
- **Acceptance criteria:** every element in §8 works; manager sees only assigned department; cannot decide own leave; cannot change roles.
- **Testing:** E2E (create task, review progress, approve/reject leave, double-decision attempt, publish announcement), RLS checks with a second department in seed.
- **Deliverable:** complete manager portal.
- **Checklist:**
  - [ ] Dashboard + quick actions
  - [ ] Employees (directory, details, quick assign, notes if in design)
  - [ ] Attendance (read-only, CSV)
  - [ ] Tasks (create, edit, progress review)
  - [ ] Leave (review, approve, reject, safeguards)
  - [ ] Announcements (draft, publish, edit, attachments)

### Phase 7 — Cross-role workflows and live database integration

- **Objective:** verify end-to-end flows between roles on the real Supabase project.
- **Tasks:**
  1. Workflows: manager assigns task → employee sees it → updates progress → manager sees history; employee files leave → manager approves → balance + attendance update → employee sees decision; manager publishes announcement → employee sees it; draft never visible.
  2. Import real attendance (if available) via `scripts/import-attendance.ts`.
  3. Remove/segregate seed data from production; verify no `source='seed'` rows remotely.
  4. Audit log review for every critical action.
- **Dependencies:** Phases 5 and 6.
- **Acceptance criteria:** all flows pass with the two real accounts in the real project.
- **Testing:** scripted E2E against staging (or Supabase branch), manual run with real accounts.
- **Deliverable:** integrated system.
- **Checklist:**
  - [ ] Task loop
  - [ ] Leave loop incl. balances
  - [ ] Announcement loop
  - [ ] Attendance import
  - [ ] Seed/live separation verified
  - [ ] Audit logs present

### Phase 8 — Testing, security verification, and Figma visual refinement

- **Objective:** close quality, security, and visual gaps.
- **Tasks:** full test suite (§16), security review (§10.3), Playwright screenshots at Figma frame sizes compared with `design/reference/*` (pixel-diff with tolerance), fix spacing/typography deviations, accessibility pass (keyboard, focus, contrast, labels).
- **Dependencies:** Phase 7.
- **Acceptance criteria:** all tests green; no high/critical security findings; every frame reviewed side by side with documented remaining deviations (target: none visible at 100% zoom).
- **Deliverable:** QA report `design/VISUAL-QA.md` + test results.
- **Checklist:**
  - [ ] Unit / pgTAP / E2E green
  - [ ] Security checklist complete
  - [ ] Visual QA per frame
  - [ ] Accessibility pass
  - [ ] Error/empty/loading states verified

### Phase 9 — Production readiness and deployment

- **Objective:** ship.
- **Tasks:** production env vars, Supabase production config review (auth URLs, SMTP, rate limits, backups/PITR as plan allows), security headers/CSP, read `docs/01-app/02-guides/production-checklist.md` and deploying guides, deploy (host TBD — Vercel assumed), smoke test, final provisioning of real accounts, owner handover doc (provisioning, attendance import, adding employees).
- **Dependencies:** Phase 8.
- **Acceptance criteria:** Launch checklist (§19) complete.
- **Deliverable:** live application + runbook.
- **Checklist:** see §19.

---

## 16. Testing Strategy

### 16.1 Static and build
- `npm run lint` (ESLint 9 + eslint-config-next), `npm run typecheck` (`tsc --noEmit`), `npm run build` — required on every phase.

### 16.2 Unit (Vitest)
- `count_working_days` client mirror (weekends, holidays, single day, cross-month, cross-year).
- Zod schemas (password policy, username, leave dates, task fields).
- `parseListParams` (sort whitelist, page clamps).
- CSV serializer (quotes, commas, newlines, injection prefixes).

### 16.3 Database (pgTAP via `supabase test db`)
- For each table: employee A cannot select/insert/update employee B's rows; manager of dept X cannot see dept Y; anon sees nothing.
- Employee cannot update `tasks` directly; RPC rejects tasks not assigned to caller.
- `decide_leave_request`: second decision fails (`already_decided`); manager cannot decide own request; insufficient balance blocks approval; balance increments exactly once.
- Exclusion constraint rejects overlapping active leave.
- Draft announcements invisible to employees; published visible only to the same department.
- Storage: cross-employee path read/write denied; announcement attachment hidden until published.
- `role`, `department_id`, `employee_code`, `email` not updatable by `authenticated`.

### 16.4 End-to-end (Playwright, local Supabase + Mailpit)
- Activation: valid, invalid pair, already active → login, expired link.
- Setup: validation errors, username taken, success redirect per role.
- Login: success, invalid, remember-workstation cookie type, logout.
- Recovery: request, reset, expired link.
- Role access: employee hitting `/manager/*` → redirect; direct Server Action call with wrong role → rejected.
- Employee: task update, leave with attachment, CSV export content, profile edit, password change.
- Manager: assign task, approve/reject leave (incl. concurrent double-click), publish announcement, attendance filters + CSV.

### 16.5 Visual and responsive
- Playwright screenshots at each Figma frame size compared with `design/reference` exports (tolerance documented).
- Viewports: 1512, 1440, 1280, 1024, 768, 375.

### 16.6 States
- For each list: empty, loading (throttled network), error (simulated RPC failure), long text overflow, 1,000-row pagination.

### 16.7 Security checks
- Account isolation, unauthorized department access, signed URL expiry, file type spoofing (extension vs MIME), oversized uploads, `next` open-redirect, CSV injection, Server Action input tampering, secret key absent from client bundle (`grep` build output).

---

## 17. Assumptions and Open Questions

### 17.1 Assumptions (default if not answered)

| # | Assumption |
|---|---|
| A1 | Figma desktop frames are 1440 or 1512 wide; `auth-bg.png` is the auth background |
| A2 | One department initially; Danica manages it; Margaret reports to Danica |
| A3 | Login by company email; username is display/handle only |
| A4 | Time zone `Asia/Manila`; work week Mon–Fri |
| A5 | Attendance is imported, read-only in UI for both roles; no clock-in button unless in Figma |
| A6 | Leave duration counts working days (Mon–Fri minus holidays); full days only |
| A7 | Leave balances per type per calendar year, seeded at provisioning |
| A8 | Task statuses: To Do, In Progress, Completed; priorities Low/Medium/High |
| A9 | Announcements are department-scoped only (no company-wide) |
| A10 | Slack/Calendar/email indicators are reference-only |
| A11 | No dark mode |
| A12 | Deployment target Vercel; Supabase hosted |
| A13 | Supabase-hosted project already exists and is the one connected to the MCP plugin (to confirm, not queried) |

### 17.2 Open questions (owner must answer in Phase 0)

1. **Figma access** — share the file or export frames (blocker for visual accuracy).
2. Department name/code, employee code format, and the employee codes for both real accounts.
3. Custom SMTP for invite/reset emails (required for real activation emails).
4. Attendance source: is there a timekeeping export? Should the app include clock-in/out? Should absences be auto-generated nightly?
5. Leave types, annual entitlements, carry-over, half-day support, backdating rules for sick leave, when documents are mandatory.
6. Philippine public holidays list source (manual table maintained by owner?).
7. Exact editable profile fields for employees and managers.
8. Should managers edit employee work info, and is "Add Department Note" in the design?
9. Announcement categories, pinning, rich text, and whether "audience reach" means headcount or read receipts.
10. Can employees cancel pending leave? Can managers delete/archive tasks and announcements?
11. Do managers have their own "My Profile", attendance, and leave (and who approves a manager's leave)?
12. Approval of new dependencies: `zod`, `vitest`, `@playwright/test`.
13. Deployment host and production domain.

---

## 18. Definition of Done

A feature/phase is done only when:

- [ ] Matches its Figma frame(s) side by side (layout, spacing, type, colors, states); deviations documented.
- [ ] All interactive elements perform real operations (no static placeholders presented as functional).
- [ ] Data comes from Supabase under RLS; no hardcoded records outside labelled seed.
- [ ] Server-side validation + auth/role checks in every action and route handler.
- [ ] Loading, empty, error, and success states implemented.
- [ ] Unit/pgTAP/E2E tests for the feature pass; lint, typecheck, build pass.
- [ ] Responsive at 1440/1024/768/375.
- [ ] Keyboard accessible, labelled inputs, visible focus.
- [ ] No secrets in client bundle; no new Supabase advisor warnings.
- [ ] `PLAN.md` updated if a decision changed.

---

## 19. Final Launch Checklist

- [ ] All 9 phases' checklists complete
- [ ] Production migrations applied; `supabase migration list` matches repo
- [ ] RLS enabled on every table; advisors clean
- [ ] Storage buckets private with correct limits and policies
- [ ] Auth: signup disabled, redirect URLs set, custom SMTP verified, templates use `token_hash`, password policy set, leaked-password protection on (if available)
- [ ] Env vars set in hosting; `SUPABASE_SECRET_KEY` server-only; not in client bundle
- [ ] Both real accounts provisioned; activation emails received; both completed setup and logged in
- [ ] No seed data in production
- [ ] Real attendance imported (or documented as pending)
- [ ] Leave balances set for current year
- [ ] Security headers/CSP active; HTTPS only
- [ ] Backups / PITR configured per Supabase plan
- [ ] Error monitoring approach decided (Vercel/Supabase logs at minimum)
- [ ] Visual QA report signed off by owner
- [ ] Runbook delivered: adding employees, importing attendance, resetting a locked account, adding holidays
