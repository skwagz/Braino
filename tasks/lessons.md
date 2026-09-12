# Engineering lessons

## 2026-09-12 Marketplace context

- Correction: the user meant Google Workspace Marketplace when asking about a
  marketplace plugin in a Drive discussion, not the host coding tool's marketplace.
- Prevention: infer platform from the project and surrounding conversation; state
  the assumed marketplace before doing platform-specific research.

## 2026-09-12 Shell fallback

- Failure: treated a broken default PowerShell runtime as a general inability to read local files.
- Detection: exec_command reported a missing bundled pwsh.exe; explicit Windows cmd.exe succeeded.
- Prevention: test an available alternative shell with login disabled before asking someone to paste repository files. Use a read-only directory listing as the tripwire.

## 2026-09-12 Existing UI and backend-only scope

- Correction: the user needed backend work; a React dashboard already exists on
  origin/codex/ui-dashboard under apps/dashboard, with all five UI checklist items complete.
- Failure: built a second web/ interface and a different API without first mapping
  the existing dashboard contract and completed work across remote branches.
- Prevention: inspect remote branches, task checklists, and the existing service
  boundary before implementation. Reuse apps/dashboard and target its documented
  folders/scans/jobs/plans/workspaces contract. Treat the new local web/ and
  extension/ as redundant work, not the product UI or a required deliverable.
- Current scope: backend only; retain useful classifier, authentication, persistence,
  and Drive logic, then resolve contract gaps before claiming UI integration complete.

## 2026-09-12 HTTP test fidelity

- Failure: backend session tests failed with Host rejection while the real browser
  workflow passed. Node fetch did not preserve the test's Host override.
- Detection: assert the status response before reading its cookie; it reported
  `Unexpected host` rather than an authentication failure.
- Prevention: use node:http for tests and health checks requiring explicit Host
  headers. Never weaken production Host validation to accommodate a test client.

## 2026-09-12 Test artifacts

- Keep all generated demo databases under ignored private-data. A browser test
  used .braino/ui-check; that directory is now ignored too. Check git status before
  staging to avoid publishing test documents, metadata or credentials.

## 2026-09-12 Account lifecycle concurrency

- Failure: a scan could start while logout awaited revocation, or continue after
  a preflight await using a session that had just been removed.
- Prevention: share account locks between credential changes and runs; revalidate
  the session after asynchronous preflight before enqueuing a job. Keep regression
  tests for both requests initiated during logout and requests already in flight.
