/**
 * Library preview worker entry. Self-contained: sets up the pdf.js Worker
 * environment, registers the `pdf-preview-pages` handler, and starts the loop.
 */

import './env'
import { createWorkerHandlerRegistry } from './protocol'
import { openPdf } from './env'
import { renderPdfPreviewByRange, resolvePreviewWindow } from './preview'
import { parsePageRange } from '../core/page-range'
import type { PreviewRequest, PreviewResult } from './dto'

const registry = createWorkerHandlerRegistry()

registry.register('pdf-preview-pages', async (payload: PreviewRequest, ctx) => {
  // Copy so pdf.js detaching the underlying buffer can't surprise the caller.
  const data = new Uint8Array(payload.pdf.slice(0))
  // getDocument() detaches `data`'s ArrayBuffer (pdf.js transfers it to its own
  // worker / fake worker), so keep an independent copy for the render pass,
  // which re-opens the document internally.
  const renderBytes = data.slice()
  const loadingTask = openPdf(data)
  const doc = await loadingTask.promise
  try {
    const total = doc.numPages
    const wanted = payload.pageRange
      ? parsePageRange(payload.pageRange, total)
      : resolvePreviewWindow(undefined, total, payload.maxPages)
    if (wanted.length === 0) return { pages: [], total, skipped: 0 } as PreviewResult
    const pages = await renderPdfPreviewByRange(renderBytes, wanted, {
      dpi: payload.dpi ?? 110,
      maxPixels: payload.maxPixels,
      report: (c, t) => ctx.reportProgress({ current: c, total: t }),
      wantText: payload.wantText,
      wantAnnotations: payload.wantAnnotations,
      annotationIntent: payload.annotationIntent
    })
    return { pages, total, skipped: 0 } as PreviewResult
  } finally {
    await loadingTask.destroy().catch(() => {})
  }
})

const workerSelf = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (m: unknown) => void
}
registry.start(workerSelf)
