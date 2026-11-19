import { seedLegacyAlternatives } from '../legacy-fixtures.js';
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const header = 'postId,id,name,email,body\n';

test.beforeEach(async ({ request }) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
  await request.post('/api/imports', { headers: { 'x-upload-id': 'accepted', 'x-upload-label': 'original.csv', 'x-session-label': 'Session original' }, data: header + '1,1,Accepted name,accepted@example.com,Accepted body' });
});

test('compares all versions, highlights differences and chooses one complete alternative', async ({ page }, testInfo) => {
  await page.goto('/');
  const csv = header + '2,1,Alternative name,alternative@example.com,"Alternative body, with a comma\nand another line"';
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'alternative.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('Upload complete', { exact: true })).toHaveCount(0);
  await expect(page.locator('.person-name')).toHaveText('Accepted name');
  const dialog = page.getByRole('dialog', { name: 'Review record #1' });
  await expect(dialog.getByRole('radio', { name: 'Current version', exact: true })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Alternative 1', exact: true })).toBeVisible();
  await expect(dialog.locator('.comparison-source').getByText('alternative.csv', { exact: false })).toBeVisible();
  await expect(dialog.locator('[data-changed="true"]')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Apply upload', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('conflict-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('conflict-mobile.png'), fullPage: true });
  await dialog.getByRole('radio', { name: 'Alternative 1' }).check();
  await dialog.getByRole('button', { name: 'Apply upload', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Upload complete', { exact: true })).toBeVisible();
  await expect(page.getByText('Alternative name', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Review conflicts/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Alternative name', { exact: true })).toBeVisible();
});

test('refreshes a stale review and requires a new choice before keeping the current version', async ({ page, request, browser }, testInfo) => {
  await seedLegacyAlternatives(header + '1,1,First,first@example.com,First body', 'Earlier upload', 'Earlier session');
  await page.goto('/');
  await page.getByRole('button', { name: /^Review conflicts/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Current version' }).check();
  const other = await browser.newPage();
  await other.goto('/');
  await seedLegacyAlternatives(header + '1,1,Later,later@example.com,Later body', 'Earlier upload', 'Earlier session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(dialog.getByText('Versions changed. Review and choose again.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Alternative 2', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^(Keep current version|Use alternative \d+|Use selected version)$/, exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('stale-review-desktop.png'), fullPage: true });
  await dialog.getByRole('radio', { name: 'Current version' }).check();
  await dialog.getByRole('button', { name: /^(Keep current version|Use alternative \d+|Use selected version)$/, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Accepted name', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(other.getByRole('button', { name: /^Review conflicts/ })).toHaveCount(0);
  await other.close();
});

test('keeps a choice on connection failure, supports keyboard dismissal and restores focus', async ({ page, request }) => {
  await seedLegacyAlternatives(header + '1,1,Alternative,other@example.com,Other body', 'Earlier upload', 'Earlier session');
  await page.goto('/');
  const opener = page.getByRole('button', { name: /^Review conflicts/ });
  await opener.click();
  await page.getByRole('radio', { name: 'Current version' }).check();
  await page.route('**/api/comments/1/resolve', route => route.abort());
  await page.getByRole('button', { name: /^(Keep current version|Use alternative \d+|Use selected version)$/, exact: true }).click();
  await expect(page.getByText('Resolution not confirmed. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Current version' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.unroute('**/api/comments/1/resolve');
  await opener.click();
  await page.getByRole('radio', { name: 'Current version' }).check();
  await page.getByRole('button', { name: /^(Keep current version|Use alternative \d+|Use selected version)$/, exact: true }).click();
  await expect(page.getByText('Conflict resolved.')).toBeVisible();
});


test('shows supplied sample and several long alternatives on desktop and narrow screens', async ({ page, request }, testInfo) => {
  const sample = await (await request.post('/api/imports', { headers: { 'x-upload-id': 'sample', 'x-upload-label': 'data.csv' }, data: await readFile('data.csv', 'utf8') })).json();
  expect((await request.post('/api/imports/sample/commit', { data: { choices: [{ id: 1, selected: 'accepted', expectedVersion: 1, expectedProposalRevision: 0 }] } })).ok()).toBeTruthy();
  await seedLegacyAlternatives([sample.reviews[1].alternatives[0]], 'data.csv');
  const name = 'Long name ' + 'VeryLongUnbrokenName'.repeat(12);
  const email = 'long'.repeat(40) + '@example.com';
  const body = 'A multiline comment.\n' + 'UnbrokenBody'.repeat(100) + '\nThe final line is still available.';
  const csv = header + '3,1,' + name + ',' + email + ',"' + body + '"';
  await seedLegacyAlternatives(csv, 'long-content.csv', 'Session long');
  await seedLegacyAlternatives(header + '4,1,Third,third@example.com,Another alternative', 'Earlier upload', 'Earlier session');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('1–25 of 500')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('supplied-sample-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: /^Review conflicts/ }).click();
  await expect(page.getByRole('radio', { name: 'Alternative 3' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('long-review-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Current version', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Alternative 2' }).check();
  await expect(page.getByRole('radio', { name: 'Alternative 2' })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('long-review-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('supplied-sample-mobile.png'), fullPage: true });
});


test('shows changed fields first, reveals context, and makes the chosen whole version explicit', async ({ page, request }, testInfo) => {
  const body = 'Changed opening line\n' + 'Long body content '.repeat(40);
  await seedLegacyAlternatives(header + '1,1,Accepted name,accepted@example.com,"' + body + '"', 'changes.csv', 'Earlier session');
  await page.goto('/');
  await page.getByRole('button', { name: /^Review conflicts/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 changed field', { exact: true })).toBeVisible();
  await expect(dialog.locator('.comparison-table tbody tr')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'All fields' }).click();
  await expect(dialog.locator('.comparison-table tbody tr')).toHaveCount(4);
  await expect(dialog.getByText('Unchanged', { exact: true })).toHaveCount(3);
  await dialog.getByRole('radio', { name: 'Alternative 1' }).check();
  await expect(dialog.locator('.review-outcome')).toContainText('Keep: Alternative 1');
  await expect(dialog.locator('.review-outcome')).toContainText('Other alternatives will be dismissed.');
  expect((await (await request.get('/api/comments')).json()).comments[0].body).toBe('Accepted body');
  await page.setViewportSize({ width: 390, height: 844 });
  const long = dialog.locator('.long-comparison');
  await long.locator('summary').click();
  await expect(long.locator('.comparison-value')).toHaveText(body);
  const scroll = await dialog.locator('.comparison-scroll').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(scroll.scroll).toBeLessThanOrEqual(scroll.client);
  await expect(dialog.getByRole('button', { name: 'Use alternative 1', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('mobile-field-comparison.png') });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/comments/1/resolve', async route => { await held; await route.continue(); });
  await dialog.getByRole('button', { name: 'Use alternative 1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Close review' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'Current version' })).toBeDisabled();
  release();
  await expect(dialog).toHaveCount(0);
});


test('reviews the whole upload without saving individual choices and applies only after every choice', async ({ page, request }, testInfo) => {
  await request.post('/api/imports', { headers: { 'x-upload-id': 'second-record' }, data: header + '1,2,Second,second@example.com,Second body' });
  const before = await (await request.get('/api/comments')).json();
  await page.goto('/');
  await page.getByRole('searchbox').fill('no-matching-record');
  await expect(page.getByText('No records found')).toBeVisible();
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'two-conflicts.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '2,2,Changed second,second@example.com,Changed second body\n2,1,Changed first,accepted@example.com,Changed first body\n1,3,New,new@example.com,New body') });
  await expect(page.getByRole('dialog', { name: 'Review record #2' })).toBeVisible();
  await expect(page.locator('.review-progress')).toHaveText('1 / 2');
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  await page.getByRole('button', { name: 'Next conflict', exact: true }).click();
  await page.getByRole('radio', { name: 'Current version' }).check();
  await page.getByRole('button', { name: 'Previous conflict', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Alternative 1' })).toBeChecked();
  await page.getByRole('button', { name: 'Confirm choice', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review record #1' })).toBeVisible();
  expect(await (await request.get('/api/comments')).json()).toEqual(before);
  await expect(page.getByRole('radio', { name: 'Current version' })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('atomic-upload-review.png') });
  await page.getByRole('button', { name: 'Apply upload', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Upload complete', { exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('no-matching-record');
  const result = await (await request.get('/api/comments')).json();
  expect(result.comments.map((row: { body: string }) => row.body)).toEqual(['Accepted body', 'Changed second body', 'New body']);
  expect(result.conflictIds).toEqual([]);
});

test('closing an unresolved upload rejects all its changes, including new rows', async ({ page, request }) => {
  const before = await (await request.get('/api/comments')).json();
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'reject.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Changed,accepted@example.com,Changed body\n1,2,New,new@example.com,New body') });
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  await page.getByRole('button', { name: 'Close review' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Upload rejected', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Review conflicts/ })).toHaveCount(0);
  expect(await (await request.get('/api/comments')).json()).toEqual(before);
});

test('rejecting after confirming an earlier conflict still leaves every record untouched', async ({ page, request }) => {
  await request.post('/api/imports', { headers: { 'x-upload-id': 'second' }, data: header + '1,2,Second,second@example.com,Second body' });
  const before = await (await request.get('/api/comments')).json();
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'partial.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Changed,accepted@example.com,Changed body\n1,2,Changed,second@example.com,Changed second\n1,3,New,new@example.com,New') });
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  await page.getByRole('button', { name: 'Confirm choice', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review record #2' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await (await request.get('/api/comments')).json()).toEqual(before);
});

test('requires fresh review if another session edits accepted data before Apply upload', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'stale.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Imported,accepted@example.com,Imported body\n1,2,New,new@example.com,New body') });
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Later', email: 'accepted@example.com', body: 'Later body' } });
  await expect(page.getByRole('dialog')).toContainText('Later body', { timeout: 3000 });
  await expect(page.getByRole('radio', { name: 'Alternative 1' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Apply upload', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Later body');
  expect((await (await request.get('/api/comments')).json()).total).toBe(1);
});
