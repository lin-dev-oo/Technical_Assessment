import { useEffect, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type Version = { id: number; postId: number; name: string; email: string; body: string; uploadLabel: string; sessionLabel: string; alternativeId?: number; version: number };
type Review = { accepted: Version; alternatives: Version[]; proposalRevision: number };
const fields = [['postId', 'Post'], ['name', 'Name'], ['email', 'Email'], ['body', 'Comment']] as const;

export function ConflictReview({ id, revision, onClose, onResolved, onRefresh }: { id: number; revision: number; onClose: () => void; onResolved: () => void; onRefresh: () => void }) {
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const [review, setReview] = useState<Review>();
  const latestReview = useRef<Review>(undefined);
  const [selected, setSelected] = useState<'accepted' | number>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (saving) return;
    const controller = new AbortController();
    let current = true;
    if (!latestReview.current) { setLoading(true); setError(''); }
    fetch(`/api/comments/${id}/review`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Review>; })
      .then(result => {
        if (!current) return;
        const previous = latestReview.current;
        if (previous && (previous.accepted.version !== result.accepted.version || previous.proposalRevision !== result.proposalRevision)) {
          setSelected(undefined); setStale(true);
        }
        latestReview.current = result;
        setReview(result); setError(previous => previous.startsWith('Could not load') ? '' : previous);
      })
      .catch(() => { if (current) setError('Could not load the versions. Try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [id, reload, revision, saving]);
  async function resolve() {
    if (!review || selected === undefined || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/comments/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selected, expectedVersion: review.accepted.version, expectedProposalRevision: review.proposalRevision }) });
      const result = await response.json();
      if (response.status === 409 && result.status === 'stale_review') {
        latestReview.current = result.review; setReview(result.review); setSelected(undefined); setStale(true); onRefresh();
      } else if (!response.ok) throw new Error();
      else onResolved();
    } catch { setError('Resolution not confirmed. Check the connection and try again.'); }
    finally { setSaving(false); }
  }
  const versions = review ? [review.accepted, ...review.alternatives] : [];
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else document.getElementById('collection-title')?.focus(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
    <div className="review-heading"><DialogTitle>Review comment #{id}</DialogTitle><DialogDescription>Compare versions and choose one complete version to keep.</DialogDescription></div>
    {loading ? <div className="review-loading" role="status"><RefreshCw className="animate-spin" size={18}/>Loading versions…</div> : <>
      {stale && <p className="review-notice" role="alert">This review changed. Compare the current versions and choose again.</p>}
      {error && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div>{error}{error.startsWith('Could not load') && <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Try again</Button>}</div></div>}
      {review && !!review.alternatives.length && <p className="comparison-hint">Scroll sideways to compare versions.</p>}
      {review && !review.alternatives.length ? <p className="review-notice" role="status">There are no pending alternatives. This conflict has already been resolved.</p> : review && <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Version comparison"><table className="comparison-table"><thead><tr><th scope="col">Field</th>{versions.map((version, index) => {
        const value = index === 0 ? 'accepted' : version.alternativeId!;
        const title = index === 0 ? 'Accepted version' : `Pending alternative ${index}`;
        return <th scope="col" key={String(value)} className={selected === value ? 'version-selected' : ''}><label className="version-choice"><input type="radio" name="chosen-version" checked={selected === value} onChange={() => setSelected(value)} disabled={saving} aria-label={title}/><span>{title}</span></label><span className="version-source">{version.uploadLabel} · {version.sessionLabel}</span></th>;
      })}</tr></thead><tbody>{fields.map(([field, label]) => <tr key={field}><th scope="row">{label}</th>{versions.map((version, index) => {
        const changed = index > 0 && version[field] !== review.accepted[field];
        return <td key={index} data-changed={changed} className={selected === (index === 0 ? 'accepted' : version.alternativeId) ? 'version-selected' : ''}>{changed && <span className="changed-label">Changed</span>}<div className="comparison-value">{version[field]}</div></td>;
      })}</tr>)}</tbody></table></div>}
    </>}
    <div className="review-footer"><span>{review && !!review.alternatives.length && `${review.alternatives.length} pending ${review.alternatives.length === 1 ? 'alternative' : 'alternatives'}`}</span><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={loading || saving || selected === undefined || !review?.alternatives.length} onClick={resolve}>{saving ? 'Resolving…' : 'Resolve conflict'}</Button></div>
  </DialogContent></Dialog>;
}
