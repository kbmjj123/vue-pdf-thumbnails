import { test, expect } from '@playwright/test'

// Visual / behavior regression for the lazy preview.
// Requires `pnpm test:visual`, which generates examples/demo/public/sample.pdf
// and boots the Vite dev server (see playwright.config.ts webServer).
//
// First run: `pnpm test:visual --update-snapshots` to create the baseline image.
test('renders only the initial lazy window, then loads more on scroll', async ({ page }) => {
  // The grid always lays out every page slot (1..total); only the visible window
  // actually gets a rasterized bitmap. So count rendered bitmaps (.vpt-img), not
  // card divs, to assert the virtualization behavior.
  await page.goto('/')
  const card = page.locator('.vpt-card')
  await card.first().waitFor({ state: 'visible', timeout: 15_000 })

  const rendered = page.locator('.vpt-card img.vpt-img')
  const initial = await rendered.count()
  expect(initial).toBeGreaterThan(0)
  // Initial window must be the bounded default (<=12), never the whole 24-page doc.
  expect(initial).toBeLessThanOrEqual(12)

  // The preview scrolls inside its own .vpt-scroll container, not the window.
  // Scroll to the bottom and dispatch a scroll event so the lazy handler runs.
  await page.locator('.vpt-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event('scroll'))
  })
  await page.waitForTimeout(2000)
  const afterScroll = await rendered.count()
  expect(afterScroll).toBeGreaterThan(initial)

  await expect(page).toHaveScreenshot('preview-window.png', { maxDiffPixelRatio: 0.05 })
})
