import { defineConfig } from "@playwright/test";

// E2E runs against the Vite dev server with Tauri IPC mocked in the page
// (see docs/decisions.md — Playwright cannot attach to the Tauri WebView on
// Windows; true in-Tauri E2E would require tauri-driver + WebdriverIO).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:1420",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
  },
});
