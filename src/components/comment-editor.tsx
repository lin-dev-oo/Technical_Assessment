import { useEffect, useState } from 'react';
import type { Comment } from '../hooks/use-comments';
import { Button } from './ui/button';
import { Input } from './ui/input';

type Review = { accepted: Comment; alternatives: unknown[] };
const fields = [['postId', 'Post ID'], ['name', 'Name'], ['email', 'Email'], ['body', 'Body']] as const;

export function CommentEditor({ initial, current, retained, sessionLabel, onCancel, onSaved, onReview }: {
  initial: Comment; current?: Comment; retained?: boolean; sessionLabel: string;
  onCancel: () => void; onSaved: () => void; onReview: () => void;
}) {
  const [draft, setDraft] = useState({ postId: String(initial.postId), name: initial.name, email: initial.email, body: initial.body });
  const [baseline, setBaseline] = useState(initial);
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [needsBaseline, setNeedsBaseline] = useState(false);
  const accepted = [baseline, current, review?.accepted].reduce<Comment>((latest, item) => item && item.version >= latest.version ? item : latest, baseline);
  const conflicted = Boolean(current?.pendingCount || review?.alternatives.length);
  const stale = accepted.version !== baseline.version || conflicted || Boolean(review) || needsBaseline;
  useEffect(() => {
    if (current && (current.pendingCount > 0 || current.version > baseline.version)) setNeedsBaseline(true);
  }, [current?.pendingCount, current?.version, baseline.version]);

  async function save() {
    if (busy || stale) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/comments/${initial.id}/edit`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-session-label': sessionLabel },
        body: JSON.stringify({ ...draft, postId: /^\d+$/.test(draft.postId) ? Number(draft.postId) : null, expectedVersion: baseline.version }),
      });
      const result = await response.json();
      if (response.ok) { onSaved(); return; }
      if (response.status === 409 && result.review) {
        setReview(result.review);
        setError(result.status === 'conflicted_edit' ? 'A pending conflict arrived. Review and resolve it before saving your draft.' : 'This comment changed. Compare the current accepted version with your draft before retrying.');
      } else if (response.status === 422) {
        setError(result.errors.map((item: { field: string; message: string }) => `${item.field}: ${item.message}`).join(' '));
      } else throw new Error();
    } catch { setError('Save not confirmed. Check the connection and retry. Your draft is preserved.'); }
    finally { setBusy(false); }
  }

  async function updateBaseline() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/comments/${initial.id}/review`);
      if (!response.ok) throw new Error();
      const result: Review = await response.json();
      setReview(result);
      if (result.alternatives.length) { setError('Resolve the pending conflict before using the current accepted version.'); return; }
      setBaseline({ ...result.accepted, pendingCount: 0 }); setReview(undefined); setNeedsBaseline(false);
    } catch { setError('Could not refresh the accepted version. Check the connection and try again. Your draft is preserved.'); }
    finally { setBusy(false); }
  }

  const formId = `edit-comment-${initial.id}`;
  function field(field: keyof typeof draft, label: string) {
    const props = { form: formId, disabled: busy, id: `edit-${initial.id}-${field}`, value: draft[field], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(value => ({ ...value, [field]: event.target.value })) };
    return <div className="cell-editor"><label className="sr-only" htmlFor={props.id}>{label}</label>{field === 'body'
      ? <textarea {...props}/>
      : <Input {...props} autoFocus={field === 'postId'} inputMode={field === 'postId' ? 'numeric' : undefined}/>}</div>;
  }
  return <>
    <tr className="editing-row" aria-label={`Editing comment ${initial.id}`}>
      <td className="identifier">#{initial.id}<span className="draft-label">Unsaved draft</span>{retained && <span className="draft-retained">Outside this page/search</span>}</td>
      <td>{field('postId', 'Post ID')}</td>
      <td>{field('name', 'Name')}{field('email', 'Email')}</td>
      <td>{field('body', 'Body')}</td>
      <td><form id={formId} className="cell-editor-actions" aria-label={`Edit comment ${initial.id}`} onSubmit={event => { event.preventDefault(); void save(); }}>
        <Button disabled={busy || stale} size="sm" type="submit">{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
      </form></td>
    </tr>
    {(error || stale) && <tr className="edit-feedback-row"><td colSpan={5}><div className="edit-feedback-content">
      {error && <p className="feedback error" role="alert">{error}</p>}
      {stale && <>
        <div className="review-notice" role="status">
          <p>{conflicted ? 'Resolve pending conflicts before saving this draft.' : 'Compare the current accepted values before saving your draft.'}</p>
          {conflicted && <Button type="button" variant="outline" size="sm" onClick={onReview}>Review pending conflict</Button>}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void updateBaseline()}>Use current accepted version</Button>
        </div>
        <section className="accepted-preview" aria-label="Current accepted version"><h3>Current accepted version</h3><dl>{fields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{accepted[field]}</dd></div>)}</dl></section>
      </>}
    </div></td></tr>}
  </>;
}
