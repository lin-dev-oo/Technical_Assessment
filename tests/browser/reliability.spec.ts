import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
const header = 'postId,id,name,email,body\n';

test.beforeEach(async ({ request }) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'reliability-seed' }, data: header + '1,1,Original,user@example.com,Original body' });
});

async function missPushFrames(page: Page) {
  await page.routeWebSocket('**/api/events*', socket => {
    const server = socket.connectToServer();
    server.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type !== 'changed' && message.type !== 'presence') socket.send(raw);
    });
  });
}

test('recovers committed data when a live socket misses change notifications', async ({ page, request }) => {
  await missPushFrames(page);
  await page.goto('/');
  await page.getByText('Live updates connected', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.body-preview')).toHaveText('Original body');
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Updated elsewhere' } });
  await expect(page.locator('.body-preview')).toHaveText('Updated elsewhere', { timeout: 3000 });
});

test('recovers active-cell presence even when a live socket misses presence broadcasts', async ({ page, browser }) => {
  await missPushFrames(page);
  const actor = await browser.newPage();
  await Promise.all([page.goto('/'), actor.goto('/')]);
  await page.waitForLoadState('networkidle');
  await actor.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  await actor.getByLabel('body', { exact: true }).fill('Still editing');
  await expect(page.locator('[data-presence-field="body"]')).toBeVisible({ timeout: 3000 });
  await actor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[data-presence-field]')).toHaveCount(0, { timeout: 3000 });
  await actor.close();
});

test('a stale Save immediately requires a version decision rather than a notification', async ({ page, request }, testInfo) => {
  await missPushFrames(page);
  await page.goto('/');
  await page.getByText('Live updates connected', { exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit record 1', exact: true }).click();
  await page.getByLabel('body', { exact: true }).fill('My version');
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Other version' } });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Resolve edit conflict', exact: true });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await expect(dialog).toContainText('My version');
  await expect(dialog).toContainText('Other version');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close review' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('required-conflict-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('required-conflict-mobile.png') });
  await dialog.getByRole('button', { name: 'Use my version', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('form')).toHaveCount(0);
  expect((await (await request.get('/api/comments')).json()).comments[0].body).toBe('My version');
});


test('identical simultaneous uploads then competing edits require a current-or-mine decision', async ({ page, browser, request }) => {
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  const csv = Buffer.from(header + '7,2,Shared,shared@example.com,Shared body');
  await Promise.all([page.getByLabel('Choose CSV').setInputFiles({ name: 'same.csv', mimeType: 'text/csv', buffer: csv }), other.getByLabel('Choose CSV').setInputFiles({ name: 'same.csv', mimeType: 'text/csv', buffer: csv })]);
  for (const view of [page, other]) {
    await expect(view.getByText('Upload complete', { exact: true })).toBeVisible();
    await view.getByRole('button', { name: 'Edit record 2', exact: true }).click();
    await view.getByLabel('body', { exact: true }).fill(view === page ? 'Faster saved version' : 'My unsaved version');
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute('title', 'Resolve changes before saving');
  await other.getByRole('button', { name: 'Save', exact: true }).click();
  const dialog = other.getByRole('dialog', { name: 'Resolve edit conflict', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Faster saved version');
  await expect(dialog).toContainText('My unsaved version');
  await dialog.getByRole('button', { name: 'Use current version', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(other.getByRole('form')).toHaveCount(0);
  await expect(other.locator('.body-preview')).toContainText(['Original body', 'Faster saved version']);
  const data = await (await request.get('/api/comments?q=2')).json();
  expect(data.comments[0].body).toBe('Faster saved version');
  expect(data.comments[0].version).toBe(2);
  await other.close();
});

test('a visible session refetches when it regains focus after missing a notification', async ({ page, request }) => {
  await missPushFrames(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Focus recovered' } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.body-preview')).toHaveText('Focus recovered', { timeout: 3000 });
});


test('an open upload diff receives current values when another session resolves an edit', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'live-diff.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Original,user@example.com,Uploaded proposal') });
  const dialog = page.getByRole('dialog', { name: 'Review record #1' });
  await expect(dialog).toBeVisible();
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Current values changed live' } });
  await expect(dialog).toContainText('Current values changed live', { timeout: 3000 });
  await expect(page.getByRole('radio', { name: 'Alternative 1' })).not.toBeChecked();
  await expect(dialog).toContainText('Uploaded proposal');
});


test('conflicts disappearing at Apply require renewed confirmation before inserting new rows', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'race.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Original,user@example.com,Matching proposal\n1,2,New,new@example.com,New body') });
  await expect(page.getByRole('dialog', { name: 'Review record #1' })).toBeVisible();
  await page.getByRole('radio', { name: 'Alternative 1' }).check();
  let commits = 0;
  await page.route('**/api/imports/*/commit', async route => {
    commits++;
    if (commits === 1) await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Matching proposal' } });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Apply upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Apply upload', exact: true });
  await expect(dialog).toBeVisible();
  expect(commits).toBe(1);
  expect((await (await request.get('/api/comments')).json()).total).toBe(1);
  await dialog.getByRole('button', { name: 'Apply upload', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(commits).toBe(2);
  expect((await (await request.get('/api/comments')).json()).total).toBe(2);
});

test('live conflict removal still requires Apply upload before adding new records', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Choose CSV').setInputFiles({ name: 'ready.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,Original,user@example.com,Matching proposal\n1,2,New,new@example.com,New body') });
  await expect(page.getByRole('dialog', { name: 'Review record #1' })).toBeVisible();
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'Matching proposal' } });
  const dialog = page.getByRole('dialog', { name: 'Apply upload', exact: true });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  expect((await (await request.get('/api/comments')).json()).total).toBe(1);
  await dialog.getByRole('button', { name: 'Apply upload', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await (await request.get('/api/comments')).json()).total).toBe(2);
});
