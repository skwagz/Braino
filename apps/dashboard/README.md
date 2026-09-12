# Braino dashboard

React + TypeScript + Vite landing page and workspace.

- `/`: landing page and Google Drive connection entry.
- `/app`: session-aware workspace using the current backend's stored run API.
- `/app?demo=1`: isolated interactive sample with no Drive writes or model calls.
- `/app?example=wiki`: the existing generated sample wiki.

Chrome extension distribution is planned; there is no store installation link yet.
Live wiki publication is not implemented. The server workspace shows actual file
organization only, with immutable destinations and explicit review before moving.

## Run

Build and serve the complete app from the repository root (demo backend by default):

```sh
npm --prefix apps/dashboard run build
npm start
```

Open http://127.0.0.1:43821. The same origin serves the landing, workspace,
session API and Google callbacks. For Google connection, configure live mode and
credentials using `docs/deployment.md`; the redirect is `<BRAINO_BASE_URL>/oauth/callback`.
Missing configuration is reported without pretending demo data is connected Drive.

For frontend development, start the backend separately, then run Vite on port 5173.
Vite proxies `/api`, `/auth`, and `/oauth` to port 43821 (override with
`BRAINO_API_TARGET`). Its development proxy translates only the expected local
Vite Origin; production runs on one origin. Browser tests start their own isolated
demo backend on 43822 and Vite on 5173; both ports must be free.

Use the built app at `BRAINO_BASE_URL` for real Google login, including during
development. Google returns there after consent. Use `127.0.0.1` consistently:
mixing localhost and 127.0.0.1 loses the browser's host-scoped session cookie.

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

## Service boundaries

`connection.ts` bootstraps `/api/status`, establishes the session cookie, and
starts `/auth/google/start`. Google returns to `/app` after successful login.
`server-api.ts` adapts `/api/folders` and `/api/runs` to the dashboard. POSTs use
the current CSRF token. Apply retries check the same stored run before issuing
another apply; arbitrary client plans are never submitted. Folder counts are
unknown before scanning and are labeled accordingly. Completed runs survive reloads.

The original proposed HTTP contract below remains available via `BRAINO_CONFIG`
for a separate integration, but is not the current backend's API.

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
