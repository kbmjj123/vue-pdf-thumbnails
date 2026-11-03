// Generates a 24-page sample PDF used by the Playwright visual-regression spec.
// Run via `pnpm test:visual` (which invokes this before `playwright test`).
// The output is git-ignored; it is regenerated on every run.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'examples', 'demo', 'public')
const out = join(outDir, 'sample.pdf')
mkdirSync(outDir, { recursive: true })

try {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = 24
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842])
    p.drawText(`Page ${i + 1}`, { x: 50, y: 800, size: 28, font, color: rgb(0, 0, 0) })
    p.drawText('vue-pdf-thumbnails sample document (visual-regression fixture).', {
      x: 50,
      y: 760,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3)
    })
  }
  writeFileSync(out, await doc.save())
  console.log(`wrote ${out} (${pages} pages)`)
} catch (e) {
  console.error('Failed to generate sample PDF — run `pnpm install` first (needs pdf-lib).', e)
  process.exit(1)
}
