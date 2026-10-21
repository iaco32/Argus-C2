import { test, expect, Page } from "@playwright/test";

// When running headed, pause between key assertions and steps so actions are visually easy to follow
const isHeaded = process.env.PW_HEADED === "1" || process.argv.includes("--headed");

async function pause(page: Page, ms: number = 1000) {
  if (isHeaded) {
    await page.waitForTimeout(ms);
  }
}

test.describe("ARGUS C2 — Frontline Command Interface (E2E Tests / TDD)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for WebSocket connection to establish and drones to appear
    await expect(page.locator(".metric-dot.connected")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".drone-item").first()).toBeVisible({ timeout: 10000 });
    await pause(page, 800);
  });

  test.afterEach(async ({ page }) => {
    // In headed mode, pause briefly after each test so the user can see the final state
    await pause(page, 1200);
  });

  test("1. Application branding & Status Bar metrics", async ({ page }) => {
    await expect(page).toHaveTitle(/ARGUS C2/);
    await expect(page.locator(".status-bar__name")).toHaveText("ARGUS C2");
    await expect(page.locator(".status-bar__sub")).toHaveText("FRONTLINE");

    // Connection state
    await expect(page.locator("#sb-conn-state")).toHaveText("CONNECTED");

    // Ping & FPS metrics
    const pingEl = page.locator("#sb-latency");
    await expect(pingEl).toBeVisible();
    await expect(pingEl).toContainText("ms");

    const fpsEl = page.locator("#sb-fps");
    await expect(fpsEl).toBeVisible();

    await pause(page, 1000);
  });

  test("2. Fleet list rendering & DOM stability", async ({ page }) => {
    const droneItems = page.locator(".drone-item");
    const count = await droneItems.count();
    expect(count).toBeGreaterThan(0);

    const countLabel = page.locator("#dl-count");
    await expect(countLabel).toContainText(`${count}`);

    // Verify first drone item has header, status badge, and battery bar
    const firstDrone = droneItems.first();
    await expect(firstDrone.locator(".drone-item__id")).toBeVisible();
    await expect(firstDrone.locator(".drone-item__status")).toBeVisible();
    await expect(firstDrone.locator(".bar-fill").first()).toBeVisible();

    await pause(page, 1000);
  });

  test("3. Fleet filtering (Quick tabs & Search)", async ({ page }) => {
    const initialCount = await page.locator(".drone-item").count();

    // Test ALERTS filter
    const alertsTab = page.locator('.drone-filter-btn[data-filter="ALERTS"]');
    await alertsTab.click();
    await expect(alertsTab).toHaveClass(/active/);
    await pause(page, 1000);

    const alertsCount = await page.locator(".drone-item").count();
    expect(alertsCount).toBeLessThanOrEqual(initialCount);

    // Test ALL filter restore
    const allTab = page.locator('.drone-filter-btn[data-filter="ALL"]');
    await allTab.click();
    await expect(allTab).toHaveClass(/active/);
    await expect(page.locator(".drone-item")).toHaveCount(initialCount);
    await pause(page, 1000);

    // Test text search
    const searchInput = page.locator("#dl-search");
    await searchInput.fill("001");
    await expect(page.locator(".drone-item")).toHaveCount(1);
    await expect(page.locator(".drone-item").first().locator(".drone-item__id")).toContainText("001");
    await pause(page, 1000);

    // Clear search
    await searchInput.fill("");
    await expect(page.locator(".drone-item")).toHaveCount(initialCount);
    await pause(page, 800);
  });

  test("4. Drone selection on first click & Telemetry Panel update", async ({ page }) => {
    // Before click, telemetry panel should show empty prompt
    await expect(page.locator(".telem-empty")).toBeVisible();

    // Click first drone item
    const firstDrone = page.locator(".drone-item").first();
    const droneId = await firstDrone.locator(".drone-item__id").innerText();

    await firstDrone.click();

    // Check selected class applied
    await expect(firstDrone).toHaveClass(/selected/);

    // Telemetry panel should immediately display drone telemetry
    const telemPanel = page.locator(".telem-panel");
    await expect(telemPanel).toBeVisible();
    await expect(page.locator(".telem-id")).toHaveText(droneId);

    // Check key telemetry metrics
    await expect(page.locator("#tm-alt")).toBeVisible();
    await expect(page.locator("#tm-spd")).toBeVisible();
    await expect(page.locator("#tm-hdg")).toBeVisible();
    await expect(page.locator("#tm-bat")).toBeVisible();
    await expect(page.locator("#tm-sig")).toBeVisible();
    await expect(page.locator("#tm-lat")).toBeVisible();
    await expect(page.locator("#tm-lon")).toBeVisible();

    // Check Canvas sparklines rendered
    await expect(page.locator("#chart-bat")).toBeVisible();
    await expect(page.locator("#chart-alt")).toBeVisible();
    await expect(page.locator("#chart-spd")).toBeVisible();

    await pause(page, 1500);

    // Switch selection to second drone
    const secondDrone = page.locator(".drone-item").nth(1);
    const secondId = await secondDrone.locator(".drone-item__id").innerText();

    await secondDrone.click();

    await expect(secondDrone).toHaveClass(/selected/);
    await expect(firstDrone).not.toHaveClass(/selected/);
    await expect(page.locator(".telem-id")).toHaveText(secondId);

    await pause(page, 1500);
  });

  test("5. System Alerts panel (open, clear all alerts, and close)", async ({ page }) => {
    // Open alert panel via top status bar button
    const alertBtn = page.locator("#sb-alert-btn");
    await alertBtn.click();

    const alertPanel = page.locator(".alert-panel");
    await expect(alertPanel).toHaveClass(/open/);
    await pause(page, 1200);

    // Click CLEAR ALL ALERTS button
    const clearBtn = page.locator("#ap-clear");
    await clearBtn.click();

    // Nominal state should appear
    await expect(page.locator(".alert-empty")).toBeVisible();
    await expect(page.locator(".alert-empty__title")).toHaveText("ALL SYSTEMS NOMINAL");
    await pause(page, 1200);

    // Close alert panel
    const closeBtn = page.locator("#ap-close");
    await closeBtn.click();
    await expect(alertPanel).not.toHaveClass(/open/);
    await pause(page, 800);
  });

  test("6. Fleet stats collapsible toggle", async ({ page }) => {
    const toggleBtn = page.locator("#fs-toggle");
    const fleetStatsRoot = page.locator("#fs-root");

    await expect(toggleBtn).toHaveText("COLLAPSE ▲");
    await toggleBtn.click();

    await expect(fleetStatsRoot).toHaveClass(/collapsed/);
    await expect(toggleBtn).toHaveText("EXPAND ▼");
    await pause(page, 1000);

    await toggleBtn.click();
    await expect(fleetStatsRoot).not.toHaveClass(/collapsed/);
    await expect(toggleBtn).toHaveText("COLLAPSE ▲");
    await pause(page, 1000);
  });

  test("7. Drone list scrolling and Scroll-To-Top button", async ({ page }) => {
    const listContainer = page.locator("#dl-items");
    const topBtn = page.locator("#dl-scroll-top");

    // Scroll down inside list container
    await listContainer.evaluate((el) => {
      el.scrollTop = 500;
    });

    const scrollTopBefore = await listContainer.evaluate((el) => el.scrollTop);
    expect(scrollTopBefore).toBeGreaterThan(0);
    await pause(page, 1000);

    // Click scroll to top button
    await topBtn.click();
    await expect.poll(async () => listContainer.evaluate((el) => el.scrollTop), { timeout: 3000 }).toBe(0);
    await pause(page, 1200);
  });
});
