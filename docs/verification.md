# Assessment-demo verification

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
