# Braino — Handoff Brief

Hackathon project (AI Tinkerers Valencia). This is a from-scratch brief for continuing the build — no prior context assumed.

## Judging criteria this is built against

1. **Core Requirements & Functionality** — a working agent inside a place where people already work, talk, or live, with the core workflow running end to end.
2. **Technical Execution & Integration** — code, architecture, reliability, tool use, data handling, depth of integration with the chosen environment.
3. **Innovation & Theme Alignment** — a compelling new place or interaction for agents, where the environment materially improves what the agent can do.
4. **Usefulness & Agentic Experience** — clear value for its users; intuitive, effective, and appropriate for where it operates.

Keep every scope decision below traceable back to one of these four.

## Accepted delivery direction (2026-09-12)

Ship Braino as a web app and Chrome extension. The web landing page is the front
door for Google Drive connection and opening the working dashboard. A Google
Workspace Marketplace add-on is not the current distribution plan. Reuse the
existing React dashboard and backend; the extension will be another entry point
to the same service. Extension implementation/store publication is a follow-up.
Keep sample exploration explicit and separate from an authenticated Drive session.
The landing page must not imply wiki publication or a published extension exists
before those integrations are complete. This decision supersedes the historical
extension-only interface and extension-managed authentication described below.

## Wiki implementation priority

Accepted priority (2026-09-12): one selected folder -> source-backed wiki ->
validation -> published Google Docs -> rerun without duplicates. Keep the current
dashboard shell; defer additional UI, specialist agents, and folder-moving work
while this workflow is completed. The older extension-first build order below is
historical context, not the immediate implementation priority.

Build evidence-backed extraction and deterministic page rendering first, then
connect an AI provider and a durable Google Docs publisher. Track source hashes,
generation versions and stable page identities. An unchanged run should produce
no writes; incomplete or invalid scans must not replace the last valid wiki.
Validate source references and links mechanically, while treating semantic
accuracy as a separate evaluation requirement. Publishing must protect source
permissions and human edits, and reconcile interrupted writes before retrying.

## The idea

An agent that installs into a workspace the user already has — their Google Drive — connects to the data that's already there, and turns an unstructured pile of Docs/Sheets into a **connected, navigable knowledge base**: an index page plus linked entity/topic pages, written back natively into Drive (real Docs, real hyperlinks between them). One button triggers the whole run. The output then doubles as a context base other AI tools can use.

This mirrors a workflow the founder already does by hand for personal knowledge management (a structured wiki of linked pages, an index, a log) — Braino automates that discipline for someone else's messy files.

## ICP and problem (for the pitch, and to keep scope honest)

**ICP:** early-stage founders / small teams (2–15 people) who live in Google Workspace and are actively adopting AI tools, but have no data hygiene — docs scattered with no tags, no links, no source of truth.

**Problem in their words:** "I have 200 docs across Drive and no idea which of these is even current." Every AI tool they plug in (Claude Projects, a custom GPT, Notion AI) gives bad answers because retrieval over an untagged, unlinked pile is retrieval over noise.

**Job to be done:** not "organize my files" (nobody pays for tidiness) but **"make my existing files usable as context for the AI tools I'm already adopting."**

**Why this ICP:** no procurement friction (one user, one OAuth grant, one folder — self-serve, no IT review), timely (they're mid-adoption of agentic AI right now), and the founder is this user (Sivraj is the existence proof this pain and this manual workflow are real).

**Demo-winning moment:** not the reorganization itself — it's a follow-up chat box ("ask your workspace something") answering a real question about the user's own content correctly, with a citation back to the source Doc. That's the ICP's actual job getting done live, not just described.

## Product shape

**Chrome extension that overlays drive.google.com** (content script injects a "Braino" button/panel onto the real Drive folder view), backed by a small server that does the actual work (OAuth token exchange, Drive API calls, LLM extraction, Doc creation).

Why this shape over the alternatives considered:
- A standalone web app (OAuth + Drive Picker on its own site) is faster to build but reads as "an app that reaches into Drive," not "an agent installed in Drive" — weaker on criterion 1 and 3.
- A native Google Workspace Add-on (Apps Script + CardService) is the most "official" long-term integration path, but CardService UI is limited to cards/buttons (no real chat UI) and Apps Script's runtime/quota model is its own thing to learn — too much overhead for the demo payoff.
- The extension reuses ~all the backend work either way; it only changes the front-end shell, and it's the version where judges watch a button appear on the *real* drive.google.com they use daily, then watch it reorganize a real folder in place.

Auth: `chrome.identity.getAuthToken` for the OAuth flow. Scopes: `drive.readonly` (read arbitrary existing files in the picked folder) + `drive.file` (create/update the Braino output). Both are sensitive scopes — Google will show an "unverified app" warning during OAuth. **Add your own account (and anyone else demoing) as a test user on the OAuth consent screen in Google Cloud Console before demo day, not during.**

## End-to-end flow

1. **Connect** — user clicks the Braino button injected into drive.google.com → OAuth consent → picks one folder (Drive Picker widget, scoped to that folder, not the whole Drive).
2. **Scan** — recursively list files in that folder. v1 handles **Google Docs and Sheets only** (export as text/CSV via the Drive export API); everything else (Slides, PDFs, images) is listed as "not yet processed," not silently dropped. Cap the scan (e.g. first 30 files) so a live demo has a predictable runtime.
3. **Extract** — one LLM pass per doc: summary, entities (people/projects/dates/topics), and candidate links to other already-scanned docs.
4. **Structure** — write output back as real Google Docs inside a new `Braino/` subfolder of the same folder: one Index Doc linking out to one Doc per entity/topic, using actual Drive hyperlinks. This is what makes the knowledge base live natively in Drive (inherits the folder's sharing permissions automatically, stays Drive-searchable after the demo) instead of living in an opaque separate database.
5. **Present** — back in the extension UI: link to open the Index Doc, list of what got created, and the "ask your workspace something" chat box answering from the structured docs with a citation to the source file.
6. **Re-run safety** — running it again on the same folder must update the existing `Braino/` output, not duplicate it. Check for the Index Doc by a marker (name or a custom file property) before creating a new one.

## Explicit scope cuts (don't relitigate these mid-build)

- Google Docs + Sheets only. No Slides, PDFs, or images in v1.
- One folder per run, not recursive across shared drives, not "the whole Drive."
- Cap file count for the demo run.
- Prep a seed demo folder ahead of time (realistic but non-sensitive docs) rather than live-scanning someone's actual messy Drive on stage. A live real-Drive demo is a stretch goal, not the fallback plan.

## Build order (do this first)

Google OAuth + Picker + "list files in the picked folder" is the highest-risk, most boring piece everything else depends on. Get that working end to end — even if it just prints file names to the console — before writing any extraction or doc-generation logic. Confirm the `drive.readonly` + `drive.file` scope combination actually works with the Picker flow early; scope mismatches here are the kind of thing that eats a whole afternoon if found late.

## Open decisions for whoever picks this up

- Which LLM/API to call for the extraction pass, and where the API key lives (extension can't hold a secret key client-side — this has to go through the backend server).
- Exact copy/branding on the injected button and panel.
- Whether the chat box is a stretch goal cut if time runs short, or the thing to protect above all else (per "demo-winning moment" above, it should be protected — if something has to be cut, cut PDF/Slides support or the recursive-folder handling, not this).
- Whether output Docs need any visual formatting (headings, a simple table of contents) or plain linked text is enough for the demo.
