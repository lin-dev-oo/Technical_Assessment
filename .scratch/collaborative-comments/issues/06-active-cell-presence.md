# 06: Show active-cell presence

**What to build:** See the cell another browser session is editing through temporary labels and colors, while keeping both sessions free to edit.

**Blocked by:** 05: Synchronize both browsers in real time.

**Status:** ready-for-agent

- [ ] Follow the project's UI direction for this slice: use shadcn/ui and purple accents, create an original workflow-driven interface, and visually inspect the relevant states. The reference image is a craftsmanship reference only, not a layout template.

- [ ] Assign each browser session a temporary distinguishable label and color without login; labels are not authenticated identities.
- [ ] Display the other session's active comment and field, using the existing WebSocket connection.
- [ ] Presence follows cell focus, clears when leaving the cell or disconnecting, and expires after a bounded heartbeat timeout when disconnection is not immediately detected.
- [ ] Rate-limit presence updates and validate incoming presence messages; keep presence temporary and separate from persistent comment data.
- [ ] An unsaved draft alone does not mark a cell active. Reconnection must not leave duplicate or permanently stale indicators.
- [ ] Presence is advisory: simultaneous editing remains allowed, and record-version/proposal checks remain authoritative.
- [ ] Do not add mouse-pointer tracking, shared keystrokes, exclusive cell locks, or distributed presence coordination.
- [ ] Add a lightweight two-browser test for seeing, moving, and clearing presence, including stale-session expiry; confirm presence does not bypass conflict safeguards.


