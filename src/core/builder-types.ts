/** Public build-contract types (kept separate so builder.ts can self-reference). */

/** Single page bitmap (Worker returns this before it becomes an Object URL). */
export interface PdfPreviewPageSource {
  pageNumber: number
  blob: Blob
  width: number
  height: number
  /** [补充①] Serializable pdf.js textContent for the selectable text layer. */
  textContent?: unknown
  /** Rendered-page viewport (serializes on postMessage) — positions the text/annotation overlays. */
  viewport?: unknown
  /** [补充②] Serializable pdf.js annotations for the annotation layer. */
  annotations?: unknown
}

/** Result of one preview build. */
export interface PdfPreviewBuildResult {
  /** Rendered pages (ascending by page number). */
  pages: PdfPreviewPageSource[]
  /** Real document total (page count), for "N more pages" hints. */
  total: number
  /** Pages that failed to render. */
  skipped: number
}

/**
 * Build function supplied by the caller; heavy work must happen inside a Worker.
 * `files` is passed through from the component. `onProgress` streams Worker
 * progress. `req.pageRange` selects which pages to render this call
 * (e.g. "1-12", "50-65"); omit for the initial window.
 */
export type PdfPreviewBuilder = (
  files: File[],
  signal: AbortSignal,
  onProgress?: (progress: { current: number; total: number }) => void,
  req?: { pageRange?: string }
) => Promise<PdfPreviewBuildResult>
