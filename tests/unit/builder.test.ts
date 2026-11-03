import { describe, it, expect, vi, beforeEach } from 'vitest'

// The default builder shells out to getDefaultWorker() — which spins up a real
// Worker that cannot run under jsdom. Mock the worker client so we can assert
// the builder's wiring (payload shape, transfer list, result mapping) in isolation.
vi.mock('../../src/core/default-worker', () => ({
  getDefaultWorker: vi.fn()
}))

import { getDefaultWorker } from '../../src/core/default-worker'
import { createPdfPreviewBuilder } from '../../src/core/builder'

// jsdom's File/Blob does not implement arrayBuffer(); polyfill it so the builder
// (which calls files[0].arrayBuffer()) can run under vitest's jsdom environment.
if (typeof File.prototype.arrayBuffer !== 'function') {
  File.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as ArrayBuffer)
      fr.onerror = () => reject(fr.error)
      fr.readAsArrayBuffer(this)
    })
  }
}

const mockWorker = {
  call: vi.fn()
}
function setupWorker(result: unknown): void {
  ;(getDefaultWorker as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockWorker)
  // Simulate the worker emitting one progress tick before resolving.
  mockWorker.call.mockImplementation(async (_method: string, _payload: unknown, opts?: { onProgress?: (p: { current: number; total: number }) => void }) => {
    opts?.onProgress?.({ current: 1, total: 1 })
    return result
  })
}

describe('createPdfPreviewBuilder', () => {
  beforeEach(() => {
    mockWorker.call.mockReset()
    ;(getDefaultWorker as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  it('returns empty without calling the worker when there is no file', async () => {
    setupWorker(null)
    const build = createPdfPreviewBuilder()
    const res = await build([], new AbortController().signal, undefined, {})
    expect(res).toEqual({ pages: [], total: 0, skipped: 0 })
    expect(mockWorker.call).not.toHaveBeenCalled()
  })

  it('reads the first file and forwards the request to the worker', async () => {
    setupWorker({
      pages: [
        {
          pageNumber: 1,
          blob: new Blob(['x']),
          width: 10,
          height: 10,
          textContent: { items: [] },
          annotations: []
        }
      ],
      total: 1,
      skipped: 0
    })
    const build = createPdfPreviewBuilder({
      wantText: true,
      wantAnnotations: true,
      annotationIntent: 'enableForms'
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' })
    const onProgress = vi.fn()
    const res = await build([file], new AbortController().signal, onProgress, { pageRange: '1-3' })

    expect(mockWorker.call).toHaveBeenCalledTimes(1)
    const [method, payload, opts] = mockWorker.call.mock.calls[0]!
    expect(method).toBe('pdf-preview-pages')
    expect(payload.pageRange).toBe('1-3')
    expect(payload.wantText).toBe(true)
    expect(payload.wantAnnotations).toBe(true)
    expect(payload.annotationIntent).toBe('enableForms')
    expect(payload.pdf).toBeInstanceOf(ArrayBuffer)
    expect(opts.transfer).toContain(payload.pdf)
    expect(onProgress).toHaveBeenCalled()

    expect(res.pages).toHaveLength(1)
    expect(res.pages[0]!.pageNumber).toBe(1)
    expect(res.pages[0]!.textContent).toEqual({ items: [] })
    expect(res.pages[0]!.annotations).toEqual([])
    expect(res.total).toBe(1)
  })
})
