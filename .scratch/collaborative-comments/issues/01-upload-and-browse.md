# 01: Upload and browse validated comments

**What to build:** Run the application through Docker Compose, upload the supplied CSV, and browse persisted accepted comments with clear progress and validation feedback.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] React/TypeScript frontend, Node.js/TypeScript backend, and PostgreSQL start through Docker Compose; basic startup and verification instructions are available.
- [x] The supplied CSV imports through the browser and accepted comments remain available after an application restart.
- [x] Transfer progress is distinguished from processing status; successful uploads report inserted and unchanged counts.
- [x] Validate the entire file before any dataset writes. Reject empty/header-only files, files exceeding 5 MB or 10,000 records, malformed CSV, invalid values, and repeated IDs; report all safely discoverable errors with reliable record/field locations.
- [x] Accept the five fixed headers in any order and capitalization; reject missing, unexpected, duplicated, blank, or whitespace-padded headers.
- [x] Require positive integer id/postId values within database bounds, nonblank name/email/body, and basic email syntax. Preserve valid quoted commas, line breaks, and text whitespace.
- [x] Insert new IDs, count identical accepted comments as unchanged, and retain IDs omitted from the file.
- [x] As an explicitly temporary restriction until ticket 03, reject a whole upload containing changed existing comments with an actionable unsupported-conflict message; never silently overwrite or partially apply that file.
- [x] Use transactional writes, a uniqueness constraint on id, and a short shared dataset write lock; parse and validate outside the lock.
- [x] Give upload requests persistent identities and outcomes. Same-identity/same-content retries return the original outcome; changed-content reuse is rejected; concurrent retries cannot process twice.
- [x] Test parser validation and preservation at a small unit seam; use the public API against real PostgreSQL for atomicity, persistence, rollback, omitted IDs, duplicate handling, and concurrent retry behavior.


## Verification

The final automated run passed four parser tests, six public HTTP/PostgreSQL tests and the production TypeScript/Vite build. Compose browser inspection covered the supplied sample, long content, desktop and narrow layouts, import success/rejections, persistence after restart, full-content expansion and keyboard focus. Follow-up verified same-file selection (0 inserted, 500 unchanged), no page overflow at 390px (document scroll width 375px), and network failure followed by Retry import after restart returning the original 0 inserted, 500 unchanged outcome. Transfer and processing states complete too quickly to capture separately visually; this remains a verification limitation.

Review reported one standards finding (repeated semantic color literals), now fixed with shared tokens, and no spec findings.
