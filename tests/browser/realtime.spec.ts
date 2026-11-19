import { test, expect, type WebSocketRoute, type Page } from '@playwright/test';
import { Pool } from 'pg';

const header = 'postId,id,name,email,body\n';
test.beforeEach(async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
});

test('reconnect refetches missed changes while keeping search, page, draft and focus', async ({ page, request }, testInfo) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: header + Array.from({ length: 30 }, (_, i) => `1,${i + 1},Name ${i + 1},user@example.com,Body`).join('\n') });
  let offline = false;
  let live: WebSocketRoute;
  await page.routeWebSocket('**/api/events*', socket => {
    if (offline) { socket.close(); return; }
    live = socket;
    socket.connectToServer();
  });
  await page.goto('/');
  await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('Name');
  await page.getByLabel('Rows per page').selectOption('10');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('11–20 of 30 comments')).toBeVisible();
  await page.getByRole('button', { name: 'Edit comment 11', exact: true }).click();
  const draft = page.getByLabel('Body', { exact: true });
  await draft.fill('Preserved offline draft');
  offline = true;
  live!.close();
  await expect(page.getByText('Live updates disconnected. Reconnecting…')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('disconnected-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('disconnected-mobile.png'), fullPage: true });
  await request.post('/api/comments/11/edit', { data: { expectedVersion: 1, postId: 1, name: 'Name 11', email: 'user@example.com', body: 'Saved while disconnected' } });
  offline = false;
  await expect(page.getByText('Live updates connected', { exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('region', { name: 'Current accepted version', exact: true })).toContainText('Saved while disconnected', { timeout: 3000 });
  await expect(draft).toHaveValue('Preserved offline draft');
  await expect(draft).toBeFocused();
  await expect(page.getByRole('searchbox')).toHaveValue('Name');
  await expect(page.getByText('11–20 of 30 comments')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('two browsers see conflicting uploads for a previously absent ID within three seconds', async ({ page, browser }) => {
  const other = await browser.newPage();
  await Promise.all([page.goto('/'), other.goto('/')]);
  const started = Date.now();
  await Promise.all([
    page.getByLabel('Choose comments CSV').setInputFiles({ name: 'first.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '1,1,First,first@example.com,First body') }),
    other.getByLabel('Choose comments CSV').setInputFiles({ name: 'second.csv', mimeType: 'text/csv', buffer: Buffer.from(header + '2,1,Second,second@example.com,Second body') }),
  ]);
  await Promise.all([expect(page.getByText('Upload complete')).toBeVisible(), expect(other.getByText('Upload complete')).toBeVisible()]);
  await Promise.all([page, other].map(view => expect(view.getByRole('button', { name: 'Review conflict for comment 1' })).toBeVisible({ timeout: Math.max(1, 3000 - (Date.now() - started)) })));
  expect(Date.now() - started).toBeLessThanOrEqual(3000);
  for (const view of [page, other]) {
    await view.getByRole('button', { name: 'Review conflict for comment 1' }).click();
    await expect(view.getByRole('radio', { name: 'Pending alternative 1' })).toBeVisible();
    await expect(view.getByRole('dialog')).toContainText('First body');
    await expect(view.getByRole('dialog')).toContainText('Second body');
  }
  await other.close();
});

test('refreshes a draft outside the search results', async ({ page, request }) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: header + '1,1,Original,user@example.com,Body' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit comment 1', exact: true }).click();
  await page.getByLabel('Body', { exact: true }).fill('Kept draft');
  await page.getByRole('searchbox').fill('no-match');
  await expect(page.getByText('Outside this page/search')).toBeVisible();
  await request.post('/api/comments/1/edit', { data: { expectedVersion: 1, postId: 1, name: 'Original', email: 'user@example.com', body: 'New accepted body' } });
  await expect(page.getByRole('region', { name: 'Current accepted version', exact: true })).toContainText('New accepted body', { timeout: 3000 });
  await expect(page.getByLabel('Body', { exact: true })).toHaveValue('Kept draft');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

// Hold the same fixture write barrier as the API suite until both browser requests arrive.
async function race(first: Page, second: Page, action: string, endpoint: string) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const lock = await pool.connect();
  await lock.query('SELECT pg_advisory_lock(71422301)');
  const responses = [first, second].map(view => view.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'POST'));
  const clicks = Promise.all([first, second].map(view => view.getByRole('button', { name: action, exact: true }).click()));
  let started = 0;
  try {
    await expect.poll(async () => (await pool.query("SELECT count(*)::integer AS waiting FROM pg_locks WHERE locktype='advisory' AND objid=71422301 AND NOT granted")).rows[0].waiting).toBe(2);
  } finally { started = Date.now(); await lock.query('SELECT pg_advisory_unlock(71422301)'); lock.release(); await pool.end(); }
  await clicks;
  return { responses: await Promise.all(responses), started };
}

test('two browsers race inline saves and preserve the rejected draft without retrying it', async ({ page, browser, request }) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: header + '1,1,Original,user@example.com,Body' });
  const other = await browser.newPage();
  const views = [page, other];
  for (const view of views) {
    await view.goto('/');
    await view.getByRole('button', { name: 'Edit comment 1', exact: true }).click();
    await view.getByLabel('Body', { exact: true }).fill(view === page ? 'First draft' : 'Second draft');
  }
  const { responses, started } = await race(page, other, 'Save', '/api/comments/1/edit');
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const winnerIndex = responses.findIndex(response => response.status() === 200);
  const loser = views[1 - winnerIndex];
  const winnerBody = winnerIndex === 0 ? 'First draft' : 'Second draft';
  await expect(loser.getByLabel('Body', { exact: true })).toHaveValue(winnerIndex === 0 ? 'Second draft' : 'First draft');
  await expect(loser.getByRole('region', { name: 'Current accepted version', exact: true })).toContainText(winnerBody, { timeout: 3000 });
  expect(Date.now() - started).toBeLessThanOrEqual(3000);
  await expect(loser.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect((await (await request.get('/api/comments')).json()).comments[0].body).toBe(winnerBody);
  await other.close();
});

test('two browsers race whole-version resolutions and refresh the losing review within three seconds', async ({ page, browser, request }) => {
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'seed' }, data: header + '1,1,Original,user@example.com,Accepted body' });
  await request.post('/api/uploads', { headers: { 'x-upload-id': 'proposal' }, data: header + '2,1,Alternative,other@example.com,Alternative body' });
  const other = await browser.newPage();
  const views = [page, other];
  for (const view of views) {
    await view.goto('/');
    await view.getByRole('button', { name: 'Review conflict for comment 1' }).click();
    await view.getByRole('radio', { name: view === page ? 'Accepted version' : 'Pending alternative 1', exact: true }).check();
  }
  const { responses, started } = await race(page, other, 'Resolve conflict', '/api/comments/1/resolve');
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const winnerIndex = responses.findIndex(response => response.status() === 200);
  const loser = views[1 - winnerIndex];
  await expect(loser.getByRole('dialog')).toContainText('There are no pending alternatives. This conflict has already been resolved.', { timeout: 3000 });
  await expect(loser.getByRole('button', { name: 'Resolve conflict', exact: true })).toBeDisabled();
  await Promise.all(views.map(view => expect(view.locator('.body-preview')).toHaveText(winnerIndex === 0 ? 'Accepted body' : 'Alternative body', { timeout: Math.max(1, 3000 - (Date.now() - started)) })));
  expect(Date.now() - started).toBeLessThanOrEqual(3000);
  await loser.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const view of views) await expect(view.getByText(winnerIndex === 0 ? 'Accepted body' : 'Alternative body', { exact: true })).toBeVisible({ timeout: 3000 });
  await other.close();
});
