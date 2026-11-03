import { describe, it, expect } from 'vitest'
import {
  createProcessingError,
  isProcessingError,
  toProcessingError,
  i18nKeyFor,
  ERROR_FALLBACK_MESSAGES
} from '../../src/core/errors'

describe('errors', () => {
  it('createProcessingError defaults to UNKNOWN with a fallback message', () => {
    const e = createProcessingError()
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe(ERROR_FALLBACK_MESSAGES.UNKNOWN)
    expect(e.i18nKey).toBe('error.unknown')
    expect(e.retryable).toBe(false)
    expect(isProcessingError(e)).toBe(true)
  })

  it('createProcessingError honors code/message/retryable/context', () => {
    const e = createProcessingError({ code: 'CORRUPTED', message: 'bad', retryable: true, context: { pages: 3 } })
    expect(e.code).toBe('CORRUPTED')
    expect(e.message).toBe('bad')
    expect(e.i18nKey).toBe('error.corrupted')
    expect(e.retryable).toBe(true)
    expect(e.context).toEqual({ pages: 3 })
  })

  it('createProcessingError falls back to UNKNOWN on an unknown code', () => {
    const e = createProcessingError({ code: 'TOTALLY_UNKNOWN' as never })
    expect(e.code).toBe('UNKNOWN')
    expect(e.i18nKey).toBe('error.unknown')
  })

  it('i18nKeyFor maps a code to error.<lowercase>', () => {
    expect(i18nKeyFor('PASSWORD_PROTECTED')).toBe('error.password_protected')
  })

  it('toProcessingError passes through a PdfProcessingError', () => {
    const orig = createProcessingError({ code: 'CORRUPTED' })
    expect(toProcessingError(orig)).toBe(orig)
  })

  it('toProcessingError maps DOMException AbortError → CANCELLED', () => {
    const dom = new DOMException('aborted', 'AbortError')
    const e = toProcessingError(dom)
    expect(e.code).toBe('CANCELLED')
    expect(isProcessingError(e)).toBe(true)
  })

  it('toProcessingError normalizes a plain Error to UNKNOWN (preserving cause)', () => {
    const cause = new Error('boom')
    const e = toProcessingError(cause)
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('boom')
    expect(e.cause).toBe(cause)
  })

  it('toProcessingError normalizes non-Error throws', () => {
    const e = toProcessingError('string failure')
    expect(e.code).toBe('UNKNOWN')
    expect(e.message).toBe('string failure')
  })
})
