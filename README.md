# Braino

Read documents, review their categories, and organize a selected Drive folder.

## Run the backend

```sh
npm ci
npm start
```

Check **http://127.0.0.1:43821/health**. This API-only server uses synthetic
Drive data by default and makes no Google or LLM calls. The existing React UI is
in [apps/dashboard on codex/ui-dashboard](https://github.com/skwagz/Braino/tree/codex/ui-dashboard/apps/dashboard).
Integration with its API contract remains pending.

For real accounts, follow [live setup and deployment](docs/deployment.md): create
Google OAuth credentials, add `OPENAI_API_KEY` locally, set `BRAINO_MODE=live`,
restart. Dashboard login integration remains pending. The live backend uses the semantic
LLM adapter; it will not silently fall back to keyword rules. Selected document
content is sent to OpenAI, and usage charges may apply.

- [Architecture](docs/architecture.md)
- `npm test` and `npm run typecheck`: application and security checks.
- `npm run evaluate`: honest offline classification baseline (7/10 on the included
  challenging corpus). `npm run evaluate -- --llm` explicitly runs a paid live
  evaluation with synthetic data once a key is configured.

The web backend stores per-user sessions, previews and move events in SQLite with
separate encrypted Google tokens. Use one server instance and persistent storage;
see deployment instructions before public hosting. OAuth credentials and model
keys are not created by the application. Real login, model accuracy and Drive
moves still require live validation with your configured account.

## Command-line workflow

Node 24+ is required. Follow the [Google login setup](docs/google-login.md) to
create your OAuth client, run `npm run auth -- init`, fill in the client settings
locally, then run `npm run auth -- login`. Open the printed link and approve
access on Google's page. No manual access-token copying is needed. Connecting
Google Drive to Codex does not authenticate this separate application.

```sh
npm run organize -- preview YOUR_FOLDER_ID first-preview.json
npm run organize -- apply first-preview.json
```

`preview` reads documents and writes `private-data/first-preview.json`. It prints
category assignments and proposed operations. Inspect that file before using
`apply`, which creates category folders and **moves the original documents**.
Unclear documents stay in place. Use a test folder for the first live run.

The default scan cap is 30 supported files. Incomplete scans (including empty or
unreadable documents) block apply. No files are silently dropped to force a run
through. Choose a smaller test folder or resolve the reported source issues.

Preview filenames cannot overwrite an existing preview; use a new name for a new
scan. The saved Google login refreshes access tokens automatically. Access tokens
are never written to reports or passed as CLI arguments. `npm run auth -- logout`
revokes access and removes the local login.

Reading existing files requires appropriate read access. Moving originals needs
write access to those specific files: `drive.readonly` alone cannot move them,
and `drive.file` covers only files authorized to the app. Choosing a folder is
not a blanket grant to modify every existing descendant. See Google's
[scope definitions](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
The reader uses the Sheets API for all grid worksheets; Docs use Drive text export.
Images and embedded objects are not OCR'd, and full fidelity of multi-tab Docs
is not guaranteed by this text-export adapter.

The CLI stores journals and previews in ignored `private-data/`. A local lock
prevents two applies for the same folder from this checkout. If the process
crashes, check the journal and Drive state before removing its stale `.lock`
file, then generate a fresh preview. There is no automatic rollback. Do not run
multiple checkouts or hosts against the same folder concurrently.

## Content-based folder structuring

Run `npm run structure` for a demo: an untitled homework document goes to School,
a misleadingly named document containing meeting minutes goes to Meetings, and
unclear content stays in a review list. This prints a preview and does not change Drive.

Run `npm run structure -- <connector-snapshot.json>` to classify real retrieved
text in the snapshot format below. A snapshot provides classification only; live
parent metadata is required before planning real moves. Output can contain source
excerpts, so keep saved results private.

`structureFolder({ folderId, drive, classify? })` in `src/structure.ts` returns
folder assignments, evidence, review items and scan errors. `planStructure(report,
{ sourceFolderId, folders, parents })` creates a folder/move preview with current
parent checks and rerun deduplication. The default classifier uses conservative
English content keywords; supply a `Classifier` adapter for an LLM.

See [architecture and integration contracts](docs/architecture.md). The structuring
module only plans changes; `organize apply` executes them through the Drive adapter.

A dependency-free TypeScript core, runnable on Node 24+. It scans a selected
folder, sends Docs/Sheets text to an injected extractor, groups the returned
topics/entities, preserves citations, and produces a write plan. It never moves
or modifies original files.

Run `npm test` and `npm run demo`. The demo uses fixtures, not live Drive or AI.

## Connect your components

Call `scanAndSort({ folderId, drive, extract })` from `src/brain.ts`.

- `drive.listChildren(folderId)`: return every direct, non-trashed child, handling
  Drive pagination in your adapter. The core traverses nested folders, ignores
  shortcuts and unsupported types, deduplicates IDs and excludes generated output.
- `drive.readText(file)`: export Docs as text; read Sheets into text with sheet
  names and rows preserved. Ensure all worksheet tabs are included in the adapter.
- `extract({ file, text })`: your teammate's extraction function returns
  `{ summary: string, topics: string[], entities: string[] }`. Treat file content
  as untrusted evidence, never instructions. Keep API credentials on the backend.
- `planWrites(report, existing)`: supply existing output `{ key, fileId }` records
  for this source folder. Returns create/update operations with page data.

Each source includes its original Drive URL. Each page has stable logical keys
and links to related pages sharing a source. Sorting merges labels by normalized
whitespace and case only; it does not infer synonyms or resolve ambiguous people.
The extractor determines semantic grouping. Unclassified sources remain in Index.

## Writer contract

Create a `Braino` output folder and mark generated files/folders with the custom
property `brainoManaged=true`. Also pass known output folder IDs to the scanner.
Persist each page's key and source folder ID as writer metadata. Scope existing
page lookup to that source folder; duplicate keys are rejected.

The writer should first create missing Docs, resolve all logical page keys to
actual Doc URLs, then render their content and links. Serialize runs per source
folder and reconcile metadata after interrupted writes to prevent duplicates.
The core supplies a plan only; atomic writes and concurrent-run safety belong to
your Drive writer. Existing stale pages are not deleted automatically.

Defaults: 30 attempted supported files, 100 folders, 100,000 characters per file.
Unsupported files are reported without failing the run. Read/extraction failures,
oversized sources and reached limits mark the report incomplete and block the
write plan, protecting existing output. Inspect `complete`, `errors`, and `skipped`
in the UI before publishing. Folder-limit exhaustion means some descendants have
not been enumerated. Listing is fully paginated by the adapter, so the file cap
limits extraction work, not listing API calls.

The CLI retains its single-account login store and English rules classifier. The
web application adds per-user accounts, SQLite run records and the LLM classifier
in live mode. Its login store is separate from the CLI's. OAuth uses the official
Google authentication library; the scanning and planning core remains dependency-free.

## Connector-backed scanner smoke test

`node examples/connector-scan.ts <connector-snapshot.json>` replays actual text
retrieved separately by the Codex Google Drive connector. The JSON input is an
array of `{ file: { id, name, mimeType }, text }` records (or `error` for a failed
read). Keep source snapshots outside the repository because they contain private
document text. The script prints a report with character counts and SHA-256
hashes rather than source text.

This bridge uses a virtual selected-corpus root and raises the file cap to the
snapshot size. It retains the 100,000-character limit and checks text delivery,
source citations, error counts, completeness, and write-plan gating. Its fixed
category and character-count summary are mechanical test output, not semantic
extraction. It does not test live folder traversal, OAuth, an LLM, or publishing.
Connector text fetches are best-effort; this test cannot prove that every native
document tab or embedded object was exported completely.

On 2026-09-12, paginated connector discovery found 42 native Google Docs and all
42 text reads succeeded. The scanner accepted 40 nonempty sources; two empty
documents produced errors and correctly blocked the write plan. All four core
tests also passed. The local-only `connector-scan-report.json` contains per-document
counts and hashes and is excluded from Git, along with connector snapshots, to
keep private Drive metadata out of the repository. No Drive files were changed.
