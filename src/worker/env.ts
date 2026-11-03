/**
 * pdf.js runtime environment inside a Web Worker (extracted from minopdf.com
 * app/workers/env.ts). Worker has no DOM, so pdf.js's default impl would touch
 * `document`; we stub it out and inject offscreen canvas / null filter factories.
 *
 * Also wires the nested pdf.js decode worker via `workerSrc` and the embedded
 * font shim so Worker-side rendering can use in-document fonts.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { createProcessingError } from '../core/errors'

// pdf.js v6 requires workerSrc to be set. In a browser it spawns this decode
// worker (or falls back to a same-thread "fake worker" if it can't); inside our
// own module worker either mode keeps heavy decode off the main thread.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

if (typeof self.document === 'undefined') {
  const stub = (): Record<string, unknown> => ({
    setAttribute: () => undefined,
    getAttribute: () => null,
    style: {},
    getContext: () => null
  })
  ;(self as unknown as { document: unknown }).document = {
    fonts: (self as unknown as { fonts: unknown }).fonts,
    createElement: stub,
    createElementNS: stub
  }
}

class OffscreenCanvasFactory {
  private enableHWA: boolean
  constructor({ enableHWA = false }: { enableHWA?: boolean } = {}) {
    this.enableHWA = enableHWA
  }
  create(width: number, height: number) {
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    const canvas = new OffscreenCanvas(w, h)
    const context = canvas.getContext('2d', { willReadFrequently: !this.enableHWA })
    if (!context) {
      throw createProcessingError({ code: 'WORKER_ERROR', message: 'Canvas 2D context unavailable' })
    }
    return { canvas, context }
  }
  reset(entry: { canvas: OffscreenCanvas | null }, width: number, height: number): void {
    if (!entry.canvas) throw new Error('Canvas is not specified')
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size')
    entry.canvas.width = width
    entry.canvas.height = height
  }
  // pdf.js v6 CanvasFactory.getNoAlphaContext receives an existing canvas and must
  // return its (opaque) 2D context — used for the no-alpha compositing path.
  getNoAlphaContext(canvas: OffscreenCanvas) {
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: !this.enableHWA })
    if (!context) {
      throw createProcessingError({ code: 'WORKER_ERROR', message: 'Canvas 2D context unavailable' })
    }
    return context
  }
  destroy(entry: { canvas: OffscreenCanvas | null; context: unknown }): void {
    if (!entry.canvas) throw new Error('Canvas is not specified')
    entry.canvas.width = 0
    entry.canvas.height = 0
    entry.canvas = null
    entry.context = null
  }
}

// Default DOMFilterFactory builds SVG via document; unsupported in a Worker,
// so degrade to "none" (consistent with pdf.js's Node implementation).
class NullFilterFactory {
  addFilter() { return 'none' }
  addHCMFilter() { return 'none' }
  addAlphaFilter() { return 'none' }
  addLuminosityFilter() { return 'none' }
  addKnockoutFilter() { return 'none' }
  addHighlightHCMFilter() { return 'none' }
  addSelectionHCMFilter() { return 'none' }
  addSelectionFilter() { return 'none' }
  createSelectionStyle() { return null }
  destroy() {}
}

/** Single entry point for opening a PDF inside the worker. */
export function openPdf(data: Uint8Array, opts: { disableFontFace?: boolean } = {}) {
  return pdfjsLib.getDocument({
    data,
    CanvasFactory: OffscreenCanvasFactory,
    FilterFactory: NullFilterFactory,
    disableFontFace: opts.disableFontFace ?? false
  })
}
