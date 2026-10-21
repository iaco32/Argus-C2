import { defineConfig, devices } from "@playwright/test";

// If parent process received --headed, store in process.env so worker processes inherit it
if (process.argv.includes("--headed")) {
  process.env.PW_HEADED = "1";
}

const isHeaded = process.env.PW_HEADED === "1" || process.argv.includes("--headed");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: isHeaded ? 120000 : 30000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // 1000ms delay between actions in headed mode
      slowMo: isHeaded ? 1000 : 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 15000,
  },
});
