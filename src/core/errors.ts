/**
 * 处理错误与错误码（提取自 minopdf.com app/shared/types/errors.ts）。
 *
 * 所有可解释错误统一为 PdfProcessingError，带结构化 code 与 i18n key。
 * context 字段仅存放非内容的诊断信息（如页数、文件大小区间），
 * 绝不存放文件名、文本或文件内容。
 */

export type ErrorCode =
  | 'UNKNOWN'
  | 'EMPTY_FILE'
  | 'UNSUPPORTED_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'PARSE_FAILED'
  | 'PASSWORD_PROTECTED'
  | 'WRONG_PASSWORD'
  | 'CORRUPTED'
  | 'ENCODE_FAILED'
  | 'CANCELLED'
  | 'WORKER_ERROR'
  | 'CONCURRENCY_LIMIT'
  | 'INVALID_OUTPUT'
  | 'INVALID_INPUT'
  | 'MEMORY_LIMIT'
  | 'NO_TEXT_LAYER'
  | 'FONT_LOAD_FAILED'
  | 'NO_EMBEDDED_IMAGES'
  | 'NO_ANNOTATIONS'
  | 'NO_TABLES_DETECTED'

/** i18n key 命名约定：error.<code>，组件用 useI18n 翻译；同时提供内置回退。 */
export type ErrorI18nKey = `error.${Lowercase<ErrorCode>}`

export interface PdfProcessingError extends Error {
  code: ErrorCode
  i18nKey: ErrorI18nKey
  /** 是否可重试（如超限降级、内存不足）。 */
  retryable: boolean
  /** 非内容诊断信息（页数、大小区间、格式等）；禁止放入文件内容。 */
  context?: Record<string, unknown>
  /** 原始错误（仅用于调试；绝不存放文件内容）。 */
  cause?: unknown
}

/** 内置可读消息回退（英文），确保即使 i18n 未覆盖也能显示。 */
export const ERROR_FALLBACK_MESSAGES: Record<ErrorCode, string> = {
  UNKNOWN: 'Something went wrong while processing the file.',
  EMPTY_FILE: 'The file is empty. Please choose a file with content.',
  UNSUPPORTED_FORMAT: 'This file format is not supported by this tool.',
  FILE_TOO_LARGE: 'The file exceeds the size limit for this tool.',
  PARSE_FAILED: 'The file could not be parsed. It may be damaged.',
  PASSWORD_PROTECTED: 'This file is password protected and cannot be opened.',
  WRONG_PASSWORD: 'The password is incorrect. Please check and try again.',
  CORRUPTED: 'The file appears to be corrupted and cannot be opened.',
  ENCODE_FAILED: 'The result could not be generated. Please try again.',
  CANCELLED: 'Processing was cancelled.',
  WORKER_ERROR: 'The processing worker stopped unexpectedly.',
  CONCURRENCY_LIMIT: 'Too many items are being processed at once.',
  INVALID_OUTPUT: 'The generated output did not pass validation.',
  INVALID_INPUT: 'The selected options are not valid for this file. Please check them and try again.',
  MEMORY_LIMIT: 'Not enough memory to process this file. Try a smaller file.',
  NO_TEXT_LAYER: 'This PDF has no selectable text layer. It is probably a scan or image-only file — run OCR first.',
  FONT_LOAD_FAILED: 'The font needed for these characters could not be loaded. Check your connection and try again.',
  NO_EMBEDDED_IMAGES: 'This PDF contains no extractable image objects. Try the whole-page rendering mode instead.',
  NO_ANNOTATIONS: 'No matching annotations were found in this PDF, so there was nothing to remove.',
  NO_TABLES_DETECTED: 'No tables were detected in the selected pages. Try a wider page range or a PDF with clearer row and column structure.'
}

/** i18n key 与 code 一一对应。 */
export function i18nKeyFor(code: ErrorCode): ErrorI18nKey {
  return `error.${code.toLowerCase()}` as ErrorI18nKey
}

export interface CreateErrorOptions {
  code?: ErrorCode
  message?: string
  retryable?: boolean
  context?: Record<string, unknown>
  cause?: unknown
}

/** 构造标准处理错误。优先使用 message，否则回退内置消息。 */
export function createProcessingError(opts: CreateErrorOptions = {}): PdfProcessingError {
  // code 可能来自 Worker 消息等外部输入。不是已知错误码时退回 UNKNOWN：
  // 否则 i18nKeyFor 会在 code.toLowerCase() 处抛错，把真正的错误吞掉。
  const code = (
    typeof opts.code === 'string' && opts.code in ERROR_FALLBACK_MESSAGES ? opts.code : 'UNKNOWN'
  ) as ErrorCode
  const message = opts.message ?? ERROR_FALLBACK_MESSAGES[code]
  const err = new Error(message) as PdfProcessingError
  err.name = 'PdfProcessingError'
  err.code = code
  err.i18nKey = i18nKeyFor(code)
  err.retryable = opts.retryable ?? false
  if (opts.context) err.context = opts.context
  if (opts.cause !== undefined) err.cause = opts.cause
  return err
}

/** 类型守卫。 */
export function isProcessingError(e: unknown): e is PdfProcessingError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { name?: string }).name === 'PdfProcessingError' &&
    typeof (e as PdfProcessingError).code === 'string'
  )
}

/** 把任意异常归一化为 PdfProcessingError（保留非内容诊断信息）。 */
export function toProcessingError(e: unknown): PdfProcessingError {
  if (isProcessingError(e)) return e
  if (e instanceof DOMException && e.name === 'AbortError') {
    return createProcessingError({ code: 'CANCELLED' })
  }
  if (e instanceof Error) {
    return createProcessingError({
      code: 'UNKNOWN',
      message: e.message,
      context: { name: e.name, stack: e.stack },
      cause: e
    })
  }
  // 非 Error 抛出（例如某些 pdf.js 拒绝对象）：序列化，避免消息退化成 "[object Object]"。
  let detail: string
  try {
    detail = typeof e === 'string' ? e : JSON.stringify(e)
  } catch {
    detail = String(e)
  }
  return createProcessingError({ code: 'UNKNOWN', message: detail, context: { raw: detail }, cause: e })
}
