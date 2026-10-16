import { defineConfig, devices } from "@playwright/test";

const requestedBrowserChannel =
  process.env.DOCKIT_E2E_BROWSER_CHANNEL ||
  (process.platform === "win32" ? "chrome" : "");
const browserChannel =
  requestedBrowserChannel === "bundled" ? undefined : requestedBrowserChannel;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {})
      }
    }
  ]
});
