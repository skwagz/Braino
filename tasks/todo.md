# UI dashboard

## 2026-09-12 Landing page and web entry

Acceptance: responsive landing at /, real connection entry through existing web
OAuth, dashboard at /app, explicit sample experience, preserved local wiki work.
Chrome extension remains the accepted companion distribution, not a completed release.

- [x] Inspect current UI, authentication and backend contracts.
- [x] Build landing and route the existing dashboard behind it.
- [x] Connect session/OAuth and adapt the existing server run workflow honestly.
- [x] Verify build, desktop/mobile layout, connection states and sample workflow.

Risk: medium, UI entry and authenticated service boundary. Keep OAuth validation,
same-origin sessions and server-owned move plans. Rollback: revert landing/router
and adapter changes; no data migration. Node 24+, React/Vite and current backend.

Results: landing at / and dashboard at /app served by the existing backend.
Explicit /app?demo=1 retains the sample UI. The stored-run adapter sends CSRF,
reconciles apply retries and exposes no fictional published wiki or editable
server destinations. OAuth entry uses /api/status then /auth/google/start; callback
returns /app. Existing local wiki changes were preserved. Chrome remains planned.
Dashboard build, root typecheck, diff checks and all 9 Playwright tests passed.
Desktop (1440) and mobile (390) screenshots visually reviewed; mobile decorative
overflow corrected. Production static routes and asset traversal rejection tested.
Backend sample scanning/apply and persistence after reload verified. No real Google
or LLM request was made: .env is absent. Real OAuth remains unverified until configured.
Local sample preview: http://127.0.0.1:43823. No public deployment or push performed.

## Next: Repeatable, Valid Wiki (2026-09-12)

Acceptance: selected folder -> evidence-backed wiki -> validated preview -> real
Google Docs -> unchanged rerun without duplicates or unnecessary writes.

- [x] Implement and test deterministic evidence-backed wiki artifacts.
- [ ] Integrate AI extraction with validated source evidence and versioned caching.
- [ ] Persist publication identities and reconcile interrupted Google Docs writes.
- [ ] Connect wiki preview/publish to the dashboard service boundary.
- [ ] Verify live synthetic-folder publication, source edits, and unchanged reruns.

First checkpoint: pure compiler and scanner integration; no external writes.
Risk: low for this checkpoint. Publication later requires explicit permission,
human-edit ownership, source-version checks, and failure-recovery tests.

Checkpoint result: src/wiki.ts builds linked Markdown page content and a typed
artifact with source/page hashes and generation version. Exact evidence excerpts
are checked against input text; incomplete/empty scans yield no artifact. Content
diffs distinguish create/update/unchanged. All 32 tests and typecheck pass.
No files published to Drive and no AI provider called. Artifact persistence,
obsolete-page handling, semantic evaluation, and live integration remain open.

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

# 2026-09-12 Backend integration — corrected scope

## User-requested test removal

- [x] Remove all seven backend test files and the obsolete npm test command.
- [x] Remove the test directory from TypeScript inputs and update README commands.
- [x] TypeScript and diff formatting pass. Earlier test results below are historical.

The user clarified that the existing GitHub UI must be reused and this task is
backend-only. The earlier build checklist below is historical, not evidence that
the existing React dashboard is integrated.

## GitHub audit and remaining backend work

Cleanup acceptance: remove duplicate UI, extension, static serving and obsolete
demo instructions; retain backend logic and the remote React dashboard.
Risk: low, no stored data changes. Backend integration remains pending.
- [x] Remove duplicate implementation and update Docker/docs references.
- [x] Verify backend tests, typecheck and container configuration after cleanup:
  all 43 tests pass, TypeScript passes, Docker Compose configuration passes.

- [x] Verify origin/codex/ui-dashboard at 1df140e: all five UI checklist items are checked.
- [x] Read apps/dashboard/README.md, src/api.ts and src/types.ts on that branch.
- [x] Verify origin/main at 7f706e6 already contains scanner, structure planner,
  Drive adapter, organizer and local OAuth implementation.
- [x] Identify duplicate local web/ UI and extension/ launcher; exclude from intended product scope.
- [ ] Adapt backend to the existing /api/folders, /api/scans, /api/jobs/:id,
  /api/plans/:id/apply and /api/workspaces/:folderId contract.
- [ ] Validate editable destinations, plan versions and Idempotency-Key retries
  against server-owned plans; retain ownership, completeness and freshness checks.
- [ ] Resolve workspace/wiki publication gaps without claiming mock wiki pages are live output.
- [ ] Verify existing React dashboard against backend, including authentication/CSRF integration.
- [ ] Complete credential setup and real Google/LLM acceptance testing.

## Earlier build record (superseded scope)

## Goal and acceptance criteria

Connect Google, select a folder, classify documents, review evidence and apply
organization through a browser UI. A clearly labeled synthetic demo must work
without credentials. Live integrations must be wired and independently testable.
User confirms Google OAuth and LLM credentials do not exist yet, so real external
login/model/Drive validation cannot be claimed or executed until configured.

## Checkpoints

- [x] Inspect current core, project instructions and remote UI branch.
- [x] Define frontend/backend contract and delegate independent UI/classifier work.
- [x] Implement backend sessions, isolated run storage, Google connection and folder browsing.
- [x] Implement dashboard and optional extension launcher.
- [x] Implement semantic classifier and evaluation fixtures.
- [x] Wire persistent demo and live scan/preview/apply flows.
- [x] Test authorization, tenant isolation, duplicate apply, restart and failure states.
- [x] Run tests, typecheck and browser demo end to end.
- [x] Document Google/API setup, demo script, deployment and remaining live checks.
- [ ] Configure real credentials and validate Google login, live model calls and Drive moves (blocked: user has not created credentials).
- [ ] Build/run deployment image (blocked: Docker Desktop daemon unavailable); publish after host and HTTPS are configured.

## Risk and rollback

High risk: account authorization, stored tokens, file moves and tenant boundaries.
Demo is default; real moves require explicit apply. Source revision checks and
move journal remain. Roll back by stopping the web server and using the existing
CLI. No destructive schema migrations or original-file deletions. Single server
instance with a persistent volume is the initial deployment boundary.

## Environment and dependencies

Node 24, existing TypeScript and google-auth-library. Backend can use Node SQLite
for durable account/session/run state. Secrets stay local/environment-owned.
Needed for live mode: Google OAuth client, token encryption key, OpenAI API key.
No paid calls or cloud writes will run without the required configuration.

## Working notes

- Existing `origin/codex/ui-dashboard` inspected by frontend agent; no automatic merge.
- UI contract: /api/status, /api/folders, /api/runs, /api/runs/:id/apply,
  /auth/google/start and callback, /api/logout, /api/demo/reset.
- Existing classification remains an explicit demo/rules option, never mislabeled AI.
- Run previews must remain bound to their server-side owner, not accepted from clients.

## Results

43 tests pass, TypeScript checks pass, Compose configuration validates. Desktop
and 390px browser flow verified: choose sample folder, scan 6 documents, inspect
5 categories and 1 review, apply 5 moves, rerun with 0 moves. UI test server was
stopped; primary demo is available on port 43821 while its process remains running.

Offline labeled evaluation: 7/10 correct. This measures only rule limitations;
no LLM quality claim. Live adapter uses strict structured output and exact evidence,
with mock tests for failures and malformed results. No paid API calls or real Drive
writes were made. Docker health Host behavior tested independently; image build
not run because the Docker engine is unavailable. Source/credentials are excluded
from the container build context. Review fixed account logout/preflight races and
added regression tests; nontransactional Drive move limitations remain documented.

## 2026-09-12 Feasibility research

Acceptance: assess the actual repository and current primary sources; distinguish
implemented features, documented plans, assumptions, and unresolved risks; deliver
a concise TL;DR with a cited supporting report.

- [x] Read project brief, guidelines, implementation contracts, and repository inventory.
- [x] Verify implementation and available checks, including missing core files.
- [x] Research competition, Google integration constraints, reliability, and costs.
- [x] Write feasibility report with recommended scope and validation gates.
- [x] Check evidence and prepare TL;DR.

Risk: low; research and documentation only. No external writes or Drive changes.
Environment: Windows cmd.exe works; the configured PowerShell runtime fails.

Results: FEASIBILITY.md contains the assessment, primary-source links, explicit
cost assumptions, scope recommendation and validation gates. Dashboard build and
all three Playwright tests passed. Root npm test ran zero tests; referenced engine
files are absent from available current/main history. Historical connector report
is tracked despite README statements, and proves only an incomplete mechanical
snapshot replay. No private source details are reproduced in the research report.
No implementation changes, Drive writes, commits or history rewrites performed.

Sharing follow-up: published FEASIBILITY.md plus AGENTS.md/README.md references
through https://github.com/skwagz/Braino/pull/1, merged into main. Reran all 29
backend tests and typecheck successfully before publishing. The earlier missing
core finding above is historical and superseded by the backend merge. Current
status is noted at the top of FEASIBILITY.md. UI build work was not included in
the documentation-only PR.
