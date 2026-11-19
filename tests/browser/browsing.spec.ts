import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

test.beforeEach(async ({ request }) => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query('TRUNCATE alternatives, comments, upload_requests'); } finally { await pool.end(); }
  const rows = Array.from({ length: 61 }, (_, i) => `1,${i + 1},${i >= 50 ? 'Needle' : 'Comment'} ${i + 1},user${i + 1}@example.com,Body`).join('\n');
  expect((await request.post('/api/uploads', { headers: { 'x-upload-id': 'browser-seed' }, data: `postId,id,name,email,body\n${rows}` })).ok()).toBeTruthy();
});

test('searches beyond the visible page, resets pages, and retains browsing context on refresh', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('1–25 of 61')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('26–50 of 61')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search all fields' }).fill('NEEDLE');
  await expect(page.getByText('1–11 of 11')).toBeVisible();
  await expect(page.getByText('Needle 61', { exact: true })).toBeVisible();
  await page.getByLabel('Rows per page').selectOption('10');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('11–11 of 11')).toBeVisible();
  const refreshed = page.waitForResponse(response => response.url().includes('/api/comments?') && response.ok());
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await refreshed;
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await expect(page.getByText('11–11 of 11')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('NEEDLE');
  await page.getByRole('searchbox').fill('no-matching-comment');
  await expect(page.getByText('No records found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByText('1–10 of 61')).toBeVisible();
});

test('refresh clamps to the last valid filtered page when accepted data stops matching', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('Needle');
  await expect(page.getByText('1–11 of 11')).toBeVisible();
  await page.getByLabel('Rows per page').selectOption('10');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('11–11 of 11')).toBeVisible();
  // Fixture simulates a future accepted edit in a second session; assertions stay at the UI seam.
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try { await pool.query("UPDATE comments SET name = 'Changed' WHERE id = 61"); } finally { await pool.end(); }
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('1–10 of 10')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('Needle');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
});

test('a superseded search response cannot replace newer results', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('searchbox')).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let arrived!: () => void;
  const started = new Promise<void>(resolve => { arrived = resolve; });
  await page.route('**/api/comments?*', async route => {
    if (new URL(route.request().url()).searchParams.get('q') !== 'Needle') return route.continue();
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('searchbox').fill('Needle');
  await started;
  await page.getByRole('searchbox').fill('no-matching-comment');
  await expect(page.getByText('No records found')).toBeVisible();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByText('No records found')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('no-matching-comment');
});


test('keeps the dataset total separate and marks failed search results as outdated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.count-badge')).toHaveText('61');
  await page.getByRole('searchbox', { name: 'Search all fields' }).fill('user61@example.com');
  await expect(page.getByText('1 result', { exact: true })).toBeVisible();
  await expect(page.locator('.count-badge')).toHaveText('61');
  await expect(page.getByRole('columnheader').allTextContents()).resolves.toEqual(['id', 'postId', 'name', 'email', 'body', 'Actions']);
  await page.route('**/api/comments?*', route => route.abort());
  await page.getByRole('searchbox').fill('missing');
  await expect(page.locator('[data-sonner-toast]')).toContainText('Previously loaded results may be outdated.');
  await expect(page.locator('.pagination')).toContainText('previous results');
  await expect(page.locator('.search-status')).toHaveText('Results unavailable');
  await expect(page.getByText('No records found')).toHaveCount(0);
  await page.unroute('**/api/comments?*');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No records found')).toBeVisible();
  await expect(page.locator('.count-badge')).toHaveText('61');
});


test('has one in-field clear action and supports first, last and direct page navigation', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'First page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Last page', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('51–61 of 61');
  await expect(page.getByRole('button', { name: 'Last page', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Go to page', exact: true }).fill('2');
  await page.getByRole('textbox', { name: 'Go to page', exact: true }).press('Enter');
  await expect(page.locator('.pagination')).toContainText('26–50 of 61');
  await page.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('1–25 of 61');
  await page.getByRole('textbox', { name: 'Go to page', exact: true }).fill('99');
  await page.getByRole('textbox', { name: 'Go to page', exact: true }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Go to page', exact: true })).toHaveValue('1');
  await expect(page.locator('[data-sonner-toast]')).toContainText('Enter a page from 1 to 3.');
  await page.locator('[data-sonner-toast]').screenshot({ path: testInfo.outputPath('app-notification.png') });
  await page.getByRole('searchbox').fill('Needle');
  await expect(page.locator('.search-field').getByRole('button', { name: 'Clear search' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Clear search', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByRole('searchbox')).toBeFocused();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Last page', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'First page', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Last page', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('pagination-mobile.png') });
});
