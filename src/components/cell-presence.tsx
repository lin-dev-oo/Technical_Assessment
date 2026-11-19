import type { Presence } from '../hooks/use-realtime';

export function CellPresence({ sessions, commentId, field }: { sessions: Presence[]; commentId: number; field: string }) {
  return sessions.filter(session => session.cell.commentId === commentId && session.cell.field === field).map(session =>
    <span key={session.sessionId} className="cell-presence" data-presence-field={field} title="Temporary session activity; editing remains available">
      <span aria-hidden="true" style={{ backgroundColor: session.color }}/>{session.label} · editing
    </span>);
}
