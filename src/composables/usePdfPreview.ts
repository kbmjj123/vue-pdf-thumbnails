/**
 * Preview orchestration (extracted from minopdf.com app/composables/usePdfPreview.ts,
 * decoupled): when to rebuild, how to cancel, when to release — without knowing
 * how the PDF is produced. The caller injects `build` (which renders in a Worker).
 *
 * Three hard rules (docs/08):
 * 1. Heavy compute stays in the Worker (inside `build`) — main thread only shows.
 * 2. File/option changes debounce-rebuild; AbortController cancels the prior run.
 * 3. Every rebuild revokes the previously issued Object URLs (hard rule 9).
 *
 * Lazy rendering: pages occupy real slots 1..total; only the viewport window is
 * requested from the Worker. Results merge incrementally into a cache keyed by
 * page number, so scrolling never re-renders.
 */

import { computed, onUnmounted, ref, watch } from 'vue'
import { toProcessingError } from '../core/errors'
import { createUrlManager } from '../core/url-manager'
import { formatPageRange, parsePageRange } from '../core/page-range'
import type { PdfPreviewBuilder } from '../core/builder-types'

/** A rendered page view (blob → Object URL managed by the UrlManager). */
export interface PdfPreviewPageView {
  pageNumber: number
  url: string
  width: number
  height: number
  /** [补充①] Serializable pdf.js textContent, present when showTextLayer is on. */
  textContent?: unknown
  /** Rendered-page viewport needed to position the text (and annotation) overlays. */
  viewport?: unknown
  /** [补充②] Serializable pdf.js annotations, present when annotationMode !== 'none'. */
  annotations?: unknown
}

export interface PdfPreviewSlot {
  pageNumber: number
  view?: PdfPreviewPageView
}

export interface UsePdfPreviewParams {
  files: () => File[]
  build: PdfPreviewBuilder
  /** Extra change signature (options, etc.) merged with the file signature. */
  signature?: () => string
  /** Debounce before rebuild (ms). */
  delay?: number
  /** Pages rendered on first load; scroll lazily loads the rest. */
  maxPages?: () => number
}

/** Default initial window size: enough to see the layout, not a full re-render. */
export const PDF_PREVIEW_MAX_PAGES = 12
const DEBOUNCE_MS = 400

export function usePdfPreview(params: UsePdfPreviewParams) {
  const manager = createUrlManager()

  const cache = new Map<number, PdfPreviewPageView>()
  const version = ref(0)
  const total = ref(0)
  const loading = ref(false)
  const progress = ref<{ current: number; total: number } | null>(null)
  const errorCode = ref('')
  const errorDetail = ref('')
  const skipped = ref(0)

  const controllers = new Set<AbortController>()
  let resetToken = 0
  const pending = new Set<number>()
  let timer: ReturnType<typeof setTimeout> | null = null

  function revoke(n: number): void {
    const v = cache.get(n)
    if (v) manager.revoke(v.url)
  }
  function touch(): void {
    version.value++
  }
  function clearCache(): void {
    for (const n of [...cache.keys()]) revoke(n)
    cache.clear()
    touch()
  }
  function abortAll(): void {
    for (const c of controllers) c.abort()
    controllers.clear()
  }

  async function renderRange(pageRange: string | undefined): Promise<void> {
    const token = resetToken
    const ctrl = new AbortController()
    controllers.add(ctrl)
    loading.value = true
    try {
      const res = await params.build(
        params.files(),
        ctrl.signal,
        (p) => {
          if (token === resetToken) progress.value = { current: p.current, total: p.total }
        },
        { pageRange }
      )
      if (token !== resetToken) return
      for (const pg of res.pages) {
        revoke(pg.pageNumber)
        cache.set(pg.pageNumber, {
          pageNumber: pg.pageNumber,
          url: manager.urlFor(pg.blob),
          width: pg.width,
          height: pg.height,
          textContent: pg.textContent,
          viewport: pg.viewport
        })
      }
      if (res.total > total.value) total.value = res.total
      skipped.value = res.skipped
      touch()
    } catch (e) {
      if (token !== resetToken) return
      const err = toProcessingError(e)
      // Cancellation is intentional; don't surface it as a failure.
      if (err.code !== 'CANCELLED') {
        errorCode.value = err.code
        errorDetail.value = err.message
        // eslint-disable-next-line no-console
        console.error('[usePdfPreview] preview render failed', err.code, err.message)
      }
    } finally {
      controllers.delete(ctrl)
      if (token === resetToken) {
        loading.value = controllers.size > 0
        if (controllers.size === 0) progress.value = null
      }
    }
  }

  /** First load / file-or-option change: drop the old cache, render the window. */
  function rebuild(): void {
    if (timer) clearTimeout(timer)
    timer = null
    resetToken++
    abortAll()
    clearCache()
    errorCode.value = ''
    errorDetail.value = ''
    total.value = 0
    const win = Math.max(1, params.maxPages?.() ?? PDF_PREVIEW_MAX_PAGES)
    void renderRange(`1-${win}`)
  }

  /** Ensure a range is rendered: request only pages missing from cache & pending. */
  function ensure(pageRange: string): void {
    if (total.value <= 0) return
    const want = parsePageRange(pageRange, total.value)
    const missing = want.filter((n) => !cache.has(n) && !pending.has(n))
    if (missing.length === 0) return
    for (const n of missing) pending.add(n)
    const range = formatPageRange(missing)
    void renderRange(range).finally(() => {
      for (const n of missing) pending.delete(n)
    })
  }

  function schedule(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(rebuild, params.delay ?? DEBOUNCE_MS)
  }

  const signature = computed(() =>
    JSON.stringify([
      params.files().map((f) => [f.name, f.size, f.lastModified]),
      params.signature?.() ?? ''
    ])
  )

  watch(signature, schedule, { immediate: true })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
    abortAll()
    clearCache()
    manager.clear()
  })

  const renderedPages = computed<PdfPreviewPageView[]>(() => {
    void version.value
    return [...cache.values()].sort((a, b) => a.pageNumber - b.pageNumber)
  })

  const slotList = computed<PdfPreviewSlot[]>(() => {
    void version.value
    const arr: PdfPreviewSlot[] = []
    for (let n = 1; n <= total.value; n++) arr.push({ pageNumber: n, view: cache.get(n) })
    return arr
  })

  return {
    pages: renderedPages,
    slotList,
    total,
    renderedCount: computed(() => cache.size),
    loading,
    progress,
    errorCode,
    errorDetail,
    skipped,
    ensure,
    rebuild
  }
}
