import { useRef, useState } from 'react';
import type { Comment } from '../hooks/use-comments';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export type DraftValues = { postId: string; name: string; email: string; body: string };
const fields = ['postId', 'name', 'email', 'body'] as const;

export function EditComparison({ draft, current, onClose, onKeep, required = false, busy = false }: { draft: DraftValues; current: Comment; onClose: () => void; onKeep: (replace: boolean) => void; required?: boolean; busy?: boolean }) {
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const [showAll, setShowAll] = useState(false);
  const changed = fields.filter(field => draft[field] !== String(current[field]));
  const visible = showAll ? fields : changed;
  return <Dialog open onOpenChange={open => { if (!open && !required && !busy) onClose(); }}><DialogContent showClose={!required} closeDisabled={busy} onEscapeKeyDown={event => { if (required || busy) event.preventDefault(); }} onPointerDownOutside={event => { if (required || busy) event.preventDefault(); }} className="conflict-dialog edit-comparison-dialog" onCloseAutoFocus={event => {
    event.preventDefault();
    if (trigger.current?.isConnected) trigger.current.focus();
    else document.getElementById(`edit-${current.id}-body`)?.focus();
  }}>
    <div className="review-heading"><DialogTitle>{required ? 'Resolve edit conflict' : 'Review changes'}</DialogTitle><DialogDescription className="sr-only">Compare your draft with the current version. Nothing is saved yet.</DialogDescription></div>
    <div className="review-body">
      <div className="comparison-toolbar"><span>{changed.length} {changed.length === 1 ? 'difference' : 'differences'}</span>{changed.length < fields.length && <Button variant="outline" size="sm" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Changes only' : 'All fields'}</Button>}</div>
      {!changed.length && <p className="comparison-empty">Your draft matches the current version.</p>}
      {!!visible.length && <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Draft comparison"><table className="comparison-table"><thead><tr><th scope="col">Field</th><th scope="col">Current version</th><th scope="col">{required ? 'Your version' : 'Your draft'}</th></tr></thead><tbody>{visible.map(field => <tr key={field}>
        <th scope="row">{field}</th><td data-version="Current version"><div className="comparison-value">{current[field]}</div></td><td data-version={required ? 'Your version' : 'Your draft'} data-changed={draft[field] !== String(current[field])}><div className="comparison-value">{draft[field]}</div></td>
      </tr>)}</tbody></table></div>}
    </div>
    <p className="edit-comparison-caption">{required ? 'Choose which version to keep.' : 'Nothing is saved yet.'}</p>
    <div className="review-footer">{!required && <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>}{(required || !!changed.length) && <Button variant="outline" disabled={busy} onClick={() => onKeep(true)}>{required ? 'Use current version' : 'Use current values'}</Button>}<Button disabled={busy} onClick={() => onKeep(false)}>{busy ? 'Saving…' : required ? 'Use my version' : changed.length ? 'Keep my changes' : 'Continue editing'}</Button></div>
  </DialogContent></Dialog>;
}
