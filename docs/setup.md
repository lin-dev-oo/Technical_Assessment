# Run the assessment

Use Docker Desktop with the Linux engine running and Docker Compose v2. Run commands from the repository root. The Compose application needs no host Node.js installation; the browser tests and optional host development require Node.js 22 and npm. Image builds, npm installation and the first Chromium installation require network access. Ports 3000 and 5433 must be free (3100 is also needed by browser tests).

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health
```

Open [the application](http://localhost:3000). Wait for the health request to succeed before the demo. PostgreSQL starts before the app; tables are initialized automatically. The app serves its production React build, HTTP API and WebSocket endpoint from one Node.js process.

Compose sets `DATABASE_URL=postgres://comments:comments@db:5432/comments` and `PORT=3000`. Its PostgreSQL service uses local demo credentials `comments` / `comments`, database `comments`, and exposes host port 5433. No `.env` file or external service is required. For a host process, the default database address is `localhost:5433`; the service name `db` works only inside Compose. Update the Compose port mapping if a host port is occupied, and use the mapped port in browser URLs or host database connections.

```powershell
docker compose logs --tail 100 app db
docker compose restart app
docker compose down
```

Accepted comments, staged request metadata, existing stored alternatives, record/proposal revisions and upload outcomes survive app restarts and `docker compose down` in the named PostgreSQL volume. Dismissing/reloading an active staged browser review rejects its file; server-side durability does not provide a browser resume interface. `docker compose down -v` deliberately deletes that volume; it is optional and is only appropriate when you want to discard this project's demo data and start empty. Unsaved browser drafts are in memory and do not survive a page reload.

Follow the [repeatable two-session demo](demo/README.md) for fixture outcomes, concurrency explanation, persistence and timing checks. The original assessment wording remains in [README.md](../README.md), and the supplied [data.csv](../data.csv) is unchanged. The confirmed [specification](spec.md), [glossary](../GLOSSARY.md) and [UI direction](ui-design.md) describe the agreed interpretation.

## Tests

Tests use the already approved seams: pure CSV validation, public HTTP/WebSocket interfaces against real PostgreSQL, and focused two-browser collaboration. SQL is used for fixture setup, fault injection and synchronization; assertions observe public results. Controlled API races wait until both requests reach the write barrier before releasing the fixture lock, rather than relying on arbitrary sleeps. Browser propagation assertions use one shared three-second deadline for both observers.

Run parser tests in the app image after the startup above:

```powershell
docker compose run --rm app npm test
```

Create a dedicated test database once. If `comments_test` already exists, skip `createdb`:

```powershell
docker compose exec db createdb -U comments comments_test
docker compose run --rm -e TEST_DATABASE_URL=postgres://comments:comments@db:5432/comments_test app npm run test:api
```

**API and browser tests reset the test database's public schema.** The database name must end in `_test`; never give them the application database. Run these suites sequentially against a shared test database. The API suite covers validation atomicity, rollback/recovery, classification, omitted IDs, persistent/retried outcomes, concurrent absent-ID inserts, stale/blocked edits, alternative deduplication, revision-checked competing resolutions, notification timing and presence protocol safeguards.

For browser tests, install host dependencies and Chromium, then use the database's host address:

```powershell
npm ci
npx playwright install chromium
$env:TEST_DATABASE_URL = 'postgres://comments:comments@127.0.0.1:5433/comments_test'
npm run test:browser
```

The browser command first checks TypeScript and builds production assets, then starts its own HTTP/WebSocket server on port 3100. Compose can continue serving port 3000. Tests cover search/pagination, obsolete responses, grouped conflict comparisons, concurrent uploads/edits/resolutions, preserved drafts and focus, reconnect/refetch, notification delivery within three seconds, and active-cell presence movement/expiry. Screenshot creation does not by itself establish visual inspection. `npm run build` independently checks TypeScript and produces the frontend bundle.

## Optional host development

With Node.js 22 and host dependencies installed:

```powershell
docker compose up -d db
docker compose stop app
npm run dev
# In a second terminal:
npm run dev:web
```

Open [the Vite frontend](http://localhost:5173). It proxies HTTP and WebSockets under `/api` to the backend on port 3000. Optional backend environment variables are `DATABASE_URL` and `PORT`; changing the backend port also requires updating the Vite proxy in `vite.config.ts`. Stop the host server before restarting the Compose app on port 3000.

## Troubleshooting

- If Docker cannot connect or reports an incompatible image platform, start Docker Desktop and select its Linux engine. If the first build fails during downloads, check network access and repeat `docker compose up --build -d`.
- For a port allocation error, stop the process using that port or change the relevant host mapping. For startup/database failures, inspect `docker compose ps` and `docker compose logs --tail 100 app db`, then retry the health request. Rebuild after source changes.
- Existing data after `down` is expected. Use an isolated Compose project for a clean demo, as described in the demo guide; avoid deleting a database you want to keep.
- If Chromium is missing, rerun `npx playwright install chromium` after `npm ci`. A busy port 3100 prevents the browser test server from starting. If a test database is missing, run the `createdb` command above; if authentication fails, check whether an existing volume was initialized with different credentials.
- **Live updates disconnected. Reconnecting…** indicates an unavailable WebSocket connection. Restart the app and wait for **Live updates connected**. Browsers refetch after reconnect; failed mutations need a deliberate retry. Proxy deployments must forward WebSocket upgrades (the local Compose demo needs no proxy configuration).
- After rebuilding the frontend, save any drafts and reload all open app sessions. A container rebuild does not replace JavaScript already loaded in another browser. During a tunneled two-computer check, the existing sessions stopped showing presence/updates even though fresh sessions worked; reloading both restored collaboration. That observation does not identify whether an old bundle or old connection state was responsible.
- A rejected CSV reports actionable file/record/field errors. Correct the file and select it again; no part of a rejected file is imported. Search only includes accepted values, so text found solely in a pending alternative will not match.

## Scope boundaries

One shared fixed-schema dataset (`postId,id,name,email,body`), one backend instance and one PostgreSQL database are supported. Temporary session labels are not authentication or authorization. Presence advises about active cells and never locks them. There is no auto-save, schema editing, replacement upload/deletion of omitted records, field-by-field merge, durable draft recovery, offline synchronization or distributed event/presence fanout. Choose one complete accepted/pending version when resolving a conflict.

## Data and concurrency decisions

- The fixed schema is `postId,id,name,email,body`, with positive PostgreSQL integer IDs (maximum 2147483647). Header matching ignores case and order, while rejecting missing, unexpected, duplicate, blank or padded headers. Required text must be nonblank, email syntax is checked, and original accepted text whitespace is preserved.
- UTF-8 CSV supports quoted commas, quotes and multiline fields. Invalid text encoding, malformed quoting, repeated IDs, header-only/empty files, more than 5 MiB or 10,000 comments are rejected. Diagnostics use logical CSV record numbers, including the header as record 1 and excluding empty lines. A malformed CSV structure stops parsing rather than inventing later record locations.
- The entire bounded file is received and parsed before taking the short shared transaction-level advisory lock (`71422301`). Accepted rows are classified under the lock. Ordinary PostgreSQL columns and the primary key on `id` enforce identity; conflict-free files insert immediately, while conflicting files store a staged request without changing accepted rows. Applying a staged file commits its choices, new rows and terminal outcome together. Direct comparisons of validated postId/name/email/body values deduplicate alternatives. Every future mutation must take this same lock.
- The browser gives each selected file an upload identity. The server stores the raw file SHA-256 digest, HTTP outcome and response. For terminal requests, retrying the same identity and bytes returns the original result, even if accepted data later changes; different bytes with that identity return `identity_reused`. Terminal validation rejections are durable too. Terminal applied/rejected outcomes remain stable on retries; retrying a completed import cannot recreate staged changes. Database/transport outages remain retryable and do not store an outcome when the transaction rolls back. Nothing holds a database lock during transfer or parsing.
- The browser keeps the selected file and identity after an uncertain response so Retry upload is safe. Selecting a file starts a new upload with a new identity. Processing begins after the browser finishes transferring; the server does not simulate transfer percentages.
- Accepted comments are searched and listed by ID with a consistent snapshot for filtered totals and page contents. Text searches are literal substrings (including `%` and `_`), with exact numeric matching for id/postId. Out-of-range pages clamp to the final valid page, and empty results return page one. The browser debounces typing for 250 ms, cancels superseded requests and guards their responses. Explicit refresh and upload completion reuse `useComments.refresh`, preserving query/page; later collaboration notifications can call the same behavior.
- For existing stored legacy conflicts, review retrieval uses a consistent database snapshot for accepted values and all alternatives. Resolution takes the same shared write lock and checks both the accepted-record version and proposal-set revision. A selected alternative increments the accepted version; keeping accepted values leaves that version unchanged. Every resolution increments the proposal revision and closes the reviewed alternatives, so even an unchanged accepted version invalidates competing reviews. No lock is held while someone compares versions. The browser clears its selection after a stale response and keeps its choice after a transport failure.
- This is a single-backend local assessment deployment. Authentication and distributed fanout are outside the confirmed scope.
- `/api/events` provides WebSocket invalidations only after a dataset transaction commits. Committed accepted rows, edits and stored-conflict resolutions notify connected browsers; staging, unchanged imports, terminal retries, rejected operations and transaction rollbacks do not. HTTP remains authoritative. Browsers refetch after each invalidation and on every connection, cancel superseded reads, retain search/page/drafts and refresh open reviews without replacing their controls. A changed proposal revision invalidates an old selection or edit baseline even when accepted values are unchanged. The server checks socket liveness with ping/pong and closes sockets during shutdown; reconnects do not replay mutations. Vite proxies WebSockets as well as HTTP in development.

## Current browser upload protocol

The browser uses `/api/imports`. A conflict-free file imports immediately. If any row conflicts, the entire file, including new IDs, is staged in upload-request metadata outside accepted data and legacy alternatives. Confirm choice records a local decision. Apply upload checks the complete snapshot, both review revisions and all choices under the shared lock, then commits the whole batch. Close, Escape, outside dismissal and Reject upload reject the staged file. Later changes require renewed review; explicit Apply remains required when conflicts disappear.

- `POST /api/imports`: raw CSV bytes with `X-Upload-Id` (1–128 letters, digits, `_` or `-`), optional URI-encoded filename in `X-Upload-Label` and optional `X-Session-Label`; returns `completed`, `review_required` with `conflictIds`/`reviews`, validation rejection, or identity reuse.
- `POST /api/imports/:id/refresh`: refreshes staged snapshots without accepted writes; returns current reviews or the terminal outcome.
- `POST /api/imports/:id/commit`: JSON `{ "choices": [{ "id": 1, "selected": "accepted", "expectedVersion": 1, "expectedProposalRevision": 0 }] }`. Select alternatives by their returned numeric IDs. Every conflict requires a choice. Returns completed, stale_import (409), invalid_choices/incomplete_review (422), or not_found (404).
- `POST /api/imports/:id/reject`: discards staged data and stores `rejected_upload`; completed requests return their committed outcome.

Terminal retries return the stored outcome. Staged requests persist server-side, but there is no browser resume interface after closing/reloading. The only upload endpoint is `/api/imports`. `/api/uploads` is retired and returns 404. Existing stored alternatives remain available through the review/resolve endpoints; new imports never create legacy pending alternatives. Selected edit cells heartbeat every **one second**. Heartbeat acknowledgments include the dataset revision and full presence snapshot; missed acknowledgments trigger HTTP refresh and reconnection.

## API

- `GET /api/health`: application/database readiness.
- `GET /api/sample`: the original sample CSV.
- `WS /api/events`: JSON `{ "type": "changed", "ids": [1] }` after a committed dataset change. Clients refetch authoritative HTTP data. The server also sends `session` (temporary sessionId, label, color and opaque resumeToken) and `presence` snapshots. Clients send `{ "type": "presence", "cell": { "commentId": 1, "field": "body" } }`, or `cell: null` to clear. Only postId/name/email/body and positive supported comment IDs are accepted. The browser heartbeats selected edit cells every second; inactive entries expire after 12 seconds (checked each second). A token bucket allows 20 messages/second with a burst of 40; flooding closes the socket. Resuming with `?resume=…` supersedes the earlier still-connected socket and rotates the token. Tokens stay in memory and are never included in shared snapshots. Presence has no database write path or effect on save/conflict checks.
- `GET /api/comments?q=search&page=1&pageSize=25`: accepted rows (including version and pendingCount), filtered total, effective page and size. Optional `q` searches name/email/body case-insensitively and matches id/postId exactly for positive integer terms. Supported sizes: 10, 25, 50 (default 25).

- `POST /api/comments/:id/edit`: JSON `{ "expectedVersion": 1, "postId": 2, "name": "Edited", "email": "edited@example.com", "body": "My comment" }`. The ID comes from the URL and cannot be supplied in the body. Uses the shared write lock, validates the same field rules as CSV, and returns `saved` plus the current review (200), `stale_edit` or `conflicted_edit` plus the current review (409), structured `rejected` errors (422), `invalid_request` (400) or `not_found` (404). Rejected edits never create alternatives. Optional `X-Session-Label` identifies the manual edit. Every accepted save advances the record version; transport failures preserve the browser draft without automatic resubmission.
- `GET /api/comments/:id/review`: accepted version, every distinct alternative (with alternativeId and upload/session labels), and proposalRevision. Accepted values include version. Unknown comments return 404.
- `POST /api/comments/:id/resolve`: JSON `{ "selected": "accepted", "expectedVersion": 1, "expectedProposalRevision": 2 }`; selected may instead be a numeric alternativeId. Returns resolved plus the new review (200), stale_review plus the current review (409), invalid_request/invalid_selection (400), or not_found (404). A review with no remaining alternatives is stale.

The frontend uses shadcn/ui Button, Input, Progress and Dialog components with Radix primitives, styled with shared purple/neutral tokens. Long values have a full-content row expansion and the table scrolls deliberately on narrow screens. Visual verification is recorded separately after inspecting the running application.


## Verification records

Prior slice evidence is retained in [verification-history.md](verification-history.md). See [final assessment-demo verification](verification.md) for the clean startup, assembled suites and two-session Compose checks; historical counts are not a substitute for that run.
