import type { CSSProperties } from 'react';
import type { Presence } from '../hooks/use-realtime';

export function presenceCellStyle(sessions: Presence[], commentId: number, field: string): CSSProperties | undefined {
  const active = sessions.find(session => session.cell.commentId === commentId && session.cell.field === field);
  return active ? { '--remote-cell-color': active.color } as CSSProperties : undefined;
}

export function CellPresence({ sessions, commentId, field }: { sessions: Presence[]; commentId: number; field: string }) {
  const active = sessions.filter(session => session.cell.commentId === commentId && session.cell.field === field);
  if (!active.length) return null;
  const names = active.map(session => session.label).join(', ');
  return <span className="cell-presence" data-presence-field={field} style={{ '--presence-color': active[0].color } as CSSProperties} title={`${names} editing ${field}. You can still edit this cell.`}>
    <span aria-hidden="true"/>{names}<span className="sr-only"> editing</span>
  </span>;
}

export function PresenceSummary({ sessions, sessionLabel }: { sessions: Presence[]; sessionLabel: string }) {
  return <div className="presence-summary" aria-label="Editing activity">
    <span className="own-session">You: {sessionLabel}</span>
    {sessions.length > 0 && <span role="status">{sessions.map(session => <span className="presence-location" key={session.sessionId} style={{ '--presence-color': session.color } as CSSProperties}>
      <span aria-hidden="true"/>{session.label} editing #{session.cell.commentId} · {session.cell.field}
    </span>)}</span>}
  </div>;
}
