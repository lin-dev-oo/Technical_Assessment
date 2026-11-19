# Submission review — 19 November 2026

The latest version is ready for the agreed local assessment and interview demo. No unresolved submission blocker was found after the corrections below. This is a scoped readiness judgment, not a claim that all possible inputs, browsers or deployment failures have been tested.

## Alignment with the brief

| Requirement | Current implementation and evidence |
| --- | --- |
| React/TypeScript and Node backend | React/TypeScript, Express/TypeScript and PostgreSQL; production TypeScript/Vite build passes. |
| Supplied CSV and persistence | Original data.csv retained; sample imports, repeated imports, database reconnection and accepted-data persistence are covered. |
| Upload progress and validation | Actual XHR byte progress, separate processing feedback, structured diagnostics, whole-file validation and atomic writes. Parser/API tests cover malformed quoting, UTF-8, headers, duplicate IDs, required fields and storage/upload bounds. |
| Pagination and responsive search | Stable ID ordering; sizes 10/25/50; whole-dataset literal/case-insensitive search; exact numeric matching; debounce, obsolete-response protection, failed-search feedback and page clamping. Browser/API tests cover these. |
| Duplicate/conflict detection and diff UI | Conflicting browser files are staged atomically. Whole-version comparison, changed fields, navigation and explicit batch application/rejection match the latest confirmed scope. The retired upload route returns 404; stored historical alternatives remain recoverable. |
| Two-session editing and real-time updates | Version-checked saves/resolutions, preserved stale drafts, required current/mine decision, post-commit invalidations, heartbeat recovery and presence. Browser tests cover concurrent edits, uploads, resolutions and propagation deadlines. |
| Docker Compose | App and PostgreSQL services, healthy database dependency, named volume, automatic schema initialization and production assets/API/WebSockets served by one app. No additional service is required for the new imports. |
| Setup/demo documentation | Original brief preserved; setup and two-session walkthrough supplied. The single atomic upload protocol and stored-conflict recovery are documented. |

The newest approved behavior deliberately keeps conflicting uploads private until Apply upload. A second session sees committed changes, not another browser's unconfirmed file. Explain this interpretation during the demo, since the original brief's real-time diff wording could otherwise suggest a shared pending-upload viewer. Earlier persistent-proposal decisions in the specification are superseded by its latest section.

## Spec review

Found and fixed one confirmed defect: an uploaded version matching an existing legacy alternative appeared twice in the staged comparison. Value-based deduplication now represents it once; an API regression verifies applying it and closing the reviewed alternatives.

Also tightened the stale-Apply path: when the server discovers all conflicts disappeared, the client now displays the refreshed Apply confirmation rather than automatically sending another commit. A deterministic browser regression changes accepted data at the commit boundary and verifies that new rows remain unsaved until a second explicit Apply.

Setup/design/demo prose contained obsolete persistent-proposal descriptions. Updated the evaluator-facing workflow and documented /api/imports. Historical verification entries retain their original context.

## Standards review

No hard documented coding-standard violations found. Both earlier maintenance concerns are addressed: the obsolete /api/uploads implementation is removed, leaving one upload intake/retry path, and useImportWorkflow now owns transfer, retry identity, staging, choice navigation, live review recovery and dialogs. App composes it through four controls rather than managing its internal state. Existing stored-conflict recovery remains supported.

## Test completeness

The current suites pass: **4 parser tests, 27 public API/PostgreSQL/WebSocket tests and 37 Chromium tests**. Individual parser tests contain multiple invalid-input assertions, so four test names do not mean four input cases. Tests exercise rollback, controlled concurrency, idempotency, identity reuse, stale edits, competing resolutions, new-ID collisions, batch rejection, missed pushes and presence expiry. The latest atomic imports and required stale-save decisions have direct coverage.

Added two submission-focused regressions: staged atomic requests survive a fresh server and database connection and remain safe to apply/reject; a browser loses a successful commit response, deliberately retries the identical request, receives the original outcome and leaves a later accepted edit untouched. The latter suppresses background import refreshes during the simulated outage so it specifically exercises manual commit replay.

Coverage is substantial but not exhaustive. Prioritize these additions after submission preparation:

1. Open socket that stops acknowledging heartbeats, proving HTTP fallback; missed changed/presence frames and reconnect are covered.
2. A further accepted edit while the required stale-save dialog is already open.
3. Successful exact 5 MiB and 10,000-record boundaries; over-limit rejection and numeric storage boundaries are covered.
4. Firefox/WebKit and formal accessibility checks; present browser evidence is Chromium plus desktop/narrow screenshots and keyboard assertions.

## Docker and remaining weaknesses

Compose is complete for the assessment. Configuration, latest image build, app recreation and health all passed. Accepted total stayed 501 and the first-page snapshot was identical. This pass preserved the existing database; clean-volume/full lifecycle evidence is historical in verification.md.

- Add an app healthcheck and restart policy for stronger recovery. Database readiness currently gates initial startup; automatic recovery after arbitrary infrastructure failures is limited.
- Run the container as an unprivileged user, reduce runtime dependencies/image size and exclude Playwright output from the build context. Current packaging is functional but optimized for simplicity.
- Upload-request metadata has no retention policy. Abandoned staged files and stored outcomes can accumulate; cleanup must preserve the documented retry window.
- Dataset-wide write serialization is intentionally simple and correct for the demo, but limits throughput. Literal substring searches and repeated review preparation also warrant profiling before substantially larger workloads.
- There is no login, authorization, distributed fanout or durable browser draft recovery. These are approved scope boundaries, but make this a local assessment application rather than a public multi-tenant deployment.
- Keep the simultaneous-upload explanation precise: the first committed new ID wins initial acceptance; the other file requires explicit review. No automatic overwrite occurs.

Review totals: **Standards: 0 hard violations; 2 earlier maintenance concerns addressed. Spec: 1 confirmed defect fixed, plus stale-Apply hardening and documentation corrections.** No unresolved critical/high-severity defect was established by this review.
