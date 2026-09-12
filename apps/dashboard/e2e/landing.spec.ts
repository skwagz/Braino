import { test, expect } from '@playwright/test';

test('landing works on desktop and mobile and opens the sample workspace', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('A little less chaos.');
    await expect(page.getByText('Coming soon', { exact: true })).toBeVisible();
    await page.getByText('What access does Braino need?', { exact: true }).click();
    await expect(page.getByText(/That Google permission is broader/)).toBeVisible();
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByRole('link', { name: 'Explore the demo', exact: true }).click();
  await expect(page).toHaveURL(/\/app\?demo=1/);
  await expect(page.getByRole('button', { name: 'Organize workspace' })).toBeEnabled();
});

test('built landing and workspace load directly from the backend', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:43822/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('A little less chaos.');
  await page.getByRole('link', { name: 'Explore the demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Organize workspace' })).toBeEnabled();
  const blocked = await request.get('http://127.0.0.1:43822/assets/%2e%2e%2f%2e%2e%2fpackage.json');
  expect(blocked.status()).toBe(404);
  expect(errors).toEqual([]);
});

test('connect bootstraps the Google session and navigates to OAuth', async ({ page }) => {
  let statusRequests = 0;
  await page.route('**/api/status', route => { statusRequests++; return route.fulfill({ json: {
    mode: 'live', connected: false, csrfToken: 'test', config: { google: true, llm: true }, classifier: 'llm',
  } }); });
  await page.route('**/auth/google/start', route => route.fulfill({ contentType: 'text/html', body: '<p>Google authorization handoff</p>' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).first().click();
  await expect(page).toHaveURL(/\/auth\/google\/start$/);
  expect(statusRequests).toBeGreaterThanOrEqual(2);
});

test('unavailable Google connection never pretends the sample is connected', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: {
    mode: 'demo', connected: true, csrfToken: 'test', config: { google: false, llm: false }, classifier: 'rules',
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect Google Drive', exact: true }).first().click();
  await expect(page.getByRole('alert')).toContainText('Google Drive connection is not available');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Open your workspace' })).toHaveCount(0);
});

test('web app uses stored backend plans and preserves results after reload', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('button', { name: 'Organize workspace' })).toBeEnabled();
  await expect(page.getByText('Interactive demo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Organize workspace' }).click();
  await expect(page.getByText('Awaiting review', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Destination for Untitled notes')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review & apply' }).click();
  await expect(page.getByRole('dialog')).toContainText('5 files will move');
  await expect(page.getByRole('dialog')).toContainText('No wiki pages will be created');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(page.getByText('Explore your workspace')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Explore your workspace')).toBeVisible();
  await page.getByRole('button', { name: /Knowledge wiki/ }).click();
  await expect(page.getByText('Knowledge wiki is coming next')).toBeVisible();
});
