import { parse } from 'csv-parse/sync';

export type CommentValues = { postId: number; id: number; name: string; email: string; body: string };
export type ValidationError = { record?: number; field?: string; message: string };
export type ParsedUpload = { ok: true; comments: CommentValues[] } | { ok: false; errors: ValidationError[] };
export const MAX_BYTES = 5 * 1024 * 1024;
const fields = ['postId', 'id', 'name', 'email', 'body'] as const;

export function parseUpload(content: Buffer): ParsedUpload {
  if (content.length > MAX_BYTES) return { ok: false, errors: [{ message: 'The file exceeds the 5 MB upload limit.' }] };
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(content); }
  catch { return { ok: false, errors: [{ message: 'Save the file as UTF-8 CSV. It contains invalid text encoding.' }] }; }
  const errors: ValidationError[] = [];
  let rows: string[][];
  try { rows = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true }); }
  catch (error) {
    const detail = error as { records?: number };
    return { ok: false, errors: [{ record: (detail.records ?? 0) + 1, message: 'Malformed CSV. Check quoted fields and escaped quotation marks near this record.' }] };
  }
  if (!rows.length) return { ok: false, errors: [{ message: 'The file is empty. Include the five headers and at least one comment.' }] };
  const originalHeaders = rows.shift()!;
  const headers = originalHeaders.map(h => h.toLowerCase());
  const expected = fields.map(field => field.toLowerCase());
  const missing = fields.filter(field => !headers.includes(field.toLowerCase()));
  const extra = originalHeaders.filter(header => !expected.includes(header.toLowerCase()));
  if (missing.length) errors.push({ record: 1, message: `Missing headers: ${missing.join(', ')}.` });
  if (extra.length) errors.push({ record: 1, message: `Unexpected headers: ${extra.map(header => header || '(blank)').join(', ')}.` });
  originalHeaders.forEach((header, index) => {
    if (!header.trim()) errors.push({ record: 1, message: 'Blank headers are not allowed.' });
    else if (header.trim() !== header) errors.push({ record: 1, message: `Header "${header}" has surrounding whitespace. Remove it.` });
    if (headers.indexOf(header.toLowerCase()) !== index) errors.push({ record: 1, message: `Duplicate header: ${header}.` });
  });
  if (errors.length) return { ok: false, errors };
  if (!rows.length) return { ok: false, errors: [{ message: 'The file has headers but no comments.' }] };
  if (rows.length > 10000) return { ok: false, errors: [{ message: 'The file exceeds the 10,000 comment limit.' }] };
  const seen = new Set<number>();
  const comments: CommentValues[] = [];
  rows.forEach((row, index) => {
    const record = index + 2;
    if (row.length !== fields.length) { errors.push({ record, message: `Expected 5 fields; received ${row.length}.` }); return; }
    const value = Object.fromEntries(fields.map(field => [field, row[headers.indexOf(field.toLowerCase())]]));
    for (const field of fields) {
      if (field === 'id' || field === 'postId') {
        const number = Number(value[field]);
        if (!/^\d+$/.test(value[field]) || !Number.isInteger(number) || number < 1 || number > 2147483647) errors.push({ record, field, message: 'Use a positive whole number from 1 to 2147483647.' });
        else if (field === 'id') {
          if (seen.has(number)) errors.push({ record, field, message: `ID ${number} appears more than once in this file.` });
          seen.add(number);
        }
      } else if (!value[field].trim()) errors.push({ record, field, message: 'A nonblank value is required.' });
      else if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value[field])) errors.push({ record, field, message: 'Use a valid email address.' });
      if (typeof value[field] === 'string' && value[field].includes('\u0000')) errors.push({ record, field, message: 'Null characters are not supported. Remove the null character.' });
    }
    comments.push({ id: Number(value.id), postId: Number(value.postId), name: value.name, email: value.email, body: value.body });
  });
  return errors.length ? { ok: false, errors } : { ok: true, comments };
}
