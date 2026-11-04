import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:4175", reducedMotion: "reduce", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:3101/api/ready",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev:web -- --port 4175 --strictPort",
      url: "http://localhost:4175",
      reuseExistingServer: false,
    },
  ],
});
