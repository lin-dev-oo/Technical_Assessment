import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
const header = 'postId,id,name,email,body\n';

test.beforeEach(async ({ request }) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'accepted', 'x-upload-label': 'original.csv', 'x-session-label': 'Session original' }, data: header + '1,1,Accepted name,accepted@example.com,Accepted body' });
});

test('compares all versions, highlights differences and chooses one complete alternative', async ({ page }, testInfo) => {
  await page.goto('/');
  const csv = header + '2,1,Alternative name,alternative@example.com,"Alternative body, with a comma\nand another line"';
  await page.getByLabel('Choose comments CSV').setInputFiles({ name: 'alternative.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('0 inserted · 0 unchanged · 1 pending conflict')).toBeVisible();
  await expect(page.getByText('Accepted name', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review conflict for comment 1' }).click();
  const dialog = page.getByRole('dialog', { name: 'Review comment #1' });
  await expect(dialog.getByText('Accepted version', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Pending alternative 1', { exact: true })).toBeVisible();
  await expect(dialog.getByText('alternative.csv', { exact: false })).toBeVisible();
  await expect(dialog.locator('[data-changed="true"]')).toHaveCount(4);
  await expect(dialog.getByRole('button', { name: 'Resolve conflict', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('conflict-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('conflict-mobile.png'), fullPage: true });
  await dialog.getByRole('radio', { name: 'Pending alternative 1' }).check();
  await dialog.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Conflict resolved.')).toBeVisible();
  await expect(page.getByText('Alternative name', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review conflict for comment 1' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Alternative name', { exact: true })).toBeVisible();
});

test('refreshes a stale review and requires a new choice before keeping the accepted version', async ({ page, request, browser }, testInfo) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'first-alternative' }, data: header + '1,1,First,first@example.com,First body' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Review conflict for comment 1' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Accepted version' }).check();
  const other = await browser.newPage();
  await other.goto('/');
  await other.getByLabel('Choose comments CSV').setInputFiles({ name: 'later.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Later,later@example.com,Later body') });
  await expect(other.getByText('Upload complete')).toBeVisible();
  await dialog.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await expect(dialog.getByText('This review changed. Compare the current versions and choose again.')).toBeVisible();
  await expect(dialog.getByText('Pending alternative 2', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Resolve conflict', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('stale-review-desktop.png'), fullPage: true });
  await dialog.getByRole('radio', { name: 'Accepted version' }).check();
  await dialog.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Accepted name', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Review conflict for comment 1' })).toHaveCount(0);
  await other.close();
});

test('keeps a choice on connection failure, supports keyboard dismissal and restores focus', async ({ page, request }) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'proposal' }, data: header + '1,1,Alternative,other@example.com,Other body' });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Review conflict for comment 1' });
  await opener.click();
  await page.getByRole('radio', { name: 'Accepted version' }).check();
  await page.route('**/api/comments/1/resolve', route => route.abort());
  await page.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await expect(page.getByText('Resolution not confirmed. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Accepted version' })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(opener).toBeFocused();
  await page.unroute('**/api/comments/1/resolve');
  await opener.click();
  await page.getByRole('radio', { name: 'Accepted version' }).check();
  await page.getByRole('button', { name: 'Resolve conflict', exact: true }).click();
  await expect(page.getByText('Conflict resolved.')).toBeVisible();
});


test('shows supplied sample and several long alternatives on desktop and narrow screens', async ({ page, request }, testInfo) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'sample', 'x-upload-label': 'data.csv' }, data: await readFile('data.csv', 'utf8') });
  const name = 'Long name ' + 'VeryLongUnbrokenName'.repeat(12);
  const email = 'long'.repeat(40) + '@example.com';
  const body = 'A multiline comment.\n' + 'UnbrokenBody'.repeat(100) + '\nThe final line is still available.';
  const csv = header + '3,1,' + name + ',' + email + ',"' + body + '"';
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'long', 'x-upload-label': 'long-content.csv', 'x-session-label': 'Session long' }, data: csv });
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'third' }, data: header + '4,1,Third,third@example.com,Another alternative' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('1–25 of 500')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('supplied-sample-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review conflict for comment 1' }).click();
  await expect(page.getByRole('radio', { name: 'Pending alternative 3' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('long-review-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Scroll sideways to compare versions.')).toBeVisible();
  await page.getByRole('radio', { name: 'Pending alternative 2' }).check();
  await expect(page.getByRole('radio', { name: 'Pending alternative 2' })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('long-review-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('supplied-sample-mobile.png'), fullPage: true });
});
