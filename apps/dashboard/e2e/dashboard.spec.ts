import { test, expect } from "@playwright/test";

test("folder restructuring preview, editable destinations, wiki and search", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Organize workspace" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/desktop-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Organize workspace" }).click();
  const destination = page.getByLabel("Destination for Launch plan v3");
  await expect(destination).toBeVisible();
  await destination.fill("Projects/Launch");
  await page.getByRole("button", { name: "Review & apply" }).click();
  await expect(page.getByRole("dialog")).toContainText("8 files");
  await page.getByRole("button", { name: "Keep reviewing" }).click();
  await expect(destination).toHaveValue("Projects/Launch");
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
  await page.getByRole("dialog").getByRole("textbox").fill("fundraising");
  await page.getByRole("button", { name: /Fundraising My Drive/ }).click();
  await expect(page.getByText("3 source files")).toBeVisible();
});

test("mobile navigation and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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
  await expect(page.getByLabel("Destination for Launch plan v3")).toBeVisible();
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

test("failed apply retries the same operation and idempotency key", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as Window & { BRAINO_CONFIG: unknown }).BRAINO_CONFIG = {
      apiBaseUrl: "/api",
    };
  });
  const folder = {
    id: "test",
    name: "Test",
    path: "My Drive/Test",
    fileCount: 1,
    modified: "Today",
  };
  const source = {
    id: "s1",
    name: "Plan",
    kind: "document",
    currentPath: "Loose",
    destination: "Projects",
    reason: "Project plan",
    modified: "Today",
  };
  const plan = {
    id: "p1",
    folderId: "test",
    version: 1,
    complete: true,
    warnings: [],
    sources: [source],
    pages: [],
  };
  const keys: string[] = [];
  let scans = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/folders") return route.fulfill({ json: [folder] });
    if (path === "/api/workspaces/test") return route.fulfill({ json: null });
    if (path === "/api/scans") {
      scans++;
      return route.fulfill({
        json: {
          id: "j1",
          status: "completed",
          progress: 100,
          message: "Ready",
          plan,
        },
      });
    }
    if (path === "/api/plans/p1/apply") {
      keys.push(route.request().headers()["idempotency-key"]);
      return keys.length === 1
        ? route.fulfill({ status: 503, json: {} })
        : route.fulfill({
            json: {
              folderId: "test",
              sources: [source],
              pages: [],
              activity: [],
            },
          });
    }
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Organize workspace" }).click();
  await page.getByRole("button", { name: "Review & apply" }).click();
  await page
    .getByRole("button", { name: "Apply structure", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Explore your workspace")).toBeVisible();
  expect(scans).toBe(1);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
