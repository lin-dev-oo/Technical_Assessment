import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileUp, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from './components/ui/sonner';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useComments, type Comment } from './hooks/use-comments';
import { CommentEditor } from './components/comment-editor';
import { useImportWorkflow } from './hooks/use-import-workflow';
import { useRealtime } from './hooks/use-realtime';
import { CellPresence, PresenceSummary, presenceCellStyle } from './components/cell-presence';
import './styles.css';

function App() {
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const { query, setQuery, page, setPage, pageSize, setPageSize, data, loading, loadError, hasComments, refresh, searching, resultsOutdated } = useComments();
  const { connection, revision, presence, sessionLabel } = useRealtime(refresh);
  const { busy, choose, openReview, reviewDialog } = useImportWorkflow({ revision, sessionLabel, refresh });
  const [editing, setEditing] = useState<Comment>();
  const [expanded, setExpanded] = useState<number>();
  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => setPageInput(String(page)), [page]);
  useEffect(() => {
    if (loadError) toast.error('Could not load the latest results.', { id: 'load-error', description: data ? 'Previously loaded results may be outdated.' : undefined, action: { label: 'Retry', onClick: refresh }, duration: Infinity });
    else toast.dismiss('load-error');
  }, [loadError, refresh]);
  function finishEditing() {
    const id = editing?.id; setEditing(undefined);
    requestAnimationFrame(() => (document.getElementById(`edit-record-${id}`) ?? document.getElementById('collection-title'))?.focus());
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
      <div className="collection-heading"><div className="title-line"><h1 id="collection-title" tabIndex={-1}>Dataset</h1><span className="count-badge">{data?.datasetTotal.toLocaleString()}</span></div><div className="collection-actions">{!!data?.conflictIds.length && <Button variant="outline" size="sm" onClick={() => openReview(data.conflictIds)}>Review conflicts ({data.conflictIds.length})</Button>}<Button variant="outline" size="sm" disabled={loading} onClick={refresh}><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>Refresh</Button><Button size="sm" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16}/>Upload CSV</Button></div></div>
      <p className="connection-status" role="status" data-connection={connection}>{connection === 'connected' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting live updates…' : 'Live updates disconnected. Reconnecting…'}</p><PresenceSummary sessions={presence} sessionLabel={sessionLabel}/><div className="search-toolbar">
        <div className="search-field"><Search size={16} aria-hidden="true"/><Input ref={searchInput} type="text" role="searchbox" aria-label="Search all fields" placeholder="Search…" value={query} onChange={event => setQuery(event.target.value)}/>{query && <Button className="search-clear" variant="ghost" size="icon" aria-label="Clear search" onClick={() => { setQuery(''); searchInput.current?.focus(); }}><X size={14}/></Button>}</div>
        <span className="search-status" role="status">{loadError ? 'Results unavailable' : loading ? (searching ? 'Searching…' : 'Refreshing…') : query ? `${data?.total ?? 0} ${data?.total === 1 ? 'result' : 'results'}` : ''}</span>
      </div>
          <p id="edit-scroll-hint" className="edit-scroll-hint">{editing ? 'Scroll across the table to edit fields and reach Save / Cancel.' : 'Scroll across the table to view all fields. Row actions stay on the right.'}</p>{editing && <p id="edit-instructions" className="edit-instructions" role="status">Save or cancel the current edit before editing another record.</p>}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Accepted records table" aria-describedby="edit-scroll-hint" aria-busy={loading}><table className="accepted-table"><thead><tr><th scope="col">id</th><th scope="col">postId</th><th scope="col">name</th><th scope="col">email</th><th scope="col">body</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{displayedComments.map(comment => <React.Fragment key={comment.id}>{editing?.id === comment.id ? <CommentEditor presence={presence} revision={revision} initial={editing} current={visibleComments.find(row => row.id === editing.id)} retained={!visibleComments.some(row => row.id === editing.id)} sessionLabel={sessionLabel} onCancel={finishEditing} onSaved={() => { finishEditing(); refresh(); }} onReview={() => openReview([editing.id])}/> : <tr><td className="identifier">#{comment.id}</td><td className="post-id" style={presenceCellStyle(presence, comment.id, 'postId')}>{comment.postId}<CellPresence sessions={presence} commentId={comment.id} field="postId"/></td><td style={presenceCellStyle(presence, comment.id, 'name')}><div className="person-name">{comment.name}</div><CellPresence sessions={presence} commentId={comment.id} field="name"/></td><td style={presenceCellStyle(presence, comment.id, 'email')}><div className="email">{comment.email}</div><CellPresence sessions={presence} commentId={comment.id} field="email"/></td><td style={presenceCellStyle(presence, comment.id, 'body')}><p className="body-preview">{comment.body}</p><CellPresence sessions={presence} commentId={comment.id} field="body"/></td><td><Button variant="ghost" size="sm" id={`edit-record-${comment.id}`} disabled={comment.pendingCount > 0 || Boolean(editing)} aria-describedby={editing ? 'edit-instructions' : undefined} title={comment.pendingCount > 0 ? 'Resolve pending conflicts before editing.' : editing ? 'Save or cancel the current edit first.' : undefined} aria-label={`Edit record ${comment.id}`} onClick={() => setEditing(comment)}>Edit</Button><Button variant="ghost" size="icon" aria-label={`${expanded === comment.id ? 'Close' : 'Read'} record ${comment.id}`} aria-expanded={expanded === comment.id} onClick={() => setExpanded(expanded === comment.id ? undefined : comment.id)}>{expanded === comment.id ? <X size={16}/> : <ChevronDown size={16}/>}</Button></td></tr>}{editing?.id !== comment.id && expanded === comment.id && <tr className="expanded-row"><td colSpan={6}><div className="expanded-content"><span className="section-number">Record #{comment.id}</span><h3>{comment.name}</h3><p className="expanded-email">{comment.email}</p><p className="full-body">{comment.body}</p></div></td></tr>}</React.Fragment>)}</tbody></table></div>
          {data?.total === 0 && !loading && !loadError && <div className="empty-results"><strong>No records found</strong><p>Try another search or clear the search.</p></div>}
          <div className="pagination"><span>{data && `${data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total.toLocaleString()} ${query ? 'matching records' : 'records'}${resultsOutdated ? ' (previous results)' : ''}`}</span><div className="page-controls"><label htmlFor="page-size">Rows per page</label><select id="page-size" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); }}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select><Button variant="outline" size="icon" aria-label="First page" disabled={page <= 1 || loading} onClick={() => setPage(1)}><ChevronsLeft size={16}/></Button><Button variant="outline" size="icon" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></Button><label className="page-jump">Page<Input aria-label="Go to page" inputMode="numeric" value={pageInput} disabled={loading || !data?.total} onChange={event => setPageInput(event.target.value)} onBlur={jumpToPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); jumpToPage(); } if (event.key === 'Escape') setPageInput(String(page)); }}/><span>of {pages}</span></label><Button variant="outline" size="icon" aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></Button><Button variant="outline" size="icon" aria-label="Last page" disabled={page >= pages || loading} onClick={() => setPage(pages)}><ChevronsRight size={16}/></Button></div></div>
    </section> : <div className="upload-entry">
      {loading && !data ? <div className="loading-state" role="status"><RefreshCw className="animate-spin" size={20}/><span>Loading records…</span></div> : loadError ? <div className="entry-error"><Button variant="outline" onClick={refresh}>Try again</Button></div> : <>
        <Button disabled={busy} onClick={() => input.current?.click()}><FileUp size={18}/>Upload CSV</Button>
      </>}
    </div>}
    {reviewDialog}
  </main><Toaster/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
