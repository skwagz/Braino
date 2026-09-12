# UI dashboard

- [x] Inspect shared baseline and create codex/ui-dashboard.
- [x] Define isolated React dashboard with mock/HTTP service boundary.
- [x] Build folder selection, scan, editable plan, workspace, search, and activity.
- [x] Document proposed endpoint contract for backend integration.
- [x] Verify build and browser flows at desktop/mobile sizes.

Acceptance: synthetic demo works end to end without credentials or Drive writes; backend access is centralized; no engine files changed.
Risk: low, isolated mock frontend. Rollback: remove apps/dashboard; shared engine scripts remain unchanged.
Environment: Node, npm; Vite dev server on an available local port.

Results: npm run build passed. Three Playwright tests passed (desktop flow,
mobile layout/flow, HTTP apply retry with stable idempotency key). Desktop and
mobile screenshots visually inspected. Read-only peer review identified retry
and source-link integration gaps; addressed retry behavior and optional source URLs.
No engine test execution possible: the shared baseline lacks its referenced source/tests.
Preview: http://127.0.0.1:5174. Backend endpoints remain proposed and unimplemented.
