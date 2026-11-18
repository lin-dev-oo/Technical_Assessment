import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUpload } from '../server/csv.js';

test('accepts reordered case-varied headers and preserves quoted multiline text', () => {
  assert.deepEqual(parseUpload(Buffer.from('\uFEFFBODY,Email,NAME,ID,POSTID\n" first, ""quoted"" line\nsecond ",a@b.com, Alice ,2,1')), {
    ok: true, comments: [{ postId: 1, id: 2, name: ' Alice ', email: 'a@b.com', body: ' first, "quoted" line\nsecond ' }],
  });
});

test('rejects invalid UTF-8 rather than silently replacing comment text', () => {
  const bytes = Buffer.concat([Buffer.from('postId,id,name,email,body\n1,1,A,a@b.com,'), Buffer.from([0xc3, 0x28])]);
  assert.deepEqual(parseUpload(bytes), { ok: false, errors: [{ message: 'Save the file as UTF-8 CSV. It contains invalid text encoding.' }] });
});

test('rejects files over 5 MB and over 10,000 comments before returning accepted rows', () => {
  const tooLarge = parseUpload(Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));
  assert.deepEqual(tooLarge, { ok: false, errors: [{ message: 'The file exceeds the 5 MB upload limit.' }] });
  const tooMany = parseUpload(Buffer.from('postId,id,name,email,body\n' + Array.from({ length: 10001 }, (_, i) => `1,${i + 1},A,a@b.com,B`).join('\n')));
  assert.deepEqual(tooMany, { ok: false, errors: [{ message: 'The file exceeds the 10,000 comment limit.' }] });
});

test('rejects incompatible files and reports all safely discoverable record and field problems', () => {
  const invalid = parseUpload(Buffer.from('postId,id,name,email,body\n0,1, ,bad,\n1,1,A,a@b.com,B\n1,2147483648,C,c@b.com,D\n1,4,Only'));
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.deepEqual(invalid.errors, [
    { record: 2, field: 'postId', message: 'Use a positive whole number from 1 to 2147483647.' },
    { record: 2, field: 'name', message: 'A nonblank value is required.' },
    { record: 2, field: 'email', message: 'Use a valid email address.' },
    { record: 2, field: 'body', message: 'A nonblank value is required.' },
    { record: 3, field: 'id', message: 'ID 1 appears more than once in this file.' },
    { record: 4, field: 'id', message: 'Use a positive whole number from 1 to 2147483647.' },
    { record: 5, message: 'Expected 5 fields; received 3.' },
  ]);
  for (const csv of ['', 'postId,id,name,email,body', 'postId,id,name,email,body\n1,1,"unterminated,a@b.com,B', 'postId,id,name,email,extra', 'postId,id,name,email,email', 'postId,id,name,email, body', 'postId,id,name,email,']) {
    assert.equal(parseUpload(Buffer.from(csv)).ok, false, csv);
  }
  const headers = parseUpload(Buffer.from('id,id,name,email,extra\n1,1,A,a@b.com,B'));
  assert.equal(headers.ok, false);
  if (!headers.ok) assert.match(headers.errors.map(error => error.message).join(' '), /Missing headers: postId, body.*Unexpected headers: extra.*Duplicate header: id/);
  for (const id of ['0', '-1', '1.2', '1e3', '2147483648', '', ' 1 ', 'NaN']) {
    assert.equal(parseUpload(Buffer.from(`postId,id,name,email,body\n1,${id},A,a@b.com,B`)).ok, false, id);
  }
  const boundary = parseUpload(Buffer.from('postId,id,name,email,body\n2147483647,2147483647,A,a@b.com,B'));
  assert.equal(boundary.ok, true);
  assert.equal(parseUpload(Buffer.from('postId,id,name,email,body\n1,1,A,a@b.com,A\u0000B')).ok, false);
});
