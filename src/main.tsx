import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, ChevronLeft, ChevronRight, FileUp, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { Button } from './components/ui/button';
import { Progress } from './components/ui/progress';
import './styles.css';

type Comment = { id: number; postId: number; name: string; email: string; body: string };
type Page = { comments: Comment[]; total: number; page: number; pageSize: number };
type Outcome = { status: string; inserted?: number; unchanged?: number; message?: string; errors?: { record?: number; field?: string; message: string }[] };
type Stage = 'idle' | 'transferring' | 'processing' | 'completed' | 'rejected' | 'network-error';

function App() {
  const [file, setFile] = useState<File>();
  const requestId = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<Page>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<number>();
  const busy = stage === 'transferring' || stage === 'processing';
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(false);
    fetch(`/api/comments?page=${page}&pageSize=${pageSize}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Page>; })
      .then(result => { setData(result); if (page !== result.page) setPage(result.page); })
      .catch(error => { if (error.name !== 'AbortError') setLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, revision]);
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
    xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.upload.onload = () => { setProgress(100); setStage('processing'); };
    xhr.onload = () => {
      if (xhr.status >= 500) { setStage('network-error'); return; }
      try {
        const result: Outcome = JSON.parse(xhr.responseText); setOutcome(result);
        setStage(xhr.status >= 200 && xhr.status < 300 ? 'completed' : 'rejected');
        if (xhr.status >= 200 && xhr.status < 300) setRevision(value => value + 1);
      } catch { setStage('network-error'); }
    };
    xhr.onerror = () => setStage('network-error');
    xhr.ontimeout = () => setStage('network-error'); xhr.timeout = 120000;
    xhr.send(selected);
  }
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const hasComments = (data?.total ?? 0) > 0;
  const uploadFeedback = <>
    {busy && <div className="upload-status" role="status"><div><strong>{stage === 'transferring' ? 'Uploading CSV' : 'Processing CSV'}</strong><span>{stage === 'transferring' ? `${progress}%` : 'Validating and saving…'}</span></div><Progress value={progress} aria-label="File transfer"/></div>}
    {stage === 'completed' && <div className="feedback success" role="status"><Check size={18}/><div><strong>Upload complete</strong><p>{outcome?.inserted} inserted · {outcome?.unchanged} unchanged</p></div></div>}
    {stage === 'network-error' && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div><strong>Upload not confirmed</strong><p>Check the connection and retry. Retrying will not duplicate a saved upload.</p><Button variant="outline" size="sm" onClick={() => upload()}>Retry upload</Button></div></div>}
    {stage === 'rejected' && <div className="feedback error" role="alert"><TriangleAlert size={18}/><div><strong>Upload rejected</strong><p>{outcome?.message ?? 'Correct the errors and upload the file again. No comments were changed.'}</p>{outcome?.errors && <ul className="error-list">{outcome.errors.map((error, index) => <li key={index}>{error.record ? `Record ${error.record}` : 'File'}{error.field ? ` · ${error.field}` : ''}: {error.message}</li>)}</ul>}</div></div>}
  </>;
  return <main className={hasComments ? 'comments-screen' : 'upload-screen'}>
    <input ref={input} className="sr-only" tabIndex={-1} id="csv-file" aria-label="Choose comments CSV" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}/>
    {hasComments ? <section className="collection" aria-labelledby="collection-title">
      <div className="collection-heading"><div className="title-line"><h1 id="collection-title">Comments</h1><span className="count-badge">{data?.total.toLocaleString()}</span></div><div className="collection-actions"><Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh</Button><Button size="sm" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16}/>Upload CSV</Button></div></div>
      <div className="table-feedback">{uploadFeedback}{loadError && <div className="feedback error" role="alert"><TriangleAlert size={18}/><span>Could not refresh comments. Try again.</span></div>}</div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accepted comments table" aria-busy={loading}><table><thead><tr><th scope="col">ID</th><th scope="col">POST</th><th scope="col">NAME & EMAIL</th><th scope="col">COMMENT</th><th scope="col"><span className="sr-only">Read full comment</span></th></tr></thead><tbody>{data?.comments.map(comment => <React.Fragment key={comment.id}><tr><td className="identifier">#{comment.id}</td><td className="post-id">{comment.postId}</td><td><div className="person-name">{comment.name}</div><div className="email">{comment.email}</div></td><td><p className="body-preview">{comment.body}</p></td><td><Button variant="ghost" size="icon" aria-label={`${expanded === comment.id ? 'Close' : 'Read'} comment ${comment.id}`} aria-expanded={expanded === comment.id} onClick={() => setExpanded(expanded === comment.id ? undefined : comment.id)}>{expanded === comment.id ? <X size={16}/> : <ChevronDown size={16}/>}</Button></td></tr>{expanded === comment.id && <tr className="expanded-row"><td colSpan={5}><div className="expanded-content"><span className="section-number">COMMENT #{comment.id}</span><h3>{comment.name}</h3><p className="expanded-email">{comment.email}</p><p className="full-body">{comment.body}</p></div></td></tr>}</React.Fragment>)}</tbody></table></div>
          <div className="pagination"><span>{data && `${(data.page - 1) * pageSize + 1}–${Math.min(data.page * pageSize, data.total)} of ${data.total.toLocaleString()} comments`}</span><div className="page-controls"><label htmlFor="page-size">Rows per page</label><select id="page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select><span className="page-label">{page} / {pages}</span><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16}/></Button><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(value => value + 1)}><ChevronRight size={16}/></Button></div></div>
    </section> : <div className="upload-entry">
      {loading && !data ? <div className="loading-state" role="status"><RefreshCw className="animate-spin" size={20}/><span>Loading comments…</span></div> : loadError ? <div className="entry-error" role="alert"><p>Could not load comments.</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button></div> : <>
        <Button disabled={busy} onClick={() => input.current?.click()}><FileUp size={18}/>Upload CSV</Button>
        {uploadFeedback}
      </>}
    </div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
