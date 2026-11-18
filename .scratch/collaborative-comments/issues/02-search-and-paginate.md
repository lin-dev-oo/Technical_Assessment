# 02: Search and paginate accepted comments

**What to build:** Find accepted comments across the complete shared dataset and browse stable pages without stale responses replacing newer search results.

**Blocked by:** 01: Upload and browse validated comments.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Search name, email, and body case-insensitively, with exact numeric matches for id/postId; search all accepted data rather than the visible page.
- [x] Debounce typing while keeping the interface responsive, and ignore out-of-order responses to superseded searches.
- [x] Use stable pagination with a default page size of 25 and options of 10, 25, and 50.
- [x] Reset to page one when the search changes; handle empty results and page bounds clearly.
- [x] Retain query and page during refresh where valid, moving to the last valid page when necessary.
- [x] Verify search semantics, page boundaries, and totals through the public API against PostgreSQL; add focused browser coverage for changing queries and page controls.
- [x] Expose a refresh behavior that later collaboration can reuse without losing browsing context.



## Verification

Passed 4 parser tests, 7 public HTTP/PostgreSQL tests, 3 focused Chromium browser tests, and the TypeScript/Vite production build. Search tests cover literal case-insensitive text, exact numeric identifiers, filtered totals and page bounds, empty results, query/page changes, retained refresh context, clamping after accepted data stops matching, and controlled superseded responses. Standards and spec reviews found no actionable issues.

Visually inspected the Compose app with the supplied 500-comment sample at 1440px and 390px. Verified populated search, empty-result recovery, reachable page controls, page navigation/refresh, visible keyboard focus, and no document overflow at 390px. Fixed an initially clipped mobile empty-results message by placing it outside table scrolling. Existing long-content expansion was preserved; a new challenging-content fixture was not visually retested for this slice.

