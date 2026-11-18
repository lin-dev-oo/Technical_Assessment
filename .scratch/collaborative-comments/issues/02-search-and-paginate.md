# 02: Search and paginate accepted comments

**What to build:** Find accepted comments across the complete shared dataset and browse stable pages without stale responses replacing newer search results.

**Blocked by:** 01: Upload and browse validated comments.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Search name, email, and body case-insensitively, with exact numeric matches for id/postId; search all accepted data rather than the visible page.
- [ ] Debounce typing while keeping the interface responsive, and ignore out-of-order responses to superseded searches.
- [ ] Use stable pagination with a default page size of 25 and options of 10, 25, and 50.
- [ ] Reset to page one when the search changes; handle empty results and page bounds clearly.
- [ ] Retain query and page during refresh where valid, moving to the last valid page when necessary.
- [ ] Verify search semantics, page boundaries, and totals through the public API against PostgreSQL; add focused browser coverage for changing queries and page controls.
- [ ] Expose a refresh behavior that later collaboration can reuse without losing browsing context.


