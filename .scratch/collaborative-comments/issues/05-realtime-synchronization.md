# 05: Synchronize both browsers in real time

**What to build:** Make committed uploads, edits, and resolutions visible in both connected browsers without refreshing and recover authoritative state after reconnecting.

**Blocked by:** 04: Edit comments with explicit Save/Cancel.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Use HTTP for mutations and WebSockets for server notifications in a single-backend deployment.
- [x] Publish notifications only after database commits; rejected or rolled-back operations do not announce successful changes.
- [x] Refetch accepted data and relevant conflict reviews after notifications, reflecting committed changes within three seconds in the supported local Compose demo.
- [x] Preserve in-memory drafts, valid search/page context, and keyboard focus while refreshing; new conflict information must not erase drafts.
- [x] Show connection status and refetch authoritative state after reconnecting so missed events do not leave stale data.
- [x] Guard against stale asynchronous responses replacing newer data; do not automatically retry rejected mutations after reconnect.
- [x] Add focused two-browser tests for conflicting uploads including the same previously absent ID, competing resolutions, and inline-edit races.
- [x] Verify propagation within the required interval and reconnect/refetch behavior with observable outcomes rather than arbitrary sleeps or private implementation assertions.
- [x] Maintain existing unit/API concurrency checks; browser coverage supplements rather than replaces database correctness tests.

## Verification

Ticket 05 verification: 4 parser tests, 14 HTTP/PostgreSQL/WebSocket tests, 16 Chromium browser tests and the production build pass. Controlled browser races supplement the existing API write-barrier checks for absent-ID uploads, competing saves and competing resolutions. Propagation assertions share one three-second deadline starting before uploads or write-barrier release, checking both observers concurrently. Ordered public WebSocket frames verify only committed changes are announced, excluding rejected, retried, unchanged and rolled-back operations. Reconnect tests suppress notifications during an HTTP edit, then verify authoritative recovery with retained search/page/draft/focus. Off-search drafts also receive current accepted data.

Rebuilt and started Docker Compose, then checked two independent Chromium sessions against port 3000: competing uploads became visible in both in 102 ms and resolution refreshed the other open review in 126 ms (measured from before each mutation). This smoke test added and resolved demo comment #1052357570, retaining the existing dataset. Inspected actual Compose live status and resolved table at 1440px and 390px, plus disconnected desktop/narrow draft states and the dynamically refreshed review from test screenshots. Status text, controls and recovery feedback remain readable. Active-cell presence remains ticket 06.

Standards/spec review findings (retry access on failed background review refresh and shared propagation deadlines) were addressed.
