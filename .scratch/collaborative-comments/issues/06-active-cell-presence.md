# 06: Show active-cell presence

**What to build:** See the cell another browser session is editing through temporary labels and colors, while keeping both sessions free to edit.

**Blocked by:** 05: Synchronize both browsers in real time.

**Status:** completed

- [x] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [x] Assign each browser session a temporary distinguishable label and color without login; labels are not authenticated identities.
- [x] Display the other session's active comment and field, using the existing WebSocket connection.
- [x] Presence follows cell focus, clears when leaving the cell or disconnecting, and expires after a bounded heartbeat timeout when disconnection is not immediately detected.
- [x] Rate-limit presence updates and validate incoming presence messages; keep presence temporary and separate from persistent comment data.
- [x] An unsaved draft alone does not mark a cell active. Reconnection must not leave duplicate or permanently stale indicators.
- [x] Presence is advisory: simultaneous editing remains allowed, and record-version/proposal checks remain authoritative.
- [x] Do not add mouse-pointer tracking, shared keystrokes, exclusive cell locks, or distributed presence coordination.
- [x] Add a lightweight two-browser test for seeing, moving, and clearing presence, including stale-session expiry; confirm presence does not bypass conflict safeguards.



## Verification

Ticket 06 verification: 4 parser tests, 16 public HTTP/PostgreSQL/WebSocket tests, 18 Chromium browser tests and the production build pass. The focused browser lifecycle covers focus movement, clearing on leaving the field while retaining a draft, simultaneous editing, disconnect, bounded stale-heartbeat expiry, reconnect uniqueness and conflict rejection. Public socket checks cover invalid/malformed input, ignored identity spoofing, flood closure and reconnect overlap while the earlier socket remains connected. Presence is transient and never writes comment storage. A server-issued opaque resume token supersedes overlapping connections and is excluded from shared snapshots.

Rebuilt Docker Compose and checked two independent Chromium sessions on port 3000 against existing comment #1 without saving or changing persisted data. Focus, simulated window blur/focus and Cancel propagated correctly. Visually inspected real Compose table presence at 1440px and 390px with the existing 501-comment collection, and simultaneous inline editors at the same widths from browser screenshots. Labels remain readable and separate from purple focus; horizontal scrolling preserves access to editor actions. Native operating-system window switching was not separately inspected; the automated smoke dispatched the browser window blur/focus events.

Independent review identified an overlapping reconnect duplicate window; the resume-token change and a failing-then-passing public protocol test address it.
