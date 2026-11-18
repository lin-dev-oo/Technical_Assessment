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

Ticket 01 provides validated uploads, durable retry identities, accepted-comment browsing, pagination and the Compose runtime. Search, editing, conflict review and real-time collaboration belong to later dependent tickets and are not implemented here. Until ticket 03, a changed existing comment rejects the **whole** file with an actionable message. It never silently overwrites accepted data or inserts other new IDs from that rejected file.

## Demo

1. Open the app. An empty dataset shows a centered **Upload CSV** button; persisted comments open directly in the table.
2. Click **Upload CSV** and select the supplied `data.csv`. Selecting the file starts its upload immediately. Transfer progress reflects bytes sent; the separate processing state covers validation and saving. Expect **500 inserted, 0 unchanged** in a fresh database, followed by the table screen.
3. Inspect the table, use the row chevron to read a complete comment, move between pages and switch between 10, 25 and 50 rows. The default is 25.
4. Use **Upload CSV** above the table and select the same file again. Expect **0 inserted, 500 unchanged**. Omitted IDs are retained when you upload a subset.
5. Restart the app, reload and verify the collection remains.
6. Try a file with a new ID plus an invalid record. No new comments should appear; correct all listed record/field errors and choose the corrected file.
7. Change one existing comment in a copy of the sample and import. In this slice the entire file is rejected because conflict review is not yet available.

The final assessment's simultaneous-upload/conflict-resolution demonstration becomes available in later tickets. Current concurrency tests prove that two uploads of different values for a previously absent ID cannot overwrite each other: one inserts and the other receives the temporary conflict rejection.

## Tests

The tests use the approved seams: pure CSV validation and real HTTP requests against PostgreSQL. No database mocks or React implementation tests are used.

```powershell
docker compose run --rm app npm test
```

Create a dedicated test database **once** (an already-existing database error on subsequent runs can be ignored):

```powershell
docker compose exec db createdb -U comments comments_test
docker compose run --rm -e TEST_DATABASE_URL=postgres://comments:comments@db:5432/comments_test app npm run test:api
```

**API tests reset the public schema of their test database.** The database name must end in `_test`; never supply the application's database. Tests cover validation atomicity, persistence and retry outcomes across service reconnection, unchanged/omitted records, conflict rejection, database rollback/recovery, whole-dataset pagination, upload limits and persistent identity reuse. Controlled concurrency tests hold a fixture database lock until both HTTP requests reach the write barrier, then release it; they do not infer overlap from arbitrary sleeps. SQL is used only for fixture setup, fault injection and synchronization; assertions observe the HTTP API.

For a host development environment with Node.js 22:

```powershell
npm ci
docker compose up -d db
npm run dev
# In a second terminal:
npm run dev:web
```

The Vite development frontend is on http://localhost:5173 and proxies `/api` to the Node server on port 3000. Stop the Compose app before starting the host server on that same port. `npm run build` checks TypeScript and creates the production browser bundle.

## Data and concurrency decisions

- The fixed schema is `postId,id,name,email,body`, with positive PostgreSQL integer IDs (maximum 2147483647). Header matching ignores case and order, while rejecting missing, unexpected, duplicate, blank or padded headers. Required text must be nonblank, email syntax is checked, and original accepted text whitespace is preserved.
- UTF-8 CSV supports quoted commas, quotes and multiline fields. Invalid text encoding, malformed quoting, repeated IDs, header-only/empty files, more than 5 MiB or 10,000 comments are rejected. Diagnostics use logical CSV record numbers, including the header as record 1 and excluding empty lines. A malformed CSV structure stops parsing rather than inventing later record locations.
- The entire bounded file is received and parsed before taking the short shared transaction-level advisory lock (`71422301`). Accepted rows are classified under the lock. Ordinary PostgreSQL columns and the primary key on `id` enforce identity; a transaction commits inserted rows together with their upload outcome. Every future mutation must take this same lock.
- The browser gives each selected file an upload identity. The server stores the raw file SHA-256 digest, HTTP outcome and response. Retrying the same identity and bytes returns the original result, even if accepted data later changes; different bytes with that identity return `identity_reused`. Terminal validation/conflict rejections are durable too. Database/transport outages remain retryable and do not store an outcome when the transaction rolls back. Nothing holds a database lock during transfer or parsing.
- The browser keeps the selected file and identity after an uncertain response so Retry upload is safe. Selecting a file starts a new upload with a new identity. Processing begins after the browser finishes transferring; the server does not simulate transfer percentages.
- Accepted comments are listed by ID with a consistent snapshot for total and page contents. Out-of-range pages clamp to the final valid page. The UI can refresh explicitly; later tickets add live refresh and search.
- This is a single-backend local assessment deployment. Authentication and distributed fanout are outside the confirmed scope.

## API

- `GET /api/health`: application/database readiness.
- `GET /api/sample`: the original sample CSV.
- `GET /api/comments?page=1&pageSize=25`: accepted rows, total, effective page and size. Supported sizes: 10, 25, 50.
- `POST /api/uploads`: raw CSV bytes and an `X-Upload-Id` header (1–128 letters, digits, `_` or `-`). Returns `completed` with inserted/unchanged counts (200), structured `rejected` validation errors (422), `unsupported_conflict` (409), or `identity_reused` (409). Service failures return retryable 503.

The frontend uses shadcn/ui Button and Progress components with Radix primitives, styled with shared purple/neutral tokens. Long values have a full-content row expansion and the table scrolls deliberately on narrow screens. Visual verification is recorded separately after inspecting the running application.

## Verification notes

The simplified upload/table flow was verified against a separate empty PostgreSQL database: only the centered Upload CSV action is initially visible, invalid selection displays actionable errors, and selecting the supplied CSV uploads immediately and transitions to the 500-comment table. Reloading opens directly to that table. Uploading from the table returns unchanged counts for the same sample. The table and upload action remain usable at 390px without page overflow. The existing application database was preserved during the empty-state check.

The running Compose app was inspected at 1440px desktop and 390px narrow widths with the supplied 500-comment sample and a challenging long-name/email/multiline/unbroken-body fixture. Empty, successful import, validation rejection, changed-comment rejection, expanded full content, row navigation and keyboard focus were inspected. Restarting the Compose app and reloading retained all 501 accepted comments from that demo. Follow-up inspection confirmed that choosing `data.csv` again permits a second import and reports 0 inserted, 500 unchanged. At the 390px narrow viewport, the document scroll width was 375px with no page overflow. Stopping the app produced the network-error state; after restart, Retry import returned the original outcome of 0 inserted, 500 unchanged. File transfer and processing completed too quickly to visually inspect separately, so those two states are not claimed as separately visually verified.

The final automated run passed four parser tests, six public HTTP/PostgreSQL tests and the production TypeScript/Vite build. Runtime dependency audit reports no known advisories. The development-only Vite globbing dependency chain currently reports a picomatch advisory without a patched version in the audit data; it is not part of the served runtime request path.
