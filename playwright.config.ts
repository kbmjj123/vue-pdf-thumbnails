import { defineConfig } from '@playwright/test'

// Visual-regression config. Mirrors minopdf.com's docs/13 note:
// the local macOS runner has no usable bundled Chromium, so we drive the
// system Chrome via channel:'chrome'.
export default defineConfig({
  testDir: 'tests/visual',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 }
  },
  use: {
    channel: 'chrome',
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'vite --config examples/demo/vite.config.ts --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000
  }
})
