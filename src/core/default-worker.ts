import { createPdfThumbnailWorker, type PdfThumbnailWorkerClient } from './worker-client'

let singleton: PdfThumbnailWorkerClient | null = null

/** Shared worker client (one per app, like minopdf.com's input-preview worker). */
export function getDefaultWorker(): PdfThumbnailWorkerClient {
  if (!singleton) singleton = createPdfThumbnailWorker()
  return singleton
}
