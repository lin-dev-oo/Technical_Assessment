import { seedLegacyAlternatives } from '../legacy-fixtures.js';
import { test, expect, type WebSocketRoute } from '@playwright/test';
import { Pool } from 'pg';

test.beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
});

test('stale activity expires, reconnect restores one focused label, and conflict checks remain authoritative', async ({ page, browser, request }) => {
  await request.post('/api/imports', { headers: { 'x-upload-id': 'seed' }, data: 'postId,id,name,email,body\n1,1,Original,user@example.com,Body' });
  let suppress = false;
  let live: WebSocketRoute;
  await page.routeWebSocket('**/api/events*', socket => {
    live = socket;
    const server = socket.connectToServer();
    socket.onMessage(message => { if (!suppress) server.send(message); });
  });
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await page.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  await page.getByLabel('body', { exact: true }).fill('Kept draft');
  await expect(other.locator('[data-presence-field="body"]')).toHaveCount(1);
  // Drop application heartbeats while the transport stays open, as with suspended activity.
  suppress = true;
  await expect(other.locator('[data-presence-field]')).toHaveCount(0, { timeout: 15000 });
  suppress = false;
  live!.close();
  await expect(other.locator('[data-presence-field="body"]')).toHaveCount(1, { timeout: 3000 });
  await expect(page.getByLabel('body', { exact: true })).toBeFocused();
  await seedLegacyAlternatives('postId,id,name,email,body\n1,1,Alternative,user@example.com,Other body', 'Earlier upload', 'Earlier session');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByLabel('body', { exact: true })).toHaveValue('Kept draft');
  const rejected = await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Bypass attempt' } });
  expect(rejected.status()).toBe(409);
  expect((await (await request.get('/api/comments')).json()).comments[0].body).toBe('Body');
  await other.close();
});

test('two sessions show focused cells, move and clear labels while allowing simultaneous editing', async ({ page, browser, request }, testInfo) => {
  await request.post('/api/imports', { headers: { 'x-upload-id': 'seed' }, data: 'postId,id,name,email,body\n1,1,Original,user@example.com,Body' });
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  await page.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  const indicator = other.locator('[data-presence-field="postId"]');
  await expect(indicator).toContainText('Session');
  await page.getByLabel('body', { exact: true }).fill('Local draft');
  await expect(other.locator('[data-presence-field="body"]')).toContainText('Session');
  await expect(indicator).toHaveCount(0);
  await other.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  await other.getByLabel('body', { exact: true }).focus();
  await expect(other.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(page.locator('[data-presence-field="body"]')).toContainText('Session');
  await other.setViewportSize({ width: 1440, height: 900 });
  await other.screenshot({ path: testInfo.outputPath('presence-desktop.png'), fullPage: true });
  await other.setViewportSize({ width: 390, height: 844 });
  await other.getByLabel('body', { exact: true }).scrollIntoViewIfNeeded();
  await other.screenshot({ path: testInfo.outputPath('presence-narrow.png'), fullPage: true });
  await page.getByRole('searchbox').focus();
  await expect(other.locator('[data-presence-field]')).toHaveCount(0);
  await expect(page.getByLabel('body', { exact: true })).toHaveValue('Local draft');
  await page.getByLabel('email', { exact: true }).focus();
  await expect(other.locator('[data-presence-field="email"]')).toBeVisible();
  await page.close();
  await expect(other.locator('[data-presence-field]')).toHaveCount(0);
  await other.close();
});


test('keeps another session’s active editing cell visible when its window loses focus', async ({ page, browser, request }) => {
  await request.post('/api/imports', { headers: { 'x-upload-id': 'window-presence' }, data: 'postId,id,name,email,body\n1,1,Original,user@example.com,Body' });
  const observer = await browser.newPage();
  await Promise.all([page.goto('/'), observer.goto('/')]);
  await page.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  await page.getByLabel('body', { exact: true }).fill('Unsaved work');
  const indicator = observer.locator('[data-presence-field="body"]');
  await expect(indicator).toBeVisible();
  // Browsers preserve the selected input when focus moves to another window.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(indicator).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(indicator).toHaveCount(0);
  await observer.close();
});
