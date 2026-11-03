/**
 * Render a single PDF page to a bitmap (Worker-side, OffscreenCanvas).
 * Extracted from minopdf.com app/workers/render.ts; only the import paths and
 * the RenderedImage type changed.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createProcessingError } from '../core/errors'
import type { ImageFormat, RenderedImage } from './dto'

function canvasType(format: ImageFormat): string {
  if (format === 'jpg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

function canvasQuality(format: ImageFormat, quality: number): number | undefined {
  if (format === 'png') return undefined
  if (!Number.isFinite(quality)) return 0.92
  return Math.min(1, Math.max(0.1, quality))
}

/** Render a single PDF page to an image (OffscreenCanvas inside the Worker). */
export async function renderPageToImage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  format: ImageFormat,
  dpi: number,
  quality: number,
  measureInk = false,
  rotation = 0,
  maxPixels?: number,
  transform?: (context: OffscreenCanvasRenderingContext2D, width: number, height: number) => void,
  annotationMode?: number
): Promise<RenderedImage> {
  const page = await doc.getPage(pageNumber)
  try {
    const rotationDeg = (((page.rotate + rotation) % 360) + 360) % 360
    let effectiveDpi = dpi
    let scale = dpi / 72
    let viewport = page.getViewport({ scale, rotation: rotationDeg })
    if (maxPixels && viewport.width * viewport.height > maxPixels) {
      const ratio = Math.sqrt(maxPixels / (viewport.width * viewport.height))
      effectiveDpi = Math.max(1, Math.floor(dpi * ratio))
      scale = effectiveDpi / 72
      viewport = page.getViewport({ scale, rotation: rotationDeg })
    }
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) {
      throw createProcessingError({ code: 'WORKER_ERROR', message: 'Canvas 2D context unavailable' })
    }
    if (format === 'jpg' || transform) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      ...(annotationMode !== undefined ? { annotationMode } : {})
    }).promise
    let ink: number | undefined
    if (measureInk) ink = countInk(context, canvas.width, canvas.height)
    if (transform) transform(context, canvas.width, canvas.height)
    const blob = await canvas.convertToBlob({ type: canvasType(format), quality: canvasQuality(format, quality) })
    const result: RenderedImage = { blob, width: canvas.width, height: canvas.height, pageNumber, format, actualDpi: effectiveDpi }
    if (ink !== undefined) result.ink = ink
    result.viewport = viewport
    return result
  } finally {
    page.cleanup()
  }
}

/** Count non-white opaque pixels — pdf.js paints white-background pages, so ink ⇒ text drawn. */
export function countInk(context: OffscreenCanvasRenderingContext2D, width: number, height: number): number {
  const data = context.getImageData(0, 0, width, height).data
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! > 32 && (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200)) ink++
  }
  return ink
}

/** Measure one page's ink without encoding a blob (blank-page detection). */
export async function measurePageInk(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  dpi = 36
): Promise<{ ink: number; width: number; height: number }> {
  const page = await doc.getPage(pageNumber)
  try {
    const viewport = page.getViewport({ scale: dpi / 72 })
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) {
      throw createProcessingError({ code: 'WORKER_ERROR', message: 'Canvas 2D context unavailable' })
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport
    }).promise
    const ink = countInk(context, canvas.width, canvas.height)
    return { ink, width: canvas.width, height: canvas.height }
  } finally {
    page.cleanup()
  }
}
