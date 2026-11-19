import { test, expect, type WebSocketRoute } from '@playwright/test';
import { Pool } from 'pg';

test.beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
});

test('stale activity expires, reconnect restores one focused label, and conflict checks remain authoritative', async ({ page, browser, request }) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: 'postId,id,name,email,body\n1,1,Original,user@example.com,Body' });
  let suppress = false;
  let live: WebSocketRoute;
  await page.routeWebSocket('**/api/events*', socket => {
    live = socket;
    const server = socket.connectToServer();
    socket.onMessage(message => { if (!suppress) server.send(message); });
  });
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await page.getByRole('button', { name: 'Edit comment 1', exact: true }).click();
  await page.getByLabel('Body', { exact: true }).fill('Kept draft');
  await expect(other.locator('[data-presence-field="body"]')).toHaveCount(1);
  // Drop application heartbeats while the transport stays open, as with suspended activity.
  suppress = true;
  await expect(other.locator('[data-presence-field]')).toHaveCount(0, { timeout: 15000 });
  suppress = false;
  live!.close();
  await expect(other.locator('[data-presence-field="body"]')).toHaveCount(1, { timeout: 3000 });
  await expect(page.getByLabel('Body', { exact: true })).toBeFocused();
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'conflict' }, data: 'postId,id,name,email,body\n1,1,Alternative,user@example.com,Other body' });
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('Kept draft');
  const rejected = await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Bypass attempt' } });
  expect(rejected.status()).toBe(409);
  expect((await (await request.get('/api/comments')).json()).comments[0].body).toBe('Body');
  await other.close();
});

test('two sessions show focused cells, move and clear labels while allowing simultaneous editing', async ({ page, browser, request }, testInfo) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: 'postId,id,name,email,body\n1,1,Original,user@example.com,Body' });
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await page.getByRole('button', { name: 'Edit comment 1', exact: true }).click();
  const indicator = other.locator('[data-presence-field="postId"]');
  await expect(indicator).toContainText('Session');
  await page.getByLabel('Body', { exact: true }).fill('Local draft');
  await expect(other.locator('[data-presence-field="body"]')).toContainText('Session');
  await expect(indicator).toHaveCount(0);
  await other.getByRole('button', { name: 'Edit comment 1', exact: true }).click();
  await other.getByLabel('Body', { exact: true }).focus();
  await expect(other.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(page.locator('[data-presence-field="body"]')).toContainText('Session');
  await other.setViewportSize({ width: 1440, height: 900 });
  await other.screenshot({ path: testInfo.outputPath('presence-desktop.png'), fullPage: true });
  await other.setViewportSize({ width: 390, height: 844 });
  await other.getByLabel('Body', { exact: true }).scrollIntoViewIfNeeded();
  await other.screenshot({ path: testInfo.outputPath('presence-narrow.png'), fullPage: true });
  await page.getByRole('searchbox').focus();
  await expect(other.locator('[data-presence-field]')).toHaveCount(0);
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('Local draft');
  await page.getByLabel('Email', { exact: true }).focus();
  await expect(other.locator('[data-presence-field="email"]')).toBeVisible();
  await page.close();
  await expect(other.locator('[data-presence-field]')).toHaveCount(0);
  await other.close();
});
