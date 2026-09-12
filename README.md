# Braino scanning and sorting core

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

No OAuth, Drive API calls, LLM provider, persistence, or UI is implemented here.

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
