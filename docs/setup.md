# Running Comments

Requires Docker Desktop with its Linux engine running. From the repository root:

```powershell
docker compose up --build -d
```

Open http://localhost:3000. The app serves its production React build and HTTP API from one Node.js process. PostgreSQL is on localhost:5433 with local demo credentials `comments` / `comments`, database `comments`. Ports 3000 and 5433 must be free. These credentials are for the local assessment only.

```powershell
docker compose logs -f app
docker compose restart app
docker compose down
```

Accepted comments and upload outcomes survive application restarts and `docker compose down` through the named PostgreSQL volume. `docker compose down -v` deliberately deletes this project's database volume; use it only when you want an empty collection.

## Current slice

Tickets 01–06 provide validated merge uploads, durable retry identities, accepted-comment browsing/search/pagination, persistent conflict review, whole-version resolution, explicit Save/Cancel editing, live synchronization and active-cell presence. Changed existing comments create pending alternatives while accepted values remain visible; new IDs in the same file commit immediately. Omitted IDs remain untouched.

## Demo

1. Open the app. An empty dataset shows a centered **Upload CSV** button; persisted comments open directly in the table.
2. Click **Upload CSV** and select the supplied `data.csv`. Selecting the file starts its upload immediately. Transfer progress reflects bytes sent; the separate processing state covers validation and saving. Expect **500 inserted, 0 unchanged, 0 pending conflicts** in a fresh database, followed by the table screen.
3. Inspect the table, use the row chevron to read a complete comment, move between pages and switch between 10, 25 and 50 rows. The default is 25. Search across all accepted names, emails and comment bodies without case sensitivity; numeric terms also match an exact comment ID or post ID. Search changes reset to page one after a 250 ms typing debounce. Clear search restores the full collection. Refresh preserves the query and current page, clamping to the last valid page when needed.
4. Use **Upload CSV** above the table and select the same file again. Expect **0 inserted, 500 unchanged, 0 pending conflicts**. Omitted IDs are retained when you upload a subset.
5. Restart the app, reload and verify the collection remains.
6. Try a file with a new ID plus an invalid record. No new comments should appear; correct all listed record/field errors and choose the corrected file.
7. Open a second browser window. Confirm **Live updates connected** in both. Upload [conflicting-a.csv](demo/conflicting-a.csv) in one and [conflicting-b.csv](demo/conflicting-b.csv) in the other, simultaneously if desired. Each changes comment #1 from the supplied sample. Both windows load the complete proposal set within three seconds without manual refresh. Its accepted values stay visible, and the row shows a pending-conflict action. Repeating either file creates no duplicate alternative.
8. Click the row's pending-conflict action. Compare the **Accepted version** with all **Pending alternatives**; changed fields are highlighted. Filename and temporary browser-session labels identify each version. Scroll sideways for more alternatives or on narrow screens. Choose a radio button and **Resolve conflict** to retain the selected whole version and close all reviewed alternatives. Choosing the accepted version rejects the alternatives without changing its values.
9. For a stale-review demo, open a review and select a version in one window, then upload another distinct version in the other. The open comparison refreshes, clears the outdated selection and requires another choice while keeping the dialog and keyboard focus. Two competing resolutions yield one winner; the other refreshes instead of reversing it. A later upload can create a fresh conflict.

10. Click **Edit** on a comment without pending conflicts. Change postId, name, email or body directly in its table cells, then **Save** or **Cancel**. The comment ID stays immutable. Refreshing, searching and changing pages preserve the in-memory draft. If the edited row falls outside the current results or page, it remains as a labelled draft row until Save or Cancel. Cancel discards it; leaving/reloading the page does not retain drafts.
11. Start editing the same comment in two windows. Save in one, then try saving the other. Its draft remains beside the current accepted values. Choose **Use current accepted version** deliberately after comparing, then **Save** to submit the preserved draft. If an upload creates a pending conflict, resolve it first; the baseline action checks the server before allowing another save. Connection and validation failures keep the draft for a deliberate retry.

12. Keep a draft or review open, then run `docker compose stop app`. The connection status changes to **Live updates disconnected. Reconnecting…**. Run `docker compose start app`; the browser reconnects and refetches authoritative rows, the retained draft's accepted values and any open review. Search, valid page, unsaved text and focus remain intact. A rejected mutation is never automatically retried. The dedicated browser suite also deliberately suppresses notifications while a separate HTTP client commits changes, then checks recovery without a page refresh.

13. While editing, focus another field and observe its temporary **Session … · editing** label in the other window. Both windows can edit the same cell. Move focus to search or Save/Cancel to clear activity while retaining any draft. Switching away from the window also clears activity. Closing the tab clears its label; suspended heartbeats expire within 13 seconds. Reconnects replace earlier activity without duplicate labels. Session labels and colors indicate temporary activity, not authenticated identities or ownership.

## Tests

The tests use the approved seams: pure CSV validation, real HTTP/WebSocket interfaces against PostgreSQL, and focused browser collaboration. No database mocks or React implementation tests are used.

```powershell
docker compose run --rm app npm test
```

Create a dedicated test database **once** (an already-existing database error on subsequent runs can be ignored):

```powershell
docker compose exec db createdb -U comments comments_test
docker compose run --rm -e TEST_DATABASE_URL=postgres://comments:comments@db:5432/comments_test app npm run test:api
```

**API tests reset the public schema of their test database.** The database name must end in `_test`; never supply the application's database. Tests cover validation atomicity, persistence and retry outcomes across service reconnection, unchanged/omitted records, proposal deduplication/persistence, whole-version resolutions, stale reviews, competing resolutions, new alternatives after review, database/proposal rollback and recovery, whole-dataset pagination, upload limits and persistent identity reuse. Controlled concurrency tests hold a fixture database lock until both HTTP requests reach the write barrier, then release it; they do not infer overlap from arbitrary sleeps. SQL is used only for fixture setup, fault injection and synchronization; assertions observe the HTTP API.

For a host development environment with Node.js 22:

```powershell
npm ci
docker compose up -d db
npm run dev
# In a second terminal:
npm run dev:web
```

The Vite development frontend is on http://localhost:5173 and proxies `/api` to the Node server on port 3000. Stop the Compose app before starting the host server on that same port. `npm run build` checks TypeScript and creates the production browser bundle.

## Focused browser tests

After installing host dependencies, install the Chromium test browser once:

```powershell
npx playwright install chromium
$env:TEST_DATABASE_URL = 'postgres://comments:comments@127.0.0.1:5433/comments_test'
npm run test:browser
```

The browser suite builds the app and starts a separate HTTP server on port 3100. It resets the dedicated test database schema, then seeds comments through the API. Run it separately from API tests against the same database. It covers search beyond the visible page, page sizes and reset, empty results, refresh retaining context, clamping after accepted data stops matching, a controlled delayed response from a superseded query, grouped version comparisons and highlights, whole-version selection, stale-review refresh in two browser windows, keyboard dismissal/focus restoration, network-failure choice preservation, and supplied-sample/long-content layouts at 1440px and 390px. SQL only sets up the simulated accepted edit; assertions use the browser. API tests also cover filtered totals, page boundaries, empty results, literal text and exact numeric search.

## Data and concurrency decisions

- The fixed schema is `postId,id,name,email,body`, with positive PostgreSQL integer IDs (maximum 2147483647). Header matching ignores case and order, while rejecting missing, unexpected, duplicate, blank or padded headers. Required text must be nonblank, email syntax is checked, and original accepted text whitespace is preserved.
- UTF-8 CSV supports quoted commas, quotes and multiline fields. Invalid text encoding, malformed quoting, repeated IDs, header-only/empty files, more than 5 MiB or 10,000 comments are rejected. Diagnostics use logical CSV record numbers, including the header as record 1 and excluding empty lines. A malformed CSV structure stops parsing rather than inventing later record locations.
- The entire bounded file is received and parsed before taking the short shared transaction-level advisory lock (`71422301`). Accepted rows are classified under the lock. Ordinary PostgreSQL columns and the primary key on `id` enforce identity; a transaction commits inserted rows, distinct pending alternatives, proposal revisions and its upload outcome together. Direct comparisons of validated postId/name/email/body values deduplicate alternatives. Every future mutation must take this same lock.
- The browser gives each selected file an upload identity. The server stores the raw file SHA-256 digest, HTTP outcome and response. Retrying the same identity and bytes returns the original result, even if accepted data later changes; different bytes with that identity return `identity_reused`. Terminal validation rejections are durable too. Pending-conflict outcomes remain the original result on retries, even after resolution; retrying an old upload cannot recreate its alternatives. Database/transport outages remain retryable and do not store an outcome when the transaction rolls back. Nothing holds a database lock during transfer or parsing.
- The browser keeps the selected file and identity after an uncertain response so Retry upload is safe. Selecting a file starts a new upload with a new identity. Processing begins after the browser finishes transferring; the server does not simulate transfer percentages.
- Accepted comments are searched and listed by ID with a consistent snapshot for filtered totals and page contents. Text searches are literal substrings (including `%` and `_`), with exact numeric matching for id/postId. Out-of-range pages clamp to the final valid page, and empty results return page one. The browser debounces typing for 250 ms, cancels superseded requests and guards their responses. Explicit refresh and upload completion reuse `useComments.refresh`, preserving query/page; later collaboration notifications can call the same behavior.
- Review retrieval uses a consistent database snapshot for accepted values and all alternatives. Resolution takes the same shared write lock and checks both the accepted-record version and proposal-set revision. A selected alternative increments the accepted version; keeping accepted values leaves that version unchanged. Every resolution increments the proposal revision and closes the reviewed alternatives, so even an unchanged accepted version invalidates competing reviews. No lock is held while someone compares versions. The browser clears its selection after a stale response and keeps its choice after a transport failure.
- This is a single-backend local assessment deployment. Authentication and distributed fanout are outside the confirmed scope.
- `/api/events` provides WebSocket invalidations only after a dataset transaction commits. New accepted rows, distinct alternatives, edits and resolutions notify connected browsers; unchanged imports, duplicate alternatives, upload retries, rejected operations and transaction rollbacks do not. HTTP remains authoritative. Browsers refetch after each invalidation and on every connection, cancel superseded reads, retain search/page/drafts and refresh open reviews without replacing their controls. A changed proposal revision invalidates an old selection or edit baseline even when accepted values are unchanged. The server checks socket liveness with ping/pong and closes sockets during shutdown; reconnects do not replay mutations. Vite proxies WebSockets as well as HTTP in development.

## API

- `GET /api/health`: application/database readiness.
- `GET /api/sample`: the original sample CSV.
- `WS /api/events`: JSON `{ "type": "changed", "ids": [1] }` after a committed dataset change. Clients refetch authoritative HTTP data. The server also sends `session` (temporary sessionId, label, color and opaque resumeToken) and `presence` snapshots. Clients send `{ "type": "presence", "cell": { "commentId": 1, "field": "body" } }`, or `cell: null` to clear. Only postId/name/email/body and positive supported comment IDs are accepted. The browser heartbeats focused cells every 3 seconds; inactive entries expire after 12 seconds (checked each second). A token bucket allows 20 messages/second with a burst of 40; flooding closes the socket. Resuming with `?resume=…` supersedes the earlier still-connected socket and rotates the token. Tokens stay in memory and are never included in shared snapshots. Presence has no database write path or effect on save/conflict checks.
- `GET /api/comments?q=search&page=1&pageSize=25`: accepted rows (including version and pendingCount), filtered total, effective page and size. Optional `q` searches name/email/body case-insensitively and matches id/postId exactly for positive integer terms. Supported sizes: 10, 25, 50 (default 25).
- `POST /api/uploads`: raw CSV bytes and an `X-Upload-Id` header (1–128 letters, digits, `_` or `-`). Optional `X-Upload-Label` (URI-encoded filename) and `X-Session-Label` headers supply basic labels. Returns `completed` with inserted/unchanged/conflicts counts (200), structured `rejected` validation errors (422), or `identity_reused` (409). The conflicts count is uploaded changed IDs needing review, including an alternative already pending. Service failures return retryable 503.

- `POST /api/comments/:id/edit`: JSON `{ "expectedVersion": 1, "postId": 2, "name": "Edited", "email": "edited@example.com", "body": "My comment" }`. The ID comes from the URL and cannot be supplied in the body. Uses the shared write lock, validates the same field rules as CSV, and returns `saved` plus the current review (200), `stale_edit` or `conflicted_edit` plus the current review (409), structured `rejected` errors (422), `invalid_request` (400) or `not_found` (404). Rejected edits never create alternatives. Optional `X-Session-Label` identifies the manual edit. Every accepted save advances the record version; transport failures preserve the browser draft without automatic resubmission.
- `GET /api/comments/:id/review`: accepted version, every distinct alternative (with alternativeId and upload/session labels), and proposalRevision. Accepted values include version. Unknown comments return 404.
- `POST /api/comments/:id/resolve`: JSON `{ "selected": "accepted", "expectedVersion": 1, "expectedProposalRevision": 2 }`; selected may instead be a numeric alternativeId. Returns resolved plus the new review (200), stale_review plus the current review (409), invalid_request/invalid_selection (400), or not_found (404). A review with no remaining alternatives is stale.

The frontend uses shadcn/ui Button, Input, Progress and Dialog components with Radix primitives, styled with shared purple/neutral tokens. Long values have a full-content row expansion and the table scrolls deliberately on narrow screens. Visual verification is recorded separately after inspecting the running application.

## Verification notes

The simplified upload/table flow was verified against a separate empty PostgreSQL database: only the centered Upload CSV action is initially visible, invalid selection displays actionable errors, and selecting the supplied CSV uploads immediately and transitions to the 500-comment table. Reloading opens directly to that table. Uploading from the table returns unchanged counts for the same sample. The table and upload action remain usable at 390px without page overflow. The existing application database was preserved during the empty-state check.

The running Compose app was inspected at 1440px desktop and 390px narrow widths with the supplied 500-comment sample and a challenging long-name/email/multiline/unbroken-body fixture. Empty, successful import, validation rejection, changed-comment rejection, expanded full content, row navigation and keyboard focus were inspected. Restarting the Compose app and reloading retained all 501 accepted comments from that demo. Follow-up inspection confirmed that choosing `data.csv` again permits a second import and reports 0 inserted, 500 unchanged. At the 390px narrow viewport, the document scroll width was 375px with no page overflow. Stopping the app produced the network-error state; after restart, Retry import returned the original outcome of 0 inserted, 500 unchanged. File transfer and processing completed too quickly to visually inspect separately, so those two states are not claimed as separately visually verified.

The final automated run passed four parser tests, six public HTTP/PostgreSQL tests and the production TypeScript/Vite build. Runtime dependency audit reports no known advisories. The development-only Vite globbing dependency chain currently reports a picomatch advisory without a patched version in the audit data; it is not part of the served runtime request path.

Ticket 02 verification: 4 parser tests, 7 public HTTP/PostgreSQL tests, 3 Chromium browser tests and the production build passed. Standards and spec reviews found no actionable issues. The Compose UI was visually inspected with the supplied 500-comment sample at 1440px and 390px: populated search, empty results and recovery, keyboard focus, page navigation and refresh all worked. No document overflow at 390px; the mobile empty message was corrected to remain outside horizontal table scrolling. A new challenging-content fixture was not visually retested in this slice.


Ticket 03 automated verification: 10 public HTTP/PostgreSQL tests and 7 Chromium browser tests pass, together with the production TypeScript/Vite build. Browser tests save comparison screenshots for desktop and narrow viewports, including supplied sample data and three alternatives with long name/email/unbroken multiline body values. Visual inspection is recorded by the reviewing agent separately; screenshot generation alone is not a claim of visual verification. Real-time notifications, editing and presence remain dependent work.

Ticket 03 visual/review verification: inspected generated Chromium screenshots of the supplied sample and several long alternatives at 1440px and 390px. Comparison labels, changed fields, purple whole-version selection, mobile scrolling and footer actions were readable. Focus restoration, failed-resolution selection preservation and stale-review recovery also passed browser checks. Standards and spec reviews each reported zero actionable findings. Four parser tests passed as part of the final run.

Ticket 04 verification: 4 parser tests, 13 HTTP/PostgreSQL tests, 11 Chromium browser tests and the production build pass. Edits occur directly in table cells with row Save/Cancel. Two-browser stale saves, incoming conflicts, validation and transport errors preserve drafts; retaining accepted values during resolution still requires deliberate reconciliation. Desktop and 390px screenshots were visually inspected, including long multiline drafts and both horizontal scroll positions. Mobile recovery feedback remains within the viewport. Standards review's mobile readability finding was fixed and verified; spec review found no issues. WebSocket synchronization and presence remain subsequent tickets.

Ticket 05 verification: 4 parser tests, 14 HTTP/PostgreSQL/WebSocket tests, 16 Chromium browser tests and the production build pass. Controlled browser races supplement the existing API write-barrier checks for absent-ID uploads, competing saves and competing resolutions. Propagation assertions share one three-second deadline starting before uploads or write-barrier release, checking both observers concurrently. Ordered public WebSocket frames verify only committed changes are announced, excluding rejected, retried, unchanged and rolled-back operations. Reconnect tests suppress notifications during an HTTP edit, then verify authoritative recovery with retained search/page/draft/focus. Off-search drafts also receive current accepted data.

Rebuilt and started Docker Compose, then checked two independent Chromium sessions against port 3000: competing uploads became visible in both in 102 ms and resolution refreshed the other open review in 126 ms (measured from before each mutation). This smoke test added and resolved demo comment #1052357570, retaining the existing dataset. Inspected actual Compose live status and resolved table at 1440px and 390px, plus disconnected desktop/narrow draft states and the dynamically refreshed review from test screenshots. Status text, controls and recovery feedback remain readable. Active-cell presence remains ticket 06.

Ticket 06 verification: 4 parser tests, 16 public HTTP/PostgreSQL/WebSocket tests, 18 Chromium browser tests and the production build pass. Two-browser checks cover focus movement, retained inactive drafts, simultaneous editing, disconnect, bounded heartbeat expiry, reconnect and authoritative conflict rejection. Socket protocol tests validate malformed input, ignored identity spoofing, rate limits and replacement of a still-connected session. Rebuilt Compose and verified two-session focus, simulated window blur/focus and Cancel without persisting edits. Inspected Compose viewing cells and simultaneous inline-editor screenshots at 1440px and 390px; subtle dashed activity labels remain distinct from purple keyboard focus. Native OS window switching was not separately inspected.
