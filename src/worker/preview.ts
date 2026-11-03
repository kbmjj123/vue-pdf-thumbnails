/**
 * Preview render strategy: page-range window + embedded-font fallback.
 * Extracted from minopdf.com app/workers/preview.ts, extended to optionally
 * return textContent / annotations for the overlay layers (补充①/②).
 */

import { openPdf } from './env'
import { renderPageToImage } from './render'
import { parsePageRange } from '../core/page-range'
import type { PreviewPageSource } from './dto'

/** Preview DPI — lower than export, still screen-crisp. */
export const PREVIEW_DPI = 110
/** Defensive cap so a huge range can't be requested. */
export const PREVIEW_MAX_PAGES = 20
/** Per-page pixel ceiling to avoid blowing the browser's decoded-bitmap budget. */
const PREVIEW_MAX_PIXELS = 40_000_000

export interface PreviewRenderOptions {
  dpi: number
  maxPixels?: number
  report?: (current: number, total: number) => void
  /** [补充①] Attach serializable textContent to each page. */
  wantText?: boolean
  /** [补充②] Attach serializable annotations to each page. */
  wantAnnotations?: boolean
  /** Intent for annotation extraction. */
  annotationIntent?: 'display' | 'enableForms'
}

/**
 * Render a real page-range window of a PDF (with font fallback).
 * A single failed page is skipped (preview is auxiliary); only an all-fail throws.
 */
export async function renderPdfPreviewByRange(
  bytes: Uint8Array,
  wanted: number[],
  options: PreviewRenderOptions
): Promise<PreviewPageSource[]> {
  const tryRender = async (disableFontFace: boolean): Promise<{ pages: PreviewPageSource[]; firstInk: number }> => {
    const loadingTask = openPdf(bytes.slice(), { disableFontFace })
    const doc = await loadingTask.promise
    try {
      const pages: PreviewPageSource[] = []
      let firstInk = 0
      let lastError: unknown = null
      for (let i = 0; i < wanted.length; i++) {
        const n = wanted[i]!
        try {
          const img = await renderPageToImage(
            doc,
            n,
            'png',
            options.dpi,
            1,
            i === 0,
            0,
            options.maxPixels ?? PREVIEW_MAX_PIXELS
          )
          if (i === 0) firstInk = img.ink ?? 0
          const page: PreviewPageSource = { pageNumber: n, blob: img.blob, width: img.width, height: img.height }
          if (options.wantText || options.wantAnnotations) page.viewport = img.viewport
          if (options.wantText) {
            const pg = await doc.getPage(n)
            try { page.textContent = await pg.getTextContent() } finally { pg.cleanup() }
          }
          if (options.wantAnnotations) {
            const pg = await doc.getPage(n)
            try { page.annotations = await pg.getAnnotations({ intent: options.annotationIntent ?? 'display' }) } finally { pg.cleanup() }
          }
          pages.push(page)
        } catch (e) {
          lastError = e
        }
        options.report?.(i + 1, wanted.length)
      }
      if (pages.length === 0 && lastError) throw lastError
      return { pages, firstInk }
    } finally {
      await loadingTask.destroy().catch(() => {})
    }
  }

  // The browser's font sanitizer (OTS) may reject embedded fonts, leaving a
  // blank page. Detect via first-page ink and fall back to system fonts.
  const first = await tryRender(false)
  if (first.pages.length > 0 && first.firstInk > 0) return first.pages
  const fallback = await tryRender(true)
  return fallback.pages.length > 0 ? fallback.pages : first.pages
}

/** Convenience: resolve a page range against the document total, defaulting to a window. */
export function resolvePreviewWindow(pageRange: string | undefined, total: number, maxPages = PREVIEW_MAX_PAGES): number[] {
  if (pageRange) return parsePageRange(pageRange, total)
  return Array.from({ length: Math.min(total, maxPages) }, (_, i) => i + 1)
}
