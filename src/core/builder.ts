/**
 * Preview build contract (build-injection pattern): decouples "where the PDF
 * comes from" from "how it's displayed". The caller supplies `build`; the
 * library only schedules rendering, lazy-loading, cancellation and URL lifecycle.
 *
 * Also exports `createPdfPreviewBuilder()` — a ready-made builder backed by the
 * library's own Worker, so `<PdfPreview :files="files" />` works out of the box.
 */

import { getDefaultWorker } from './default-worker'
import type { PreviewRequest, PreviewResult } from '../worker/dto'
import type { PdfPreviewPageSource, PdfPreviewBuildResult, PdfPreviewBuilder } from './builder-types'

export type { PdfPreviewPageSource, PdfPreviewBuildResult, PdfPreviewBuilder } from './builder-types'

export interface CreatePdfPreviewBuilderOptions {
  /** Render DPI for the preview bitmap. */
  dpi?: number
  /** Per-page pixel ceiling. */
  maxPixels?: number
  /** [补充①] Fetch textContent per page (for the selectable text layer). */
  wantText?: boolean
  /** [补充②] Fetch annotations per page (for the annotation layer). */
  wantAnnotations?: boolean
  /** Annotation extraction intent. */
  annotationIntent?: 'display' | 'enableForms'
  /** Initial window size when no range is requested. */
  maxPages?: number
}

/**
 * Default builder: rasterizes the first file via the bundled Worker.
 * Reads the File into an ArrayBuffer and transfers it to the Worker.
 */
export function createPdfPreviewBuilder(options: CreatePdfPreviewBuilderOptions = {}): PdfPreviewBuilder {
  const worker = getDefaultWorker()
  return async (files, signal, onProgress, req) => {
    const pdf = files[0]
    if (!pdf) return { pages: [], total: 0, skipped: 0 }
    const buf = await pdf.arrayBuffer()
    const payload: PreviewRequest = {
      pdf: buf,
      pageRange: req?.pageRange,
      dpi: options.dpi,
      maxPixels: options.maxPixels,
      wantText: options.wantText,
      wantAnnotations: options.wantAnnotations,
      annotationIntent: options.annotationIntent,
      maxPages: options.maxPages
    }
    const res = await worker.call<PreviewRequest, PreviewResult>('pdf-preview-pages', payload, {
      signal,
      onProgress: (p) => onProgress?.({ current: p.current, total: p.total }),
      transfer: [buf]
    })
    return {
      pages: res.pages.map((p) => ({
        pageNumber: p.pageNumber,
        blob: p.blob,
        width: p.width,
        height: p.height,
        textContent: p.textContent,
        viewport: p.viewport,
        annotations: p.annotations
      })) as PdfPreviewPageSource[],
      total: res.total,
      skipped: res.skipped
    } satisfies PdfPreviewBuildResult
  }
}
