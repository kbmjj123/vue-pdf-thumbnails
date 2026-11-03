/** Worker ↔ main-thread DTOs for the preview pipeline. */

export type ImageFormat = 'png' | 'jpg' | 'webp'

/** Single rendered page bitmap (used internally by render.ts). */
export interface RenderedImage {
  blob: Blob
  width: number
  height: number
  pageNumber: number
  format: ImageFormat
  /** Actual DPI after any downscale to stay within maxPixels. */
  actualDpi?: number
  /** Non-white pixel count (only when measureInk requested). */
  ink?: number
  /** Rendered-page viewport (serializes on postMessage) — drives the text layer overlay. */
  viewport?: unknown
}

/** A rendered preview page (bitmap only). */
export interface PdfPreviewPage {
  pageNumber: number
  blob: Blob
  width: number
  height: number
}

/** A rendered preview page enriched with optional overlay data. */
export interface PreviewPageSource extends PdfPreviewPage {
  /** [补充①] Serializable pdf.js textContent for the selectable text layer. */
  textContent?: unknown
  /** Rendered-page viewport (serializes on postMessage) — positions the text/annotation overlays. */
  viewport?: unknown
  /** [补充②] Serializable pdf.js annotations for the annotation layer. */
  annotations?: unknown
}

/** Worker request payload for `pdf-preview-pages`. */
export interface PreviewRequest {
  /** PDF bytes (ownership transferred to the worker). */
  pdf: ArrayBuffer
  /** Page range like "1-12" / "50-65" / "all"; omitted → initial window. */
  pageRange?: string
  /** Render DPI for the preview bitmap. */
  dpi?: number
  /** Per-page pixel ceiling; pages above it are downscaled. */
  maxPixels?: number
  /** [补充①] Also return textContent for each page. */
  wantText?: boolean
  /** [补充②] Also return annotations for each page. */
  wantAnnotations?: boolean
  /** Intent for annotation extraction: form fields vs display. */
  annotationIntent?: 'display' | 'enableForms'
  /** Initial window size when pageRange is omitted. */
  maxPages?: number
}

/** Worker result for `pdf-preview-pages`. */
export interface PreviewResult {
  pages: PreviewPageSource[]
  /** Real total page count of the document. */
  total: number
  /** Number of pages that failed to render. */
  skipped: number
}
