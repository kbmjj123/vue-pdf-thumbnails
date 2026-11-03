// Public API surface for vue-pdf-thumbnails.
import PdfPreview from './components/PdfPreview.vue'
export { PdfPreview }
export { usePdfPreview, PDF_PREVIEW_MAX_PAGES } from './composables/usePdfPreview'
export type { PdfPreviewPageView, PdfPreviewSlot, UsePdfPreviewParams } from './composables/usePdfPreview'
export { createPdfPreviewBuilder } from './core/builder'
export type {
  PdfPreviewBuilder,
  PdfPreviewBuildResult,
  PdfPreviewPageSource,
  CreatePdfPreviewBuilderOptions
} from './core/builder'
export { createPdfThumbnailWorker } from './core/worker-client'
export type { PdfThumbnailWorkerClient } from './core/worker-client'
export { getDefaultWorker } from './core/default-worker'
export { createUrlManager } from './core/url-manager'
export type { UrlManager } from './core/url-manager'
export { DEFAULT_PREVIEW_TEXTS, interpolate } from './i18n/preview-texts'
export type { PreviewTexts } from './i18n/preview-texts'
export { parsePageRange, formatPageRange, parsePageSelection, isValidPageRange } from './core/page-range'
export {
  createProcessingError,
  toProcessingError,
  isProcessingError,
  i18nKeyFor,
  ERROR_FALLBACK_MESSAGES
} from './core/errors'
export type { ErrorCode, PdfProcessingError, ErrorI18nKey } from './core/errors'
