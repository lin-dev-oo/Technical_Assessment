# 05: Synchronize both browsers in real time

**What to build:** Make committed uploads, edits, and resolutions visible in both connected browsers without refreshing and recover authoritative state after reconnecting.

**Blocked by:** 04: Edit comments with explicit Save/Cancel.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Use HTTP for mutations and WebSockets for server notifications in a single-backend deployment.
- [ ] Publish notifications only after database commits; rejected or rolled-back operations do not announce successful changes.
- [ ] Refetch accepted data and relevant conflict reviews after notifications, reflecting committed changes within three seconds in the supported local Compose demo.
- [ ] Preserve in-memory drafts, valid search/page context, and keyboard focus while refreshing; new conflict information must not erase drafts.
- [ ] Show connection status and refetch authoritative state after reconnecting so missed events do not leave stale data.
- [ ] Guard against stale asynchronous responses replacing newer data; do not automatically retry rejected mutations after reconnect.
- [ ] Add focused two-browser tests for conflicting uploads including the same previously absent ID, competing resolutions, and inline-edit races.
- [ ] Verify propagation within the required interval and reconnect/refetch behavior with observable outcomes rather than arbitrary sleeps or private implementation assertions.
- [ ] Maintain existing unit/API concurrency checks; browser coverage supplements rather than replaces database correctness tests.


