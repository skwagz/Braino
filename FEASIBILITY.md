# Braino feasibility assessment

**Status update after the initial audit:** newer backend work is now present in the shared checkout at merge commit `3537375`. The source tree includes the scanner, Drive adapter, organization workflow and local Google authentication. Before publishing this report, all 29 core tests and backend typecheck were rerun and passed. The building task, “Connect to Braino repo,” also reports a passing dashboard build after that merge. The implementation inventory and zero-test result below describe the earlier checkout and are superseded for those areas. Recheck current code before using any implementation-gap claim. The current user-directed priority in the building task is repeatable, valid wiki creation; research recommendations below remain proposals unless adopted explicitly.

**Verdict: proceed with a focused demo and customer validation. Technical feasibility is strong; a differentiated, repeatable business remains unproven.** Braino can turn selected Drive documents into linked pages. Its harder challenge is making those pages demonstrably useful, accurate, current, and safe to share when Google already offers substantial overlapping functionality.

This assessment covers the local repository and primary sources checked on September 12, 2026. Vendor documentation establishes advertised capabilities and constraints, not comparative product quality. Cost scenarios and validation thresholds below are explicit planning assumptions, not observed Braino performance.

**The proposed promise:** Braino maintains a source-linked account of a team's projects, decisions, and unresolved questions inside Google Drive, making it easier for people and AI tools to use that knowledge.

**The critical experiment:** can this maintained context improve a real team's work enough that they prefer and pay for it over using their existing tools directly?

**What exists today**

| Area | Repository evidence | Assessment |
| --- | --- | --- |
| Product definition | `HANDOFF.md` | Clear hackathon brief: one folder, Docs/Sheets, generated linked Docs, cited questions, safe reruns. |
| Dashboard | `apps/dashboard/src/main.tsx`, `api.ts`, `types.ts` | Implemented React interface with synthetic folders, scan progress, editable destinations, wiki previews and activity. |
| Real integrations | Dashboard README and HTTP adapter | Proposed endpoints only. No backend, OAuth, live Drive writer, LLM extraction or question-answering implementation found. |
| Scanner | Root README and package scripts | Referenced `src/`, `test/` and `examples/` are absent. Documentation is not executable evidence of this core. |
| Connector experiment | Root README and tracked scan report | Historical text-ingestion evidence; does not demonstrate live folder traversal, semantic extraction, publishing or end-to-end operation. |
| Repeated use | In-memory mock maps | Refresh resets mock state. No persistent jobs, incremental refresh or durable retry guarantees implemented. |

The checkout contains two competing product directions. The handoff and root README preserve original files and create a wiki. The dashboard describes moving originals into destination folders. Those moves add permission, recovery and user-trust requirements, and the stated read-only access to arbitrary originals does not authorize them. **For the existing hackathon scope, finish the linked-wiki workflow first.** Treat file reorganization as a separate, later product decision.

The Chrome extension described in the handoff is also absent. A standalone dashboard does not yet demonstrate an agent operating inside Drive. Keep the extension a thin interface to durable server jobs; Chrome documents service-worker termination conditions, making background in-memory state a poor foundation for long scans. [Chrome lifecycle documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

**Competition and the business case**

| Alternative | Evidence | Consequence for Braino |
| --- | --- | --- |
| Gemini in Drive | Google documents questions across files/folders, direct source citations, saved projects and document generation. | A folder chat with citations provides limited differentiation on its own. |
| NotebookLM | Google announced automatic Drive-source syncing on May 26, 2026, including handling deletions and revoked access. | Automatic freshness alone is also insufficient differentiation. |
| Glean | Its documentation describes permission-aware retrieval and human document verification; the verification page is archived. | Trusted knowledge is an established category, not an uncontested invention. Current feature packaging needs validation. |
| Existing team practices | The handoff describes the founder's manual linked-wiki workflow. | Useful evidence of one person's need, but no evidence yet of repeatable demand or willingness to pay. |

Sources: [Gemini in Drive help](https://support.google.com/drive/answer/16963068?hl=en), [NotebookLM syncing announcement](https://workspaceupdates.googleblog.com/2026/05/keep-your-sources-up-to-date-with-automatic-Drive-syncing-in-NotebookLM.html), [Glean information access](https://docs.glean.com/user-guide/assistant/how-glean-accesses-info), [Glean verification documentation, archived](https://docs.glean.com/archive/help-glean/verifying-documents/how-verification-works).

The strongest plausible opening is a narrow recurring workflow: a small team preparing project handoffs, onboarding someone, or reconciling decisions before its weekly review. These situations supply concrete questions, identifiable reviewers and a measurable cost of missing information. This is a customer-selection hypothesis; no interviews or paid pilots establish it yet.

Braino could stand out through editable, portable knowledge pages with claim-level evidence, explicit unresolved conflicts and lightweight owner confirmation. No reviewed evidence establishes that competitors lack every component. The opportunity would be delivering this combination with lower setup and maintenance effort for a particular customer group.

The handoff's statement that AI gives bad answers because documents lack tags or links is too strong. Errors can also come from missing evidence, obsolete sources, ambiguous names, retrieval failures or reasoning mistakes. Adding a wiki might help navigation and synthesis, but summaries can also discard important details. Microsoft's GraphRAG documentation supports structured retrieval for some cross-document and broad synthesis questions; it does not establish that Braino's proposed wiki improves every question. [GraphRAG documentation](https://microsoft.github.io/graphrag/).

**What needs to work technically**

1. **Authorization and selection.** Correct the handoff: `drive.readonly` is restricted, while `drive.file` is non-sensitive. Selecting a folder in the interface does not narrow the broad read-only OAuth grant. Google describes `drive.file` as per-file access; do not assume selecting a folder grants recursive access to every existing child. Prove that behavior with the intended consent flow before designing around it. [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

2. **A realistic launch path.** A controlled test-user demo and a public SaaS launch have different requirements. Google provides development/testing and certain other verification exceptions. Public deployment with restricted-scope data transmitted through servers introduces verification/security-assessment work, subject to applicable exceptions. Obtain an assessment of the actual architecture and scope eligibility before promising frictionless public onboarding. This research does not establish a fixed approval timeline or fee. [Restricted-scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

3. **Complete ingestion.** Drive CSV export covers the first worksheet only. Enumerate worksheets and preserve tab names, row/cell locations and numeric context. For a Docs API reader, request `includeTabsContent=true` and traverse child tabs. Record unsupported or missing content explicitly. A successful HTTP response is not proof of complete extraction. [Export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats), [Docs tabs](https://developers.google.com/workspace/docs/api/how-tos/tabs).

4. **Evidence before synthesis.** Retain source IDs, modification/version information and supporting passages or cell ranges. Extract candidate facts before rendering pages. A filename containing “v3” or the latest modification time does not establish authority. When a budget spreadsheet says one amount and meeting notes another, show both and ask the designated owner to resolve the discrepancy.

5. **Permission-safe outputs.** A founder can access a restricted subfolder whose contents colleagues cannot read. A summary written into a broadly shared Braino folder can expose those contents even if the original citation remains inaccessible. Google supports limited-access subfolders, so inheritance alone is insufficient. Start with synthetic demo data; a pilot should publish to a verified common audience or a private destination and explicitly validate sharing. Later permission changes must invalidate affected derived knowledge. [Drive limited access](https://developers.google.com/workspace/drive/api/guides/limited-expansive-access).

6. **Durable publication.** Maintain source-folder and logical-page IDs, create missing Docs, resolve their actual URLs, write contents, then publish the index last. Persist job progress, serialize runs per folder and reconcile interrupted creates before retrying. Updating multiple Docs is not automatically an atomic transaction. Protect human edits through a clear generated-content ownership policy and previews.

7. **Useful answers.** Retrieve original supporting evidence as well as generated summaries. Cite evidence for each material claim; abstain when evidence is absent. Preserve conflicting claims. Treat document instructions as untrusted content, and keep writing operations behind server-side validation rather than allowing extracted prose to dictate tool actions.

8. **Maintenance.** For a pilot, explicit manual refresh can be enough. A recurring product needs to handle edits, deleted/moved sources, permission changes and obsolete pages. Drive exposes a changes feed, but mapping those changes to the selected corpus and invalidating dependent pages is Braino's responsibility. [Drive change retrieval](https://developers.google.com/workspace/drive/api/guides/manage-changes).

A user-owned wiki is a helpful export surface, but hyperlinks alone do not make other AI products traverse or ingest it. Validate one downstream workflow explicitly: provide a compact context document containing the needed facts and source links, then test answers in the chosen tool. Broader interoperability remains a separate integration promise.

**Costs and commercial assumptions**

For illustration, Google's listed Gemini 2.5 Flash standard text rates are $0.30 per million input tokens and $2.50 per million output tokens, including thinking output. This is a cost reference, not a model selection or measured workload. [API pricing](https://ai.google.dev/gemini-api/docs/pricing).

Assume each file uses 4,000 total input tokens and 500 total output tokens for one extraction pass:

| Scenario | Input/output tokens | Extraction-only cost |
| --- | --- | --- |
| 30-file demo | 120,000 / 15,000 | $0.0735 |
| 200-file initial pass | 800,000 / 100,000 | $0.49 |
| 200 files reprocessed daily for 30 days | 24 million / 3 million | $14.70 |

Formula: input tokens / 1,000,000 × input rate + output tokens / 1,000,000 × output rate. Costs exclude extra reasoning beyond the assumption, retries, page synthesis, questions, embeddings, hosting, storage, support and security work. Long files and repeated processing can change economics substantially. Track actual usage and update only changed sources.

At small scale, integration engineering and customer support are likely more consequential than a single extraction pass; that is an analytical judgment, not a measured cost breakdown. A small subscription cannot support extensive manual repair for every customer.

Test payment directly. An initial experiment might offer a fixed-scope onboarding service and an optional $25–$50 monthly workspace refresh plan. Those prices are hypotheses, not market benchmarks. If customers value the initial organization but do not return, a service or one-time purchase may fit better than a subscription.

Recruit initial pilots through the founder's existing community and AI-adopting small teams. Ask for a recent failed handoff or repeated information request, then examine a consented project folder. Measure saved effort, repeat use and actual payment. No market-size claim, acquisition-cost estimate or revenue forecast is supported by the present evidence.

**Smallest convincing demonstration**

Use a prepared, non-sensitive folder containing 10–15 Docs and Sheets, including a multi-tab Sheet and an intentional contradiction. Click Braino inside Drive, show a transparent scan result, create a real linked Index and a few topic pages, and answer a cross-document question with original evidence. Rerun after editing one source and show an updated page without duplication.

Protect this full vertical slice before expanding dashboard features. File moving, whole-Drive scans, more formats and complex graph infrastructure can wait under the existing scope cuts. A cited question and a safe rerun demonstrate considerably more feasibility than additional mock screens.

**Validation and stop conditions**

The following are proposed decision gates, not existing results:

| Question | Experiment | Initial gate |
| --- | --- | --- |
| Does a working integration exist? | One authorized folder, complete read, linked Docs, a cited answer and rerun. | All stages work against live test data; originals remain intact. |
| Does structure improve usefulness? | Have five teams supply questions and expected evidence. Compare direct-source retrieval, Braino-assisted retrieval, and available Google tools over the same corpus. | Material improvement in correctness or at least 30% less task time on the chosen workflow. |
| Are answers trustworthy? | Approximately 50 questions across single-source, cross-source, conflicting, numeric and unanswerable cases. Review answers without revealing which system produced them. | At least 90% fully supported answers; explicit abstention on missing evidence; zero permission leaks in test cases. |
| Is it recurring value? | Four-week pilot with manual refresh initially. | At least three of five teams use it weekly without reminders and accept a paid continuation. |
| Is maintenance economical? | Log compute, latency, corrections and support minutes. | Positive contribution after realistic support cost, with an explicit usage cap. |

These small samples guide iteration; they cannot establish population-level accuracy or security. If Braino matches existing tools while adding setup, permission anxiety or review work, narrow the workflow or stop the broad product effort. If teams repeatedly use its maintained pages and pay, invest in incremental refresh and stronger access controls.

**Repository verification and immediate issues**

The repository inventory confirms a dashboard rather than a complete Drive agent. Current/main history available locally contains no referenced scanner source/test/example paths. Root `npm test` exits successfully with zero tests under Node 25.2.1: it does not verify the scanner. Dashboard `npm run build` passed, and `npm run test:e2e` passed all three tests in 19.2 seconds: desktop flow, mobile flow, and preservation of an idempotency key on a mocked HTTP retry. These tests establish UI behavior, not a real backend integration.

The README calls `connector-scan-report.json` local-only, but Git tracks it. The report contains private Drive metadata; excluding a tracked path in `.gitignore` does not untrack it or remove history. Before publishing the repository, review distribution of this file and replace committed evidence with a synthetic or sufficiently redacted aggregate. No public exposure is established by this audit, and no history rewrite was performed.

**Decision:** finish and measure the source-linked knowledge workflow. Reserve a larger product commitment for evidence of improved outcomes, repeat usage and paid demand. The technology is buildable; trustworthy maintenance and a specific reason to choose Braino are the unresolved product work.
