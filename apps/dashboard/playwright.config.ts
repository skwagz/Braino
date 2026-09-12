import { defineConfig } from "@playwright/test";
export default defineConfig({
  expect: { timeout: 15000 },
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    launchOptions: { channel: "msedge" },
  },
  webServer: [{
    command: 'node e2e/server.ts',
    url: 'http://127.0.0.1:43822/health',
    reuseExistingServer: false,
  }, {
    command: "npm run dev -- --port 5173",
    env: { BRAINO_API_TARGET: 'http://127.0.0.1:43822' },
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  }],
  reporter: "list",
});
