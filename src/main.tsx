import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, ChevronLeft, ChevronRight, FileUp, RefreshCw, Search, TriangleAlert, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { Progress } from './components/ui/progress';
import { Input } from './components/ui/input';
import { useComments, type Comment } from './hooks/use-comments';
import { CommentEditor } from './components/comment-editor';
import { ConflictReview } from './components/conflict-review';
import { useRealtime } from './hooks/use-realtime';
import './styles.css';

type Outcome = { status: string; inserted?: number; unchanged?: number; conflicts?: number; message?: string; errors?: { record?: number; field?: string; message: string }[] };
type Stage = 'idle' | 'transferring' | 'processing' | 'completed' | 'rejected' | 'network-error';

function App() {
  const [file, setFile] = useState<File>();
  const requestId = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>();
  const { query, setQuery, page, setPage, pageSize, setPageSize, data, loading, loadError, hasComments, refresh } = useComments();
  const { connection, revision } = useRealtime(refresh);
  const [reviewId, setReviewId] = useState<number>();
  const [editing, setEditing] = useState<Comment>();
  const [resolved, setResolved] = useState(false);
  const [sessionLabel] = useState(() => {
    const existing = sessionStorage.getItem('comments-session-label');
    if (existing) return existing;
    const label = `Session ${crypto.randomUUID().slice(0, 6)}`;
    sessionStorage.setItem('comments-session-label', label); return label;
  });
  const [expanded, setExpanded] = useState<number>();
  const busy = stage === 'transferring' || stage === 'processing';
  function choose(next: File | undefined) {
    if (busy || !next) return;
    setFile(next); requestId.current = crypto.randomUUID();
    upload(next);
  }
  function upload(selected = file) {
    if (!selected || busy) return;
    setStage('transferring'); setOutcome(undefined); setProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads'); xhr.setRequestHeader('Content-Type', 'text/csv'); xhr.setRequestHeader('X-Upload-Id', requestId.current);
    xhr.setRequestHeader('X-Upload-Label', encodeURIComponent(selected.name)); xhr.setRequestHeader('X-Session-Label', sessionLabel);
    xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.upload.onload = () => { setProgress(100); setStage('processing'); };
    xhr.onload = () => {
      if (xhr.status >= 500) { setStage('network-error'); return; }
      try {
        const result: Outcome = JSON.parse(xhr.responseText); setOutcome(result);
        setStage(xhr.status >= 200 && xhr.status < 300 ? 'completed' : 'rejected');
        if (xhr.status >= 200 && xhr.status < 300) refresh();
      } catch { setStage('network-error'); }
    };
    xhr.onerror = () => setStage('network-error');
    xhr.ontimeout = () => setStage('network-error'); xhr.timeout = 120000;
    xhr.send(selected);
  }
  const visibleComments = data?.comments ?? [];
  const displayedComments = editing && !visibleComments.some(comment => comment.id === editing.id) ? [editing, ...visibleComments] : visibleComments;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const uploadFeedback = <>
    {busy && <div className="upload-status" role="status"><div><strong>{stage === 'transferring' ? 'Uploading CSV' : 'Processing CSV'}</strong><span>{stage === 'transferring' ? `${progress}%` : 'Validating and saving…'}</span></div><Progress value={progress} aria-label="File transfer"/></div>}
    {stage === 'completed' && <div className="feedback success" role="status"><Check size={18}/><div><strong>Upload complete</strong><p>{outcome?.inserted} inserted · {outcome?.unchanged} unchanged · {outcome?.conflicts ?? 0} pending {(outcome?.conflicts ?? 0) === 1 ? 'conflict' : 'conflicts'}</p></div></div>}
    {stage === 'network-error' && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div><strong>Upload not confirmed</strong><p>Check the connection and retry. Retrying will not duplicate a saved upload.</p><Button variant="outline" size="sm" onClick={() => upload()}>Retry upload</Button></div></div>}
    {stage === 'rejected' && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div><strong>Upload rejected</strong><p>{outcome?.message ?? 'Correct the errors and upload the file again. No comments were changed.'}</p>{outcome?.errors && <ul className="error-list">{outcome.errors.map((error, index) => <li key={index}>{error.record ? `Record ${error.record}` : 'File'}{error.field ? ` · ${error.field}` : ''}: {error.message}</li>)}</ul>}</div></div>}
  </>;
  return <main className={hasComments ? 'comments-screen' : 'upload-screen'}>
    <input ref={input} className="sr-only" tabIndex={-1} id="csv-file" aria-label="Choose comments CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
    {hasComments ? <section className="collection" aria-labelledby="collection-title">
      <div className="collection-heading"><div className="title-line"><h1 id="collection-title" tabIndex={-1}>Comments</h1><span className="count-badge">{data?.total.toLocaleString()}</span></div><div className="collection-actions"><Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh</Button><Button size="sm" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16}/>Upload CSV</Button></div></div>
      <p className="connection-status" role="status" data-connection={connection}>{connection === 'connected' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting live updates…' : 'Live updates disconnected. Reconnecting…'}</p><div className="search-toolbar">
        <div className="search-field"><Search size={16} aria-hidden="true"/><Input type="search" aria-label="Search comments" placeholder="Search comments…" value={query} onChange={event => setQuery(event.target.value)}/></div>
        {query && <Button variant="ghost" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
        <span className="search-status" role="status">{loading ? 'Searching…' : query ? `${data?.total ?? 0} ${data?.total === 1 ? 'result' : 'results'}` : ''}</span>
      </div>
      <div className="table-feedback">{uploadFeedback}{resolved && <div className="feedback success" role="status"><Check size={18}/><span>Conflict resolved.</span></div>}{loadError && <div className="feedback error" role="alert"><TriangleAlert size={18}/><span>Could not refresh comments. Try again.</span></div>}</div>
          {editing && <p id="edit-scroll-hint" className="edit-scroll-hint">Scroll across the table to edit fields and reach Save / Cancel.</p>}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accepted comments table" aria-describedby={editing ? 'edit-scroll-hint' : undefined} aria-busy={loading}><table className="accepted-table"><thead><tr><th scope="col">ID</th><th scope="col">POST</th><th scope="col">NAME</th><th scope="col">EMAIL</th><th scope="col">COMMENT</th><th scope="col"><span className="sr-only">Read full comment</span></th></tr></thead><tbody>{displayedComments.map(comment => <React.Fragment key={comment.id}>{editing?.id === comment.id ? <CommentEditor revision={revision} initial={editing} current={visibleComments.find(row => row.id === editing.id)} retained={!visibleComments.some(row => row.id === editing.id)} sessionLabel={sessionLabel} onCancel={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh(); }} onReview={() => setReviewId(editing.id)}/> : <tr><td className="identifier">#{comment.id}{comment.pendingCount > 0 && <Button variant="outline" size="sm" className="conflict-button" aria-label={`Review conflict for comment ${comment.id}`} onClick={() => { setResolved(false); setReviewId(comment.id); }}><TriangleAlert size={12}/>{comment.pendingCount} pending</Button>}</td><td className="post-id">{comment.postId}</td><td><div className="person-name">{comment.name}</div></td><td><div className="email">{comment.email}</div></td><td><p className="body-preview">{comment.body}</p></td><td><Button variant="ghost" size="sm" disabled={comment.pendingCount > 0 || Boolean(editing)} aria-label={`Edit comment ${comment.id}`} onClick={() => setEditing(comment)}>Edit</Button><Button variant="ghost" size="icon" aria-label={`${expanded === comment.id ? 'Close' : 'Read'} comment ${comment.id}`} aria-expanded={expanded === comment.id} onClick={() => setExpanded(expanded === comment.id ? undefined : comment.id)}>{expanded === comment.id ? <X size={16}/> : <ChevronDown size={16}/>}</Button></td></tr>}{editing?.id !== comment.id && expanded === comment.id && <tr className="expanded-row"><td colSpan={6}><div className="expanded-content"><span className="section-number">COMMENT #{comment.id}</span><h3>{comment.name}</h3><p className="expanded-email">{comment.email}</p><p className="full-body">{comment.body}</p></div></td></tr>}</React.Fragment>)}</tbody></table></div>
          {data?.total === 0 && !loading && <div className="empty-results"><strong>No comments found</strong><p>Try another search or clear the search.</p></div>}
          <div className="pagination"><span>{data && `${data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString()} comments`}</span><div className="page-controls"><label htmlFor="page-size">Rows per page</label><select id="page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); }}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select><span className="page-label">{page} / {pages}</span><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button></div></div>
    </section> : <div className="upload-entry">
      {loading && !data ? <div className="loading-state" role="status"><RefreshCw className="animate-spin" size={20}/><span>Loading comments…</span></div> : loadError ? <div className="entry-error" role="alert"><p>Could not load comments.</p><Button variant="outline" onClick={refresh}>Try again</Button></div> : <>
        <Button disabled={busy} onClick={() => input.current?.click()}><FileUp size={18}/>Upload CSV</Button>
        {uploadFeedback}
      </>}
    </div>}
    {reviewId !== undefined && <ConflictReview key={reviewId} id={reviewId} revision={revision} onClose={() => setReviewId(undefined)} onRefresh={refresh} onResolved={() => { setReviewId(undefined); setResolved(true); refresh(); }}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
