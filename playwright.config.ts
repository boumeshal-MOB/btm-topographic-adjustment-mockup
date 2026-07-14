import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Some sandboxed dev environments pre-install a pinned Chromium outside the package's expected
// browser revision. Use it only when present; CI installs its own browser via `playwright install`.
const preinstalledChromium = '/opt/pw-browsers/chromium';
const launchOptions = existsSync(preinstalledChromium)
  ? { executablePath: preinstalledChromium }
  : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
  ],
  webServer: {
    // Serves the already-built dist/. The build runs as its own CI step (and locally before
    // `CI=1 npm run test:e2e`), so this only previews — never builds — to keep E2E timing and
    // the served artefact deterministic.
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
