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
