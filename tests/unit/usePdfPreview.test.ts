import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePdfPreview } from '../../src/composables/usePdfPreview'
import { parsePageRange } from '../../src/core/page-range'
import type { PdfPreviewBuilder } from '../../src/core/builder-types'

const TOTAL = 500

/** Build a fake build() result for a given (possibly windowed) page range. */
function resultFor(pageRange: string, total = TOTAL) {
  const pages = parsePageRange(pageRange, total).map((n) => ({
    pageNumber: n,
    blob: new Blob(['x']),
    width: 100,
    height: 140
  }))
  return { pages, total, skipped: 0 }
}

type BuildOpts = { failWithCancelledOnSecond?: boolean }
function makeBuild(opts: BuildOpts = {}) {
  const calls: { req: { pageRange?: string }; signal: AbortSignal }[] = []
  let count = 0
  const build: PdfPreviewBuilder = vi.fn(async (_files, signal, onProgress, req) => {
    count++
    calls.push({ req: req as { pageRange?: string }, signal })
    if (opts.failWithCancelledOnSecond && count >= 2) {
      // Mimic the worker aborting a superseded run.
      throw Object.assign(new Error('cancelled'), { name: 'PdfProcessingError', code: 'CANCELLED' })
    }
    onProgress?.({ current: 1, total: 1 })
    return resultFor((req?.pageRange as string) ?? '1-12')
  }) as PdfPreviewBuilder
  return { build, calls, get count() { return count } }
}

/** Run the composable inside a real component so onUnmounted fires correctly. */
function setup(build: PdfPreviewBuilder, extra: Record<string, unknown> = {}) {
  const file = new File([new Uint8Array([1])], 'a.pdf', { type: 'application/pdf' })
  let api: ReturnType<typeof usePdfPreview>
  const Comp = defineComponent({
    setup() {
      api = usePdfPreview({ files: () => [file], build, ...(extra as object) })
      return () => null
    }
  })
  const wrapper = mount(Comp)
  return { wrapper, getApi: () => api! }
}

async function flush(): Promise<void> {
  // Drain the microtask queue so async renderRange() side effects land.
  await nextTick()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('usePdfPreview (deterministic)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    if (typeof (URL as { createObjectURL?: unknown }).createObjectURL !== 'function') {
      ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:mock'
      ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}
    }
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rebuilds on mount and requests only the initial window (not the whole doc)', async () => {
    const { build, calls } = makeBuild()
    const { wrapper, getApi } = setup(build)
    expect(calls.length).toBe(0) // debounced
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    expect(calls.length).toBe(1)
    expect(calls[0]!.req.pageRange).toBe('1-12')
    expect(getApi().total.value).toBe(TOTAL)
    expect(getApi().renderedCount.value).toBe(12)
    wrapper.unmount()
  })

  it('honors the maxPages option for the initial window', async () => {
    const { build, calls } = makeBuild()
    const { wrapper } = setup(build, { maxPages: () => 5 })
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    expect(calls[0]!.req.pageRange).toBe('1-5')
    wrapper.unmount()
  })

  it('ensure() requests only missing pages and dedupes', async () => {
    const { build, calls } = makeBuild()
    const { wrapper, getApi } = setup(build)
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    getApi().ensure('20-25')
    await flush()
    expect(calls.length).toBe(2)
    expect(calls[1]!.req.pageRange).toBe('20-25')
    getApi().ensure('20-25') // already cached → no new build
    await flush()
    expect(calls.length).toBe(2)
    wrapper.unmount()
  })

  it('does not surface a CANCELLED run as an error', async () => {
    const { build } = makeBuild({ failWithCancelledOnSecond: true })
    const { wrapper, getApi } = setup(build)
    await vi.advanceTimersByTimeAsync(400)
    await flush() // first call (1-12) succeeds, sets total
    expect(getApi().total.value).toBe(TOTAL)
    getApi().ensure('20-25') // second call throws CANCELLED
    await flush()
    expect(getApi().errorCode.value).toBe('')
    wrapper.unmount()
  })

  it('virtualization: never requests the full 500-page range', async () => {
    const { build, calls } = makeBuild()
    const { wrapper, getApi } = setup(build)
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    for (const r of ['40-52', '120-135', '300-318', '480-500']) {
      getApi().ensure(r)
      await flush()
    }
    const requested = calls.map((c) => c.req.pageRange)
    expect(requested[0]).toBe('1-12')
    expect(requested.some((r) => r === '1-500' || r === 'all')).toBe(false)
    // Every requested range is a bounded window, not the entire document.
    expect(requested.every((r) => parsePageRange(r!, TOTAL).length <= 30)).toBe(true)
    wrapper.unmount()
  })
})
