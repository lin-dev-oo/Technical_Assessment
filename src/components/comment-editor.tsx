import { useEffect, useState } from 'react';
import type { Comment } from '../hooks/use-comments';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { EditComparison } from './edit-comparison';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CellPresence, presenceCellStyle } from './cell-presence';
import type { Presence } from '../hooks/use-realtime';

type Review = { accepted: Comment; alternatives: unknown[]; proposalRevision: number };
const fields = [['postId', 'postId'], ['name', 'name'], ['email', 'email'], ['body', 'body']] as const;

export function CommentEditor({ initial, current, retained, sessionLabel, revision, presence, onCancel, onSaved, onReview }: {
  initial: Comment; current?: Comment; retained?: boolean; sessionLabel: string; revision: number;
  presence: Presence[];
  onCancel: () => void; onSaved: () => void; onReview: () => void;
}) {
  const [draft, setDraft] = useState({ postId: String(initial.postId), name: initial.name, email: initial.email, body: initial.body });
  const [baseline, setBaseline] = useState(initial);
  const [review, setReview] = useState<Review>();
  const [remote, setRemote] = useState<Review>();
  const [comparing, setComparing] = useState(false);
  const [requiredChoice, setRequiredChoice] = useState(false);
  const notifyError = (message: string) => toast.error(message, { id: `edit-${initial.id}` });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [needsBaseline, setNeedsBaseline] = useState(false);
  const snapshots = [baseline, current, ...[review, remote].map(item => item && ({ ...item.accepted, proposalRevision: item.proposalRevision, pendingCount: item.alternatives.length }))];
  const accepted = snapshots.reduce<Comment>((latest, item) => item && item.version >= latest.version ? item : latest, baseline);
  const proposals = snapshots.reduce<Comment>((latest, item) => item && item.proposalRevision >= latest.proposalRevision ? item : latest, baseline);
  const conflicted = proposals.pendingCount > 0;
  const stale = accepted.version !== baseline.version || conflicted || Boolean(review) || needsBaseline;
  useEffect(() => {
    if (accepted.version > baseline.version || proposals.proposalRevision > baseline.proposalRevision) setNeedsBaseline(true);
  }, [accepted.version, proposals.proposalRevision, baseline.version, baseline.proposalRevision]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/comments/${initial.id}/review`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Review>; })
      .then(result => { if (active) setRemote(result); })
      .catch(() => { if (active) notifyError('Could not refresh the record. Your draft is preserved.'); });
    return () => { active = false; controller.abort(); };
  }, [initial.id, revision]);

  const dirty = fields.some(([field]) => draft[field] !== String(baseline[field]));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(expectedVersion = baseline.version, resolving = false) {
    if (busy) return;
    if (stale && !resolving) {
      toast.dismiss(`edit-${initial.id}`);
      if (conflicted) onReview();
      else { setRequiredChoice(true); setComparing(true); }
      return;
    }
    setBusy(true); setFieldErrors({});
    try {
      const response = await fetch(`/api/comments/${initial.id}/edit`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-session-label': sessionLabel },
        body: JSON.stringify({ ...draft, postId: /^\d+$/.test(draft.postId) ? Number(draft.postId) : null, expectedVersion }),
      });
      const result = await response.json();
      if (response.ok) { toast.success('Changes saved', { id: `edit-${initial.id}` }); onSaved(); return; }
      if (response.status === 409 && result.review) {
        toast.dismiss(`edit-${initial.id}`);
        setReview(result.review);
        if (result.status === 'conflicted_edit') onReview();
        else { setRequiredChoice(true); setComparing(true); }
      } else if (response.status === 422) {
        const errors: { field: string; message: string }[] = result.errors;
        setRequiredChoice(false); setComparing(false);
        setFieldErrors(Object.fromEntries(errors.map(item => [item.field, item.message])));
        notifyError('Check the highlighted fields.');
        requestAnimationFrame(() => document.getElementById(`edit-${initial.id}-${errors[0]?.field}`)?.focus());
      } else throw new Error();
    } catch { notifyError('Save not confirmed. Your draft is preserved.'); }
    finally { setBusy(false); }
  }

  function reconcile(replace: boolean) {
    if (conflicted || busy) return;
    if (requiredChoice) {
      if (replace) { toast.success('Current version kept', { id: `edit-${initial.id}` }); onSaved(); }
      else void save(accepted.version, true);
      return;
    }
    const latest = { ...accepted, proposalRevision: proposals.proposalRevision, pendingCount: 0 };
    if (replace) setDraft({ postId: String(latest.postId), name: latest.name, email: latest.email, body: latest.body });
    setBaseline(latest); setReview(undefined); setNeedsBaseline(false); setFieldErrors({}); setComparing(false);
  }

  const formId = `edit-record-${initial.id}`;
  function field(field: keyof typeof draft, label: string) {
    const props = { form: formId, disabled: busy, 'aria-invalid': Boolean(fieldErrors[field]), 'aria-describedby': fieldErrors[field] ? `edit-${initial.id}-${field}-error` : undefined, 'data-active-field': field, 'data-comment-id': initial.id, id: `edit-${initial.id}-${field}`, value: draft[field], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setDraft(value => ({ ...value, [field]: event.target.value })); setFieldErrors(value => { const next = { ...value }; delete next[field]; return next; }); } };
    return <div className="cell-editor"><label className="sr-only" htmlFor={props.id}>{label}</label>{field === 'body'
      ? <textarea {...props}/>
      : <Input {...props} autoFocus={field === 'postId'} inputMode={field === 'postId' ? 'numeric' : field === 'email' ? 'email' : undefined}/>}{fieldErrors[field] && <p className="field-error" id={`edit-${initial.id}-${field}-error`}>{fieldErrors[field]}</p>}<CellPresence sessions={presence} commentId={initial.id} field={field}/></div>;
  }
  return <>
    <tr className="editing-row" aria-label={`Editing record ${initial.id}`}>
      <td className="identifier">#{initial.id}<span className="draft-label">Unsaved draft</span>{retained && <span className="draft-retained">Outside this page/search</span>}</td>
      <td style={presenceCellStyle(presence, initial.id, 'postId')}>{field('postId', 'postId')}</td>
      <td style={presenceCellStyle(presence, initial.id, 'name')}>{field('name', 'name')}</td><td style={presenceCellStyle(presence, initial.id, 'email')}>{field('email', 'email')}</td>
      <td style={presenceCellStyle(presence, initial.id, 'body')}>{field('body', 'body')}</td>
      <td><form id={formId} className="cell-editor-actions" aria-label={`Edit record ${initial.id}`} onSubmit={event => { event.preventDefault(); void save(); }}>
        <Button disabled={busy || conflicted} title={stale ? 'Resolve changes before saving' : undefined} size="sm" type="submit">{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
      </form></td>
    </tr>
    {stale && <tr className="edit-feedback-row"><td colSpan={6}><div className="edit-feedback-content"><div className="edit-state" role="status"><RefreshCw size={15}/><span>{conflicted ? 'This record needs conflict review.' : 'Updated in another session'}</span><Button type="button" variant="outline" size="sm" onClick={() => conflicted ? onReview() : setComparing(true)}>{conflicted ? 'Review conflict' : 'Review changes'}</Button></div></div></td></tr>}
    {comparing && !conflicted && <EditComparison required={requiredChoice} busy={busy} draft={draft} current={accepted} onClose={() => setComparing(false)} onKeep={reconcile}/>}
  </>;
}
