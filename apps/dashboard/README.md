# Braino dashboard

Isolated UI stub on `codex/ui-dashboard`. React + TypeScript + Vite.
All default content is synthetic. No credentials, live Drive operations, or LLM calls.

## Run

```sh
cd apps/dashboard
npm ci
npm run dev -- --port 5173
npm run build
npm run test:e2e
```

The mock supports folder selection, scan progress, editable destinations, apply confirmation,
file search/details, linked wiki previews, and activity. Mock changes last for the browser
session's module lifetime; refreshing resets the demo. This is deliberately not an OAuth simulation.

## Dan's integration boundary

`src/types.ts` defines the contract. `src/api.ts` is the only service entry point;
the UI does not import or depend on engine code. These endpoints are **proposed**, not
claims about an existing backend. To opt into HTTP mode, define this before main.tsx in index.html:

```html
<script>
  window.BRAINO_CONFIG = { apiBaseUrl: "/api" };
</script>
```

| Method | Endpoint              | Response / input                                                       |
| ------ | --------------------- | ---------------------------------------------------------------------- |
| GET    | /folders              | Folder[]; authorized selectable folders                                |
| POST   | /scans                | `{ folderId }` -> Job                                                  |
| GET    | /jobs/:id             | Job with running/completed/failed status; completed scan includes Plan |
| GET    | /workspaces/:folderId | Workspace or JSON null                                                 |
| POST   | /plans/:id/apply      | `{ version, sources: [{ id, destination }] }` -> Workspace             |

Apply requests include `Idempotency-Key`. Preserve the same result for retries with that key.
The frontend retains the key after network failure and changes it after plan edits.
The HTTP client sends cookies; deploy behind the same origin or configure explicit credentialed
CORS. Authentication, authorization, CSRF protection, response validation, and Drive OAuth belong
to the integration work. No provider keys belong in the frontend.

The backend must validate plan ownership, version/freshness, file IDs, destination paths,
permissions, scan completeness, and duplicate/concurrent runs before writing. The current apply
response is synchronous: if writes need a long-running job, evolve this contract and UI together.
Requests time out after 30 seconds; scan polling is bounded to two minutes.

## Mapping to the documented engine

- Feed `scanAndSort` through the server's Drive/extractor adapters.
- Convert its report into a Plan with source IDs, wiki pages, completeness and warnings.
- Add a restructuring planner: the existing README only describes generated wiki writes,
  while this product also proposes destinations for original files.
- The writer must create folders, apply approved moves, publish wiki pages, and persist activity.
- Save original parents/names for an eventual undo workflow. No undo is claimed in this stub.
- Supply Source.webViewLink for original-source links (HTTPS drive.google.com or docs.google.com).
  Published wiki URLs can be added when the writer's page contract is finalized.
- Search currently filters loaded file names, destinations and descriptions. Semantic search,
  chat, workspace-wide discovery/pagination, incremental refresh, and specialists are future work.

The mock's counts come from its actual fixture arrays. It does not consume the committed
connector report or expose its private document metadata.
