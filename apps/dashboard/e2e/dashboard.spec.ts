import { test, expect } from "@playwright/test";

test('generated example wiki shows evidence and connected pages on desktop and mobile', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/?example=wiki');
    await page.getByRole('button', { name: /Braino Index/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('October launch budget: 5000 EUR.');
    await expect(dialog).toContainText('Ada owns the October launch.');
    await dialog.getByRole('button', { name: 'Ada', exact: true }).click();
    await expect(dialog.locator('blockquote')).toHaveText('Ada owns the October launch.');
    await page.screenshot({ path: `test-results/wiki-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("folder restructuring preview, editable destinations, wiki and search", async ({
  page,
}) => {
  await page.goto("/app?demo=1");
  await expect(
    page.getByRole("button", { name: "Organize workspace" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/desktop-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Organize workspace" }).click();
  const destination = page.getByLabel("Destination for northstar-0");
  await expect(destination).toBeVisible();
  await destination.selectOption("business");
  await page.getByRole("button", { name: "Review & apply" }).click();
  await expect(page.getByRole("dialog")).toContainText("8 files");
  await page.getByRole("button", { name: "Keep reviewing" }).click();
  await expect(destination).toHaveValue("business");
  await page.screenshot({
    path: "test-results/desktop-plan.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Review & apply" }).click();
  await page
    .getByRole("button", { name: "Apply structure", exact: true })
    .click();
  await expect(page.getByText("Explore your workspace")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("launch");
  await expect(
    page.getByRole("button", { name: /Launch plan v3/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Supplier agreement/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Knowledge wiki/ }).click();
  await page.getByRole("button", { name: /Autumn launch/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Source files");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Change folder" }).click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Search", exact: true }).fill("fundraising");
  await page.getByRole("button", { name: /Fundraising My Drive/ }).click();
  await expect(page.getByText("Fundraising", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("My Drive / Fundraising", { exact: true })).toBeVisible();
});

test("mobile navigation and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app?demo=1");
  await expect(
    page.getByRole("button", { name: "Organize workspace" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/mobile-overview.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Organize workspace" }).click();
  await expect(page.getByLabel("Destination for northstar-0")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-plan.png",
    fullPage: true,
  });
});

test('failed apply retries the same saved run and version', async ({ page }) => {
  const run = { id: 'p1', folderId: 'test', version: 1, createdAt: Date.now(), status: 'ready',
    report: { complete: true, documents: [{ id: 's1', name: 'Plan', url: 'https://docs.google.com/document/d/s1', classification: { categoryId: 'business', reason: 'Project plan', evidence: [] } }], folders: [{ categoryId: 'business', name: 'Business' }], errors: [], skipped: [], review: [] }, plan: { blocked: [], operations: [{kind: 'move', fileId: 's1'}] } };
  let scans = 0; const versions: number[] = []; let current: typeof run | undefined;
  await page.route('**/api/**', route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === '/api/status') return route.fulfill({ json: { mode: 'demo', connected: true, csrfToken: 'test', config: {google: false, llm: false}, classifier: 'rules' } });
    if (path === '/api/folders') return route.fulfill({ json: { folders: [{ id: 'test', name: 'Test' }] } });
    if (path === '/api/runs' && req.method() === 'GET') return route.fulfill({ json: {runs: current ? [current] : []} });
    if (path === '/api/runs' && req.method() === 'POST') { scans++; current = run; return route.fulfill({json: current}); }
    if (path === '/api/runs/p1') return route.fulfill({json: current});
    if (path === '/api/runs/p1/apply') {
      versions.push(req.postDataJSON().version);
      if (versions.length === 1) return route.fulfill({status: 503, json: {error: 'Try again'}});
      current = {...run, status: 'complete'}; return route.fulfill({json: current});
    }
    return route.abort();
  });
  await page.goto('/app');
  await page.getByRole('button', {name: 'Organize workspace'}).click();
  await page.getByRole('button', {name: 'Review & apply'}).click();
  await page.getByRole('button', {name: 'Apply structure', exact: true}).click();
  await page.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(page.getByText('Explore your workspace')).toBeVisible();
  expect(scans).toBe(1); expect(versions).toEqual([1, 1]);
});
