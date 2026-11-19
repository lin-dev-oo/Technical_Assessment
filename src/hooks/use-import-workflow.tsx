import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { ConflictReview, type ReviewChoice, type Review } from '../components/conflict-review';

type Outcome = { status: string; inserted?: number; updated?: number; unchanged?: number; conflicts?: number; conflictIds?: number[]; reviews?: Record<number, Review>; message?: string; errors?: { record?: number; field?: string; message: string }[] };
type Stage = 'idle' | 'transferring' | 'processing' | 'reviewing';
type ImportReview = { id: string; reviews: Record<number, Review>; ready?: boolean };

// Owns transfer, retry identity, staged decisions and recovery as one workflow.
// Callers select files/open stored reviews and render the returned dialogs.
export function useImportWorkflow({ revision, sessionLabel, refresh }: { revision: number; sessionLabel: string; refresh: () => void }) {
  const [file, setFile] = useState<File>();
  const requestId = useRef('');
  const uploadInFlight = useRef(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [activeImport, setActiveImport] = useState<ImportReview>();
  const [rejecting, setRejecting] = useState(false);
  const [applyingImport, setApplyingImport] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [completedReviews, setCompletedReviews] = useState<number[]>([]);
  const reviewChoices = useRef(new Map<number, ReviewChoice>());
  const reviewId = reviewQueue[reviewIndex];
  const currentReviewId = useRef<number | undefined>(reviewId);
  currentReviewId.current = reviewId;
  const busy = stage !== 'idle';
  useEffect(() => {
    if (!activeImport) return;
    const reject = () => { navigator.sendBeacon(`/api/imports/${activeImport.id}/reject`); };
    window.addEventListener('pagehide', reject);
    return () => window.removeEventListener('pagehide', reject);
  }, [activeImport?.id]);
  useEffect(() => {
    if (!activeImport || applyingImport || rejecting) return;
    const controller = new AbortController();
    let current = true;
    fetch(`/api/imports/${activeImport.id}/refresh`, { method: 'POST', signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Outcome>; })
      .then(result => {
        if (!current) return;
        if (result.status === 'completed') { notifyComplete(result, activeImport.id); resetReview(); return; }
        if (result.status === 'rejected_upload') { resetReview(); return; }
        if (!result.reviews || !result.conflictIds) return;
        const freshReviews = result.reviews;
        const freshIds = result.conflictIds;
        const unchanged = (id: number) => {
          const choice = reviewChoices.current.get(id);
          const fresh = freshReviews[id];
          return Boolean(choice && fresh && choice.version === fresh.accepted.version && choice.proposalRevision === fresh.proposalRevision);
        };
        for (const id of reviewChoices.current.keys()) if (!unchanged(id)) reviewChoices.current.delete(id);
        setCompletedReviews(previous => previous.filter(unchanged));
        const focusedId = currentReviewId.current;
        setReviewQueue(freshIds);
        setReviewIndex(Math.max(0, freshIds.indexOf(focusedId!)));
        setActiveImport({ id: activeImport.id, reviews: freshReviews, ready: freshIds.length === 0 });
      })
      .catch(() => { /* Commit revalidates even if this background refresh fails. */ });
    return () => { current = false; controller.abort(); };
  }, [revision, activeImport?.id, applyingImport, rejecting]);
  function startReview(ids: number[]) {
    if (!ids.length) return;
    reviewChoices.current.clear(); setReviewQueue(ids); setReviewIndex(0); setCompletedReviews([]);
  }
  function resetReview() {
    setReviewQueue([]); setReviewIndex(0); setCompletedReviews([]); reviewChoices.current.clear();
    setActiveImport(undefined); setStage('idle'); uploadInFlight.current = false;
  }
  function notifyComplete(result: Outcome, id = requestId.current, filename = file?.name) {
    toast.success('Upload complete', { id: `upload-${id}`, description: <><span>{filename}</span><p>{result.inserted ?? 0} inserted · {result.updated ?? 0} updated · {result.unchanged ?? 0} unchanged</p></>, duration: 6000 });
    refresh();
  }
  async function closeReview() {
    if (!activeImport) { resetReview(); return; }
    if (rejecting || applyingImport) return;
    setRejecting(true);
    try {
      const response = await fetch(`/api/imports/${activeImport.id}/reject`, { method: 'POST' });
      if (!response.ok) throw new Error();
      const result: Outcome = await response.json();
      if (result.status === 'completed') notifyComplete(result, activeImport.id);
      else toast('Upload rejected', { description: 'No records were changed.' });
      resetReview();
    } catch { toast.error('Could not reject the upload.', { description: 'The dataset has not been changed. Try again.' }); }
    finally { setRejecting(false); }
  }
  async function advanceReview() {
    if (applyingImport || rejecting) return;
    const completed = new Set([...completedReviews, ...(reviewId === undefined ? [] : [reviewId])]);
    setCompletedReviews([...completed]);
    if (!activeImport) { refresh(); reviewChoices.current.delete(reviewId); }
    let next = reviewQueue.findIndex((id, index) => index > reviewIndex && !completed.has(id));
    if (next < 0) next = reviewQueue.findIndex(id => !completed.has(id));
    if (next >= 0) { setReviewIndex(next); return; }
    if (!activeImport) { resetReview(); toast.success('Conflict resolved.'); return; }
    setApplyingImport(true);
    try {
      const response = await fetch(`/api/imports/${activeImport.id}/commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choices: reviewQueue.map(id => ({ id, selected: reviewChoices.current.get(id)?.selected, expectedVersion: reviewChoices.current.get(id)?.version, expectedProposalRevision: reviewChoices.current.get(id)?.proposalRevision })) }) });
      const result: Outcome = await response.json();
      if (response.status === 409 && result.reviews && result.conflictIds) {
        reviewChoices.current.clear(); setCompletedReviews([]);
        setReviewQueue(result.conflictIds); setReviewIndex(0);
        setActiveImport({ id: activeImport.id, reviews: result.reviews, ready: result.conflictIds.length === 0 });
        toast.warning('Data changed during review.', { description: 'Review the current versions before applying the upload.' }); return;
      }
      if (!response.ok || result.status !== 'completed') throw new Error();
      notifyComplete(result, activeImport.id); resetReview();
    } catch { toast.error('Upload not confirmed.', { description: 'Your choices are kept. Retry Apply upload.' }); throw new Error('Import not confirmed'); }
    finally { setApplyingImport(false); }
  }
  function choose(next: File | undefined) {
    if (uploadInFlight.current || !next) return;
    setFile(next); requestId.current = crypto.randomUUID(); upload(next, requestId.current);
  }
  function upload(selected = file, id = requestId.current) {
    if (!selected || uploadInFlight.current) return;
    uploadInFlight.current = true; setStage('transferring');
    const toastId = `upload-${id}`;
    const transfer = (percent: number) => toast.loading(`Uploading CSV · ${percent}%`, { id: toastId, description: <div className="toast-progress"><span>{selected.name}</span><Progress value={percent} aria-label="File transfer"/></div> });
    const failed = () => { uploadInFlight.current = false; setStage('idle'); toast.error('Upload not confirmed', { id: toastId, description: 'Check the connection and retry.', duration: Infinity, action: { label: 'Retry upload', onClick: () => upload(selected, id) } }); };
    transfer(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/imports'); xhr.setRequestHeader('Content-Type', 'text/csv'); xhr.setRequestHeader('X-Upload-Id', id);
    xhr.setRequestHeader('X-Upload-Label', encodeURIComponent(selected.name)); xhr.setRequestHeader('X-Session-Label', sessionLabel);
    xhr.upload.onprogress = event => { if (event.lengthComputable) transfer(Math.round(event.loaded / event.total * 100)); };
    xhr.upload.onload = () => { setStage('processing'); toast.loading('Processing CSV…', { id: toastId, description: selected.name }); };
    xhr.onload = () => {
      if (xhr.status >= 500) { failed(); return; }
      try {
        const result: Outcome = JSON.parse(xhr.responseText);
        if (result.status === 'review_required' && result.conflictIds?.length && result.reviews) {
          toast.dismiss(toastId); setActiveImport({ id, reviews: result.reviews }); setStage('reviewing'); startReview(result.conflictIds);
        } else if (xhr.status >= 200 && xhr.status < 300 && result.status === 'completed') {
          uploadInFlight.current = false; setStage('idle'); notifyComplete(result, id, selected.name);
        } else {
          uploadInFlight.current = false; setStage('idle');
          toast.error('Upload rejected', { id: toastId, duration: Infinity, description: <div><span>{selected.name}</span><p>{result.message ?? 'No records were changed.'}</p>{result.errors && <ul className="error-list">{result.errors.map((error, index) => <li key={index}>{error.record ? `Record ${error.record}` : 'File'}{error.field ? ` · ${error.field}` : ''}: {error.message}</li>)}</ul>}</div> });
        }
      } catch { failed(); }
    };
    xhr.onerror = failed; xhr.ontimeout = failed; xhr.timeout = 120000; xhr.send(selected);
  }
  const reviewDialog = <>
    {reviewId !== undefined && <ConflictReview key={reviewId} id={reviewId} revision={revision} providedReview={activeImport?.reviews[reviewId]} onStageChoice={activeImport ? advanceReview : undefined} applyReady={reviewQueue.every(id => id === reviewId || completedReviews.includes(id))} externalBusy={rejecting || applyingImport} choiceCache={reviewChoices.current} progress={reviewQueue.length > 1 ? { current: reviewIndex + 1, total: reviewQueue.length, onPrevious: () => setReviewIndex(value => value - 1), onNext: () => setReviewIndex(value => value + 1) } : undefined} onClose={() => { void closeReview(); }} onRefresh={refresh} onContinue={advanceReview} onResolved={advanceReview}/>}
    {activeImport?.ready && <Dialog open onOpenChange={open => { if (!open && !applyingImport && !rejecting) void closeReview(); }}><DialogContent className="conflict-dialog" closeDisabled={applyingImport || rejecting} onEscapeKeyDown={event => { if (applyingImport || rejecting) event.preventDefault(); }} onPointerDownOutside={event => { if (applyingImport || rejecting) event.preventDefault(); }}><div className="review-heading"><DialogTitle>Apply upload</DialogTitle><DialogDescription className="sr-only">No conflicts remain. Apply or reject the upload.</DialogDescription></div><p className="comparison-empty">No conflicts remain.</p><div className="review-footer"><Button variant="outline" disabled={applyingImport || rejecting} onClick={() => { void closeReview(); }}>Reject upload</Button><Button disabled={applyingImport || rejecting} onClick={() => { void advanceReview().catch(() => {}); }}>{applyingImport ? 'Applying…' : 'Apply upload'}</Button></div></DialogContent></Dialog>}
  </>;
  return { busy, choose, openReview: startReview, reviewDialog };
}
