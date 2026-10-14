# EMS-Dani stabilization report

October 14, 2026. Local fixes and available checks complete; authenticated browser and full live account lifecycle verification remain pending. No remote changes, emails, credentials, migrations, commits or pushes occurred.

## Bugs found and fixed

1. Existing dev logs repeatedly showed the unstable Date.now prerender diagnostic on setup and manager routes. The shared call chain is SetupGate/protected query -> requireUser/requireRole -> getSessionUser -> Supabase getClaims -> session loading/expiry validation. The installed Auth SDK reads Date.now for expiry. Added await connection() before creating/validating the session in the shared server DAL, keeping auth work out of prerender/prefetch evaluation. Suspense and server guards remain enabled; auth state is never put in a shared persistent cache. A regression test proves expiry validation cannot begin before the request boundary resolves. The original authenticated browser failure still needs owner-session rechecking; no browser was connected.
2. Task status updates/task switching could erase an existing remark. TaskModal now initializes/restores the current remark.
3. Clearing an announcement/leave file left the hidden input value, blocking same-file reselection. Clear actions now reset the input too.
4. Employee directory could preset a manager or inactive employee for task assignment even though the select excluded them. The button, preset, submit and local action now use the active-employee rule.
5. Publishing an existing sample draft only patched a row absent from employee sample lists. Local announcement edits now store a complete row; published drafts appear for employees and reverting to draft hides them. Original fixture data is preserved.
6. Modal/slide-over keyboard focus could leave the dialog. Added Tab/Shift-Tab containment, skipping hidden/disabled controls, with existing Escape, backdrop close and focus restoration retained.

## Files modified in this phase

- lib/auth/dal.ts; lib/auth/auth.test.mjs.
- components/manager/task-modal.tsx; announcement-modal.tsx; views/employees-view.tsx.
- components/employee/ui.tsx; views/leave-view.tsx.
- lib/manager/actions.ts; new lib/ui/dialog-focus.ts.
- tests/portal-actions.test.mjs; http-smoke.mjs; new dialog-focus.test.mjs.
- This report.

## Authentication and account status

Read-only database inspection: EMS-0001 remains department_manager, active, email-verified and onboarded. EMS-0002 remains employee, provisioned, unverified and not onboarded. No state was artificially completed. Database role/status checks remain authoritative; Auth metadata cannot override them. Service credentials stay server-only. Root/entry routing, callback token handling, password validation, setup retry, cookie/session options, disabled-user refusal and both role boundaries are covered by mocked tests. Live email delivery, employee onboarding, password login, refresh, logout and recovery were not newly exercised with real accounts.

## Employee and Manager portals

All twelve development sample screens rendered with main content and no detected framework error markers or database placeholders. All twelve actual protected routes reject unauthenticated requests. Source review covered demo controls, searches, filters, tabs, pagination, CSV outputs, forms and panels. Local action tests prove temporary state updates and absence of a Supabase HR write/upload boundary. No visual redesign was performed. Actual authenticated portal rendering and mouse/keyboard interactions remain unverified in a browser.

## Executed verification

- npx tsc --noEmit: pass.
- npx eslint .: pass.
- npm run build: pass.
- node --test lib/auth/auth.test.mjs tests/*.test.mjs: 41 passed, zero failures.
- node tests/http-smoke.mjs http://localhost:3000: 31 development checks passed.
- node tests/http-smoke.mjs http://localhost:3002 --production: 31 production checks passed; previews return 404.
- node supabase/tests/auth-only-postgres.mjs: fresh and historical-four schema simulations pass. No remote SQL applied.
- Both logo.png and auth-bg.png return PNG content successfully.
- Production client artifact scan: zero files contain the configured server secret key; no key was printed.

HTTP checks verify redirects, forms/main content and absence of selected rendering-error text, not full UI functionality. Interaction regressions are mocked tests, not real browser clicks. Existing dev server on port 3000 was reused; temporary production test server was stopped.

## Browser and Figma limitations / manual steps

Browser tooling returned an empty browser inventory. Therefore browser console/hydration checks, actual authenticated setup/portal navigation, screenshots, 1366x768/1440x900/mobile layout inspection and Figma comparison could not be completed. No pixel-perfect claim is made.

Connect the existing logged-in browser and revisit /setup plus all twelve protected routes, especially manager pages that previously reported the clock error. Check keyboard containment, same-file reselection, remark preservation, valid assignees and published drafts. Complete employee activation/setup and both accounts' login/session/logout/recovery with owner-entered passwords. Real email/account-changing tests need explicit approval first. Preserve current SMTP/templates; this phase changes none.
