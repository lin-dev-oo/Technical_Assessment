# Assessment-demo verification

## Submission review of the latest working version — 19 November 2026

Follow-up test hardening: all **27 API/PostgreSQL/WebSocket tests and 37 Chromium tests** pass; the browser command also passes the production TypeScript/Vite build. New coverage recreates the HTTP app and database pool before applying/rejecting staged imports. A browser regression lets the real server commit, drops that response, then retries the same request and verifies the stored original outcome without duplicate writes or overwriting an intervening edit. These checks use only comments_test; application behavior and deployment configuration are unchanged. The four parser tests were unchanged from the preceding passing run.

Reviewed the original brief, latest confirmed scope, UI direction, complete upload/edit/review/recovery flows, Compose packaging and current test cases. See [submission review](submission-review.md) for requirement mapping, weaknesses and remaining test gaps.

Current checks passed: 4 parser tests, 26 API/PostgreSQL/WebSocket tests, 36 Chromium browser tests, TypeScript/Vite build, Compose configuration validation and Compose image build. The API/browser suites ran sequentially against comments_test. Deliberate database constraint failures exercised rollback and passed their assertions.

Fixed duplicate staged versions when the uploaded values already existed as a legacy alternative. Removed automatic commit retry after a stale Apply response with no remaining conflicts: the refreshed state now requires explicit Apply again. Added API/browser regressions for both. Updated setup/design/demo documentation for the atomic browser protocol and one-second heartbeat.

Recreated only the Compose app with the rebuilt image. The health endpoint returned ok; accepted total remained 501 and the complete first page matched before/after recreation. PostgreSQL and its volume were preserved. This run did not repeat the earlier clean-volume startup or full database-container lifecycle. Inspected freshly generated narrow required-edit comparison, desktop atomic upload review and desktop long-alternative screenshots; controls and full-value access remain visible. Actual transient transfer/processing notifications, native window switching and a formal accessibility audit were not independently inspected in this pass.

The following sections retain historical evidence and counts; this section records the latest assembled run.

Verified on 19 November 2026 for local issue 07. This ticket changes documentation and demo fixtures; application behavior is the implementation through commit `883a33e`. The original assessment in `README.md` and supplied `data.csv` are unchanged.

## Clean Compose startup and persistence

Built from a clean `git archive HEAD` export, without host dependencies, build output, `.env` or existing database files. Docker Desktop's Linux engine (29.6.1) built the Node 22 image with `npm ci` and the production TypeScript/Vite build. A separate Compose project, `assessment07`, created a fresh PostgreSQL named volume. A verification-only overlay mapped host ports 3007/5437 instead of 3000/5433, preserving the existing default application's data and services. No application environment settings changed.

Executed the documented `up --build -d`, `restart app`, `down`, and `up -d` lifecycle with that project and overlay. Both services started, PostgreSQL became healthy, and the app served HTTP and WebSockets. After container recreation, public API snapshots matched the pre-shutdown accepted total (501), complete reviews for #1 and #1001, accepted versions, proposal revisions and pending alternatives. The named volume was retained.

## Assembled suites

| Check | Result |
| --- | --- |
| `npm test` | 4 parser tests passed |
| `npm run test:api` with dedicated PostgreSQL `comments_test` | 16 HTTP/PostgreSQL/WebSocket tests passed |
| `npm run test:browser` with dedicated PostgreSQL `comments_test` | 18 Chromium tests passed (34.8 seconds) |
| `npm run build` | TypeScript and production Vite build passed |
| Compose `run --rm app npm test` | 4 parser tests passed in the clean image |
| Compose `run --rm -e TEST_DATABASE_URL=postgres://comments:comments@db:5432/comments_test app npm run test:api` | 16 tests passed in the clean image |

The host suites ran sequentially against the existing dedicated test database; the container suites used a separate `comments_test` database in the isolated project. Neither suite targeted an application database. Logged check-constraint errors are deliberate rollback/fault-injection cases, with passing assertions. Initial sandbox attempts could not access localhost/Docker (`EACCES`); rerunning with access succeeded. No application failure was inferred from those environmental denials.

## Two-session Compose demo

Two independent Chromium contexts exercised the production Compose app using the actual sample and checked-in demo files:

- `data.csv`: 500 inserted; repeating it: 500 unchanged.
- `invalid-mixed.csv`: rejected with record 3 postId/email/body diagnostics; #1002 was absent afterward.
- Simultaneous `conflicting-a.csv` and `conflicting-b.csv`: each reported one conflict, with accepted #1 plus two distinct alternatives in both reviews.
- Simultaneous `absent-a.csv` and `absent-b.csv`: one inserted #1001 and the other staged one alternative, leaving 501 accepted comments. Either file can win; the observed run accepted B first.
- Pending reviews survived the Compose lifecycle above. Selecting one complete #1 alternative closed the reviewed proposals and refreshed the other open review.
- Both sessions edited #2 concurrently. Saving A's body preserved B's unsaved text, displayed the new accepted body, and disabled B's stale Save pending deliberate reconciliation.
- Body focus showed one temporary session label in the other editor. Leaving the field cleared that label while preserving the draft. Browser-suite checks additionally covered heartbeat expiry, disconnect/reconnect uniqueness and server conflict enforcement.

| Observed production Compose update | Elapsed |
| --- | --- |
| Existing-ID uploads through grouped reviews in both sessions | 148 ms |
| Absent-ID uploads through searchable pending conflict in both sessions | 404 ms |
| Resolution through refresh of the other open review | 286 ms |
| Saved edit through accepted-value comparison beside the other draft | 214 ms |

Measurements start before file selection or Save/Resolve clicks and end after the observer assertions. The absent-ID measurement also includes the search debounce. These local smoke measurements complement the focused suite's shared three-second deadlines and the API suite's controlled write-barrier concurrency checks; they are not a general deployment latency guarantee.

## Visual and interaction inspection

Inspected screenshots from the production Compose demo at 1440px and 390px, including grouped review, pending-version labels, changed fields, preserved stale-draft feedback and active-cell presence. Also inspected its desktop validation rejection. Comparison actions remain visible; narrow tables/comparisons use horizontal scrolling, and stale feedback stays within the narrow viewport. Purple focus/selection, amber differences and dashed session labels remain distinct.

Inspected the current browser suite's long-content review screenshots at 1440px and 390px: long names/emails and multiline/unbroken bodies wrap within comparison columns, selected whole versions remain clear, and footer actions remain reachable. Browser checks passed for keyboard dismissal/focus restoration, labelled controls, retained draft focus and narrow action access. These are functional and visual checks, not a formal accessibility audit.

Transfer and processing finish too quickly locally for separate visual inspection. Native OS window switching was not separately inspected; browser focus movement, disconnect and heartbeat expiry were checked. The new Compose smoke used ordinary sample/derived content; the challenging long-content inspection used the current browser suite's running application. Historical checks are retained separately in [verification-history.md](verification-history.md).

Follow [setup.md](setup.md) and the [two-session walkthrough](demo/README.md) to reproduce the submission.

## Approved usability refinements — 19 November 2026

Applied neutral Dataset/record wording, Search… with an all-fields accessible label, and canonical CSV header labels. Added a separate dataset total, honest refresh/search/error feedback, field-level edit validation, focus restoration, changed-draft navigation warnings, pinned row actions, readable secondary text, filename feedback with dismissible completion banners, and clearer conflict/recovery actions.

Validation after these changes: production TypeScript/Vite build passed; all 4 parser tests, 16 API/PostgreSQL/WebSocket tests and 20 Chromium tests passed. The browser suite adds failed-search/count checks and validation/focus/beforeunload checks. Updated the existing mobile editing checks to explicitly scroll to body while verifying that pinned Save/Cancel remain reachable. Dismissing a beforeunload warning intentionally cancels reload; its test uses a bounded navigation timeout.

Used the dedicated local comments_test database (created because it was absent); no tests ran against the application dataset. Rebuilt and restarted only the local Compose app, preserving its database volume. The running application at localhost:3000 shows Dataset, the unchanged 500-record total, canonical field labels and connected live updates. Inspected current desktop sample, narrow inline editing/action access and narrow long-content conflict-review screenshots. Transfer/processing states and the disabled resolution close icon were checked in code, not separately visually observed.

## Presence and immediate conflict review — 19 November 2026

Research is recorded with official Excel, VS Code and GitHub Desktop sources in [presence-conflict-ui-research.md](presence-conflict-ui-research.md). The presence regression was reproduced with npx playwright test tests/browser/presence.spec.ts -g 'loses focus' (failed once, then failed both repeat-each=2 runs). The window blur handler cleared the selected edit cell while transport and draft remained active. Presence now follows selected editor focus across window/tab switches, with existing field-leave, end-edit, disconnect and heartbeat expiry cleanup retained. The visual change is limited to a slim cell-colored border and attached name tag; the overall app layout is retained.

Upload responses identify their conflicting records and open the viewer immediately, regardless of active search/page. A global resumable conflict list replaces per-row pending badges. Previous/Next navigation preserves revision-bound choices, clears stale choices, and returns to any earlier unresolved records before completing the queue. The viewer has minimal copy, no steps, and Current version / Alternative N labels.

The final production build, 16 API/PostgreSQL tests and 25 browser tests pass. Browser coverage includes upload-triggered review, navigation in both directions, remembered choices, skipped records, stale cached choices, dismissed-review recovery, and existing two-session races/presence/expiry checks. Inspected current desktop/narrow comparison and presence screenshots, including long text. Rebuilt the local Compose app and verified the running 500-record dataset loads with connected updates. No application data was changed for these checks; automated mutations used comments_test. OS-native window switching was not separately automated; the deterministic regression dispatches the actual window blur event consumed by the browser hook.

## Atomic browser imports, Sonner and stale-edit review — 19 November 2026

The latest requirement supersedes the earlier persistent-proposal browser workflow: a conflicting file is held in request metadata, outside accepted rows and legacy alternatives. Per-record Confirm choice is local. Apply upload validates every reviewed revision and the full file snapshot, then applies all rows in one transaction. Close, Escape and Reject upload reject the entire staged file. Tests cover rejection after partial review, included new rows, retry/replay protection, competing commit/reject, newly occupied IDs, stale choices, and injected database rollback. Existing merge endpoints remain compatible for existing API clients and legacy persisted conflicts; the browser uses /api/imports.

Replaced duplicate Search clearing with one accessible in-field icon. Sonner now renders processing/progress, success, validation and transport feedback outside the main table layout. The concurrent-edit flow follows the cited [stale-edit research](stale-edit-ui-research.md): one persistent row action, an on-demand Current version/Your draft comparison, deliberate Keep my changes or Use current values, followed by explicit Save. Added First/Previous/direct-page/Next/Last controls, boundary disabling, input validation and mobile wrapping.

Final verification: production TypeScript/Vite build passed; 23 API/PostgreSQL/WebSocket tests and 28 Chromium tests passed. Inspected desktop and narrow stale-row/comparison screenshots, the atomic import dialog and mobile pagination/Sonner feedback. Rebuilt the local Compose app without recreating its database. A read-only production browser check showed 501 accepted records and Last page moved directly to page 21 (501–501), with Next/Last disabled. Application data was not mutated for these checks; automated writes used comments_test. New import snapshots and notifications were tested through public HTTP/browser boundaries. Transient real transfer/processing stages still complete too quickly locally for separate visual inspection.

## Live recovery and required edit decisions — 19 November 2026

Reproduced missed change notifications, missed presence broadcasts, and stale Save behavior with deterministic browser regressions; each failed twice before the fix. A separate regression reproduced the open upload comparison retaining an obsolete current version. Server heartbeat acknowledgments now include the authoritative dataset revision and complete active presence; clients recover missed messages, refresh on focus/visibility/online recovery, and use HTTP refresh plus reconnect when acknowledgments stop. API responses are non-cacheable. Staged upload reviews refresh against current data and invalidate outdated choices; even if all conflicts disappear, new rows remain uncommitted until Apply upload.

A stale Save now opens a required Current version/Your version comparison immediately. Use my version submits the preserved draft against the displayed current version; Use current version closes the draft without writing it. Another concurrent save refreshes the required decision. No stale-save banner or warning toast substitutes for the viewer. Sonner uses the application's typography, neutral surfaces, borders and purple actions.

Verification: production build, 4 parser tests, 25 API/PostgreSQL/WebSocket tests and all 35 Chromium browser tests passed. Coverage includes missed pushes, focus recovery, simultaneous identical browser uploads followed by competing edits, both required version choices, live upload comparison refresh, and explicit Apply after conflicts disappear. Inspected current required-comparison screenshots at desktop and 390px and the themed Sonner notification screenshot. Transient actual transfer/processing notifications were not separately visually inspected.

Rebuilt and restarted only the Compose app, preserving the database. A production two-browser check at localhost:3000 confirmed both sessions connected, body-cell presence appeared in the observer within three seconds and cleared after Cancel, and the full accepted page response and 501-record total remained unchanged. Automated accepted-data writes ran only against comments_test. Reload both existing app sessions to load the rebuilt JavaScript.
