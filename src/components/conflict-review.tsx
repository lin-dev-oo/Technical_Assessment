import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

export type Version = { id: number; postId: number; name: string; email: string; body: string; uploadLabel: string; sessionLabel: string; alternativeId?: number; version: number };
export type ReviewChoice = { selected: 'accepted' | number; version: number; proposalRevision: number };
export type Review = { accepted: Version; alternatives: Version[]; proposalRevision: number };
const fields = [['postId', 'postId'], ['name', 'name'], ['email', 'email'], ['body', 'body']] as const;

export function ConflictReview({ id, revision, onClose, onResolved, onRefresh, onContinue, progress, choiceCache, providedReview, onStageChoice, applyReady, externalBusy = false }: { id: number; revision: number; onClose: () => void; onResolved: () => void; onRefresh: () => void; onContinue?: () => void; progress?: { current: number; total: number; onPrevious: () => void; onNext: () => void }; choiceCache?: Map<number, ReviewChoice>; providedReview?: Review; onStageChoice?: () => Promise<void>; applyReady?: boolean; externalBusy?: boolean }) {
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const [review, setReview] = useState<Review>();
  const latestReview = useRef<Review>(undefined);
  const [selected, setSelected] = useState<'accepted' | number>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [reload, setReload] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const busy = saving || externalBusy;
  useEffect(() => {
    if (saving) return;
    if (providedReview) {
      const previous = latestReview.current;
      if (previous && (previous.accepted.version !== providedReview.accepted.version || previous.proposalRevision !== providedReview.proposalRevision)) setStale(true);
      const cached = choiceCache?.get(id);
      if (cached && cached.version === providedReview.accepted.version && cached.proposalRevision === providedReview.proposalRevision) setSelected(cached.selected);
      else { setSelected(undefined); choiceCache?.delete(id); }
      latestReview.current = providedReview; setReview(providedReview); setLoading(false);
      return;
    }
    const controller = new AbortController();
    let current = true;
    if (!latestReview.current) { setLoading(true); setError(''); }
    fetch(`/api/comments/${id}/review`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Review>; })
      .then(result => {
        if (!current) return;
        const previous = latestReview.current;
        if (previous && (previous.accepted.version !== result.accepted.version || previous.proposalRevision !== result.proposalRevision)) {
          setSelected(undefined); setStale(true); choiceCache?.delete(id);
        }
        const cached = choiceCache?.get(id);
        if (!previous && cached) {
          if (cached.version === result.accepted.version && cached.proposalRevision === result.proposalRevision) setSelected(cached.selected);
          else { choiceCache?.delete(id); setStale(true); }
        }
        latestReview.current = result;
        setReview(result); setError(previous => previous.startsWith('Could not load') ? '' : previous);
      })
      .catch(() => { if (current) setError('Could not load the versions. Try again.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [id, reload, revision, saving, providedReview]);
  async function resolve() {
    if (!review || selected === undefined || busy) return;
    setSaving(true); setError('');
    try {
      if (onStageChoice) { await onStageChoice(); return; }
      const response = await fetch(`/api/comments/${id}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selected, expectedVersion: review.accepted.version, expectedProposalRevision: review.proposalRevision }) });
      const result = await response.json();
      if (response.status === 409 && result.status === 'stale_review') {
        latestReview.current = result.review; setReview(result.review); setSelected(undefined); setStale(true); choiceCache?.delete(id); onRefresh();
      } else if (!response.ok) throw new Error();
      else onResolved();
    } catch { if (!onStageChoice) setError('Resolution not confirmed. Check the connection and try again.'); }
    finally { setSaving(false); }
  }
  const versions = review ? [review.accepted, ...review.alternatives] : [];
  const title = (index: number) => index === 0 ? 'Current version' : `Alternative ${index}`;
  const choice = (version: Version, index: number) => index === 0 ? 'accepted' as const : version.alternativeId!;
  const changedFields = fields.filter(([field]) => review?.alternatives.some(version => version[field] !== review.accepted[field]));
  const visibleFields = showAll ? fields : changedFields;
  const selectedIndex = versions.findIndex((version, index) => choice(version, index) === selected);
  const selectedTitle = selectedIndex >= 0 ? title(selectedIndex) : '';
  function selectVersion(value: 'accepted' | number) {
    setSelected(value);
    if (review) choiceCache?.set(id, { selected: value, version: review.accepted.version, proposalRevision: review.proposalRevision });
  }
  function versionChoice(version: Version, index: number, mobile = false) {
    const value = choice(version, index);
    return <label className="version-choice"><input type="radio" name={mobile ? 'chosen-version-mobile' : 'chosen-version'} checked={selected === value} disabled={busy} onChange={() => selectVersion(value)} aria-label={title(index)}/><span>{title(index)}</span></label>;
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="conflict-dialog" closeDisabled={busy} onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); else document.getElementById('collection-title')?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
    <div className="review-heading"><DialogTitle>Review record #{id}</DialogTitle>{progress && <nav className="review-navigation" aria-label="Conflict navigation"><Button variant="ghost" size="icon" aria-label="Previous conflict" disabled={busy || loading || progress.current <= 1} onClick={progress.onPrevious}><ChevronLeft size={16}/></Button><span className="review-progress">{progress.current} / {progress.total}</span><Button variant="ghost" size="icon" aria-label="Next conflict" disabled={busy || loading || progress.current >= progress.total} onClick={progress.onNext}><ChevronRight size={16}/></Button></nav>}<DialogDescription className="sr-only">Choose a complete version to resolve this conflict.</DialogDescription></div>
    <div className="review-body">
      {loading ? <div className="review-loading" role="status"><RefreshCw className="animate-spin" size={18}/>Loading…</div> : <>
        {stale && <p className="review-notice" role="alert">Versions changed. Review and choose again.</p>}
        {error && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div>{error}{error.startsWith('Could not load') && <Button variant="outline" size="sm" onClick={() => setReload(value => value + 1)}>Retry</Button>}</div></div>}
        {review && !review.alternatives.length ? <p className="review-notice" role="status">Already resolved.</p> : review && <>
          <fieldset className="mobile-version-options" disabled={busy}><legend className="sr-only">Version to keep</legend>{versions.map((version, index) => <div key={index} className="mobile-version-option" data-selected={selected === choice(version, index)}>{versionChoice(version, index, true)}<span className="version-source">{version.uploadLabel} · {version.sessionLabel}</span></div>)}</fieldset>
          <div className="comparison-toolbar"><span>{changedFields.length} changed {changedFields.length === 1 ? 'field' : 'fields'}</span>{changedFields.length < fields.length && <Button variant="outline" size="sm" aria-pressed={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Changes only' : 'All fields'}</Button>}</div>
          <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Version comparison"><table className="comparison-table"><thead><tr><th scope="col">Field</th>{versions.map((version, index) => <th scope="col" key={index} className={selected === choice(version, index) ? 'version-selected' : ''}>{versionChoice(version, index)}<span className="comparison-source">{version.uploadLabel} · {version.sessionLabel}</span></th>)}</tr></thead><tbody>
            {visibleFields.map(([field, label]) => <tr key={field}><th scope="row">{label}</th>{versions.map((version, index) => {
              const changed = index > 0 && version[field] !== review.accepted[field];
              const long = String(version[field]).length > 360;
              return <td key={index} data-version={title(index)} data-changed={changed} className={selected === choice(version, index) ? 'version-selected' : ''}>
                {index > 0 && <span className={changed ? 'changed-label' : 'same-label'}>{changed ? 'Changed' : 'Unchanged'}</span>}
                {long ? <div><p className="long-value-preview">{String(version[field]).slice(0, 160)}…</p><details className="long-comparison"><summary>Show full value</summary><div className="comparison-value">{version[field]}</div></details></div> : <div className="comparison-value">{version[field]}</div>}
              </td>;
            })}</tr>)}
          </tbody></table></div>
          {!visibleFields.length && <p className="review-notice">No differences.</p>}
        </>}
      </>}
    </div>
    {selectedIndex >= 0 && <div className="review-outcome" role="status"><strong>Keep: {selectedTitle}</strong><span>{onStageChoice ? 'No changes saved yet.' : 'Other alternatives will be dismissed.'}</span></div>}
    <div className="review-footer"><Button variant="outline" disabled={busy} onClick={onClose}>{onStageChoice ? 'Reject upload' : 'Cancel'}</Button>{review && !review.alternatives.length ? <Button className="resolve-action" onClick={onContinue ?? onClose}>{progress && progress.current < progress.total ? 'Continue' : 'Done'}</Button> : <Button className="resolve-action" disabled={loading || busy || selected === undefined || !review?.alternatives.length} onClick={resolve}>{busy ? 'Saving…' : onStageChoice ? (applyReady ? 'Apply upload' : 'Confirm choice') : selected === 'accepted' ? 'Keep current version' : selectedIndex > 0 ? `Use alternative ${selectedIndex}` : 'Use selected version'}</Button>}</div>
  </DialogContent></Dialog>;
}
