import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileUp, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { Button } from './components/ui/button';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import { useComments, type Comment } from './hooks/use-comments';
import { CommentEditor } from './components/comment-editor';
import { ConflictReview, type ReviewChoice, type Review } from './components/conflict-review';
import { useRealtime } from './hooks/use-realtime';
import { CellPresence, PresenceSummary, presenceCellStyle } from './components/cell-presence';
import './styles.css';

type Outcome = { status: string; inserted?: number; updated?: number; unchanged?: number; conflicts?: number; conflictIds?: number[]; reviews?: Record<number, Review>; message?: string; errors?: { record?: number; field?: string; message: string }[] };
type Stage = 'idle' | 'transferring' | 'processing' | 'reviewing';
type ImportReview = { id: string; reviews: Record<number, Review>; ready?: boolean };

function App() {
  const [file, setFile] = useState<File>();
  const requestId = useRef('');
  const uploadInFlight = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [activeImport, setActiveImport] = useState<ImportReview>();
  const [rejecting, setRejecting] = useState(false);
  const [applyingImport, setApplyingImport] = useState(false);
  const { query, setQuery, page, setPage, pageSize, setPageSize, data, loading, loadError, hasComments, refresh, searching, resultsOutdated } = useComments();
  const { connection, revision, presence, sessionLabel } = useRealtime(refresh);
  const [reviewQueue, setReviewQueue] = useState<number[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [completedReviews, setCompletedReviews] = useState<number[]>([]);
  const reviewChoices = useRef(new Map<number, ReviewChoice>());
  const reviewId = reviewQueue[reviewIndex];
  const currentReviewId = useRef<number | undefined>(reviewId);
  currentReviewId.current = reviewId;
  const [editing, setEditing] = useState<Comment>();
  const [expanded, setExpanded] = useState<number>();
  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => setPageInput(String(page)), [page]);
  const busy = stage !== 'idle';
  useEffect(() => {
    if (loadError) toast.error('Could not load the latest results.', { id: 'load-error', description: data ? 'Previously loaded results may be outdated.' : undefined, action: { label: 'Retry', onClick: refresh }, duration: Infinity });
    else toast.dismiss('load-error');
  }, [loadError, refresh]);
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
  function finishEditing() {
    const id = editing?.id; setEditing(undefined);
    requestAnimationFrame(() => (document.getElementById(`edit-record-${id}`) ?? document.getElementById('collection-title'))?.focus());
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
  const visibleComments = data?.comments ?? [];
  const displayedComments = editing && !visibleComments.some(comment => comment.id === editing.id) ? [editing, ...visibleComments] : visibleComments;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  function jumpToPage() {
    const requested = Number(pageInput);
    if (!/^\d+$/.test(pageInput) || requested < 1 || requested > pages) { setPageInput(String(page)); toast.error(`Enter a page from 1 to ${pages}.`); return; }
    setPageInput(String(requested));
    if (requested !== page) setPage(requested);
  }
  return <><main className={hasComments ? 'comments-screen' : 'upload-screen'}>
    <input ref={input} className="sr-only" tabIndex={-1} id="csv-file" aria-label="Choose CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
    {hasComments ? <section className="collection" aria-labelledby="collection-title">
      <div className="collection-heading"><div className="title-line"><h1 id="collection-title" tabIndex={-1}>Dataset</h1><span className="count-badge">{data?.datasetTotal.toLocaleString()}</span></div><div className="collection-actions">{!!data?.conflictIds.length && <Button variant="outline" size="sm" onClick={() => startReview(data.conflictIds)}>Review conflicts ({data.conflictIds.length})</Button>}<Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh</Button><Button size="sm" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16}/>Upload CSV</Button></div></div>
      <p className="connection-status" role="status" data-connection={connection}>{connection === 'connected' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting live updates…' : 'Live updates disconnected. Reconnecting…'}</p><PresenceSummary sessions={presence} sessionLabel={sessionLabel}/><div className="search-toolbar">
        <div className="search-field"><Search size={16} aria-hidden="true"/><Input ref={searchInput} type="text" role="searchbox" aria-label="Search all fields" placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <Button className="search-clear" variant="ghost" size="icon" aria-label="Clear search" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={14}/></Button>}</div>
        <span className="search-status" role="status">{loadError ? 'Results unavailable' : loading ? (searching ? 'Searching…' : 'Refreshing…') : query ? `${data?.total ?? 0} ${data?.total === 1 ? 'result' : 'results'}` : ''}</span>
      </div>
          <p id="edit-scroll-hint" className="edit-scroll-hint">{editing ? 'Scroll across the table to edit fields and reach Save / Cancel.' : 'Scroll across the table to view all fields. Row actions stay on the right.'}</p>{editing && <p id="edit-instructions" className="edit-instructions" role="status">Save or cancel the current edit before editing another record.</p>}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accepted records table" aria-describedby="edit-scroll-hint" aria-busy={loading}><table className="accepted-table"><thead><tr><th scope="col">id</th><th scope="col">postId</th><th scope="col">name</th><th scope="col">email</th><th scope="col">body</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{displayedComments.map(comment => <React.Fragment key={comment.id}>{editing?.id === comment.id ? <CommentEditor presence={presence} revision={revision} initial={editing} current={visibleComments.find(row => row.id === editing.id)} retained={!visibleComments.some(row => row.id === editing.id)} sessionLabel={sessionLabel} onCancel={finishEditing} onSaved={() => { finishEditing(); refresh(); }} onReview={() => startReview([editing.id])}/> : <tr><td className="identifier">#{comment.id}</td><td className="post-id" style={presenceCellStyle(presence, comment.id, 'postId')}>{comment.postId}<CellPresence sessions={presence} commentId={comment.id} field="postId"/></td><td style={presenceCellStyle(presence, comment.id, 'name')}><div className="person-name">{comment.name}</div><CellPresence sessions={presence} commentId={comment.id} field="name"/></td><td style={presenceCellStyle(presence, comment.id, 'email')}><div className="email">{comment.email}</div><CellPresence sessions={presence} commentId={comment.id} field="email"/></td><td style={presenceCellStyle(presence, comment.id, 'body')}><p className="body-preview">{comment.body}</p><CellPresence sessions={presence} commentId={comment.id} field="body"/></td><td><Button variant="ghost" size="sm" id={`edit-record-${comment.id}`} disabled={comment.pendingCount > 0 || Boolean(editing)} aria-describedby={editing ? 'edit-instructions' : undefined} title={comment.pendingCount > 0 ? 'Resolve pending conflicts before editing.' : editing ? 'Save or cancel the current edit first.' : undefined} aria-label={`Edit record ${comment.id}`} onClick={() => setEditing(comment)}>Edit</Button><Button variant="ghost" size="icon" aria-label={`${expanded === comment.id ? 'Close' : 'Read'} record ${comment.id}`} aria-expanded={expanded === comment.id} onClick={() => setExpanded(expanded === comment.id ? undefined : comment.id)}>{expanded === comment.id ? <X size={16}/> : <ChevronDown size={16}/>}</Button></td></tr>}{editing?.id !== comment.id && expanded === comment.id && <tr className="expanded-row"><td colSpan={6}><div className="expanded-content"><span className="section-number">Record #{comment.id}</span><h3>{comment.name}</h3><p className="expanded-email">{comment.email}</p><p className="full-body">{comment.body}</p></div></td></tr>}</React.Fragment>)}</tbody></table></div>
          {data?.total === 0 && !loading && !loadError && <div className="empty-results"><strong>No records found</strong><p>Try another search or clear the search.</p></div>}
          <div className="pagination"><span>{data && `${data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString()} ${query ? 'matching records' : 'records'}${resultsOutdated ? ' (previous results)' : ''}`}</span><div className="page-controls"><label htmlFor="page-size">Rows per page</label><select id="page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); }}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select><Button variant="outline" size="icon" aria-label="First page" disabled={page <= 1 || loading} onClick={() => setPage(1)}><ChevronsLeft size={16}/></Button><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><label className="page-jump">Page<Input aria-label="Go to page" inputMode="numeric" value={pageInput} disabled={loading || !data?.total} onChange={event => setPageInput(event.target.value)} onBlur={jumpToPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); jumpToPage(); } if (event.key === 'Escape') setPageInput(String(page)); }}/><span>of {pages}</span></label><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button><Button variant="outline" size="icon" aria-label="Last page" disabled={page >= pages || loading} onClick={() => setPage(pages)}><ChevronsRight size={16}/></Button></div></div>
    </section> : <div className="upload-entry">
      {loading && !data ? <div className="loading-state" role="status"><RefreshCw className="animate-spin" size={20}/><span>Loading records…</span></div> : loadError ? <div className="entry-error"><Button variant="outline" onClick={refresh}>Try again</Button></div> : <>
        <Button disabled={busy} onClick={() => input.current?.click()}><FileUp size={18}/>Upload CSV</Button>
      </>}
    </div>}
    {reviewId !== undefined && <ConflictReview key={reviewId} id={reviewId} revision={revision} providedReview={activeImport?.reviews[reviewId]} onStageChoice={activeImport ? advanceReview : undefined} applyReady={reviewQueue.every(id => id === reviewId || completedReviews.includes(id))} externalBusy={rejecting || applyingImport} choiceCache={reviewChoices.current} progress={reviewQueue.length > 1 ? { current: reviewIndex + 1, total: reviewQueue.length, onPrevious: () => setReviewIndex(value => value - 1), onNext: () => setReviewIndex(value => value + 1) } : undefined} onClose={() => { void closeReview(); }} onRefresh={refresh} onContinue={advanceReview} onResolved={advanceReview}/>}
    {activeImport?.ready && <Dialog open onOpenChange={open => { if (!open && !applyingImport && !rejecting) void closeReview(); }}><DialogContent className="conflict-dialog" closeDisabled={applyingImport || rejecting} onEscapeKeyDown={event => { if (applyingImport || rejecting) event.preventDefault(); }} onPointerDownOutside={event => { if (applyingImport || rejecting) event.preventDefault(); }}><div className="review-heading"><DialogTitle>Apply upload</DialogTitle><DialogDescription className="sr-only">No conflicts remain. Apply or reject the upload.</DialogDescription></div><p className="comparison-empty">No conflicts remain.</p><div className="review-footer"><Button variant="outline" disabled={applyingImport || rejecting} onClick={() => { void closeReview(); }}>Reject upload</Button><Button disabled={applyingImport || rejecting} onClick={() => { void advanceReview().catch(() => {}); }}>{applyingImport ? 'Applying…' : 'Apply upload'}</Button></div></DialogContent></Dialog>}
  </main><Toaster/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
