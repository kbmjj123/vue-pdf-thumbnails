<template>
  <section class="vpt-root">
    <!-- header: title + status -->
    <div class="vpt-header">
      <h3 class="vpt-title">{{ t('pdf_title') }}</h3>
      <div class="vpt-status">
        <p v-if="loading || total > 0" class="vpt-status-text">
          <span v-if="loading" class="vpt-spinner" />
          <template v-if="total > 0">
            <span>{{ t('pdf_rendered', { rendered: renderedCount, total }) }}</span>
            <span v-if="skipped">{{ t('pdf_skipped', { count: skipped }) }}</span>
          </template>
        </p>
        <slot name="actions" />
      </div>
    </div>

    <!-- document view: real slots 1..total; only the viewport window is rendered -->
    <div
      v-if="total > 0"
      ref="containerRef"
      class="vpt-scroll"
      @scroll="onScroll"
    >
      <div class="vpt-grid" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
        <div
          v-for="slot in slotList"
          :key="slot.pageNumber"
          class="vpt-card"
          :class="isSelected(slot.pageNumber) && 'vpt-card-selected'"
          :style="{ aspectRatio: ratioFor(slot) }"
        >
          <button
            v-if="slot.view"
            type="button"
            class="vpt-card-btn"
            :class="selectable ? 'vpt-cursor-select' : 'vpt-cursor-zoom'"
            :title="selectable ? t('select_page', { index: slot.pageNumber }) : t('pdf_zoom')"
            @click="onPageClick(slot.pageNumber, $event)"
          >
            <img :src="slot.view.url" :alt="t('page', { index: slot.pageNumber })" class="vpt-img" :class="fitClassFor(slot.pageNumber)" loading="lazy" draggable="false" />
          </button>
          <button
            v-else
            type="button"
            class="vpt-card-btn vpt-card-placeholder"
            :title="selectable ? t('select_page_hint', { index: slot.pageNumber }) : t('pdf_zoom')"
            @click="onPageClick(slot.pageNumber, $event)"
          >
            <span v-if="loading" class="vpt-spinner" />
            <span class="vpt-placeholder-num">{{ slot.pageNumber }}</span>
          </button>

          <PdfPreviewAnnotationLayer
            v-if="annotationLayerEnabled && slot.view?.annotations && slot.view?.viewport"
            :annotations="slot.view.annotations"
            :viewport="slot.view.viewport"
            :interactive="props.annotationMode === 'forms'"
          />

          <PdfPreviewTextLayer
            v-if="textLayerEnabled && slot.view?.textContent && slot.view?.viewport"
            :text-content="slot.view.textContent"
            :viewport="slot.view.viewport"
          />

          <span v-if="selectable && isSelected(slot.pageNumber)" class="vpt-badge vpt-badge-check">
            <span class="vpt-check">✓</span>{{ t('page', { index: slot.pageNumber }) }}
          </span>
          <span
            v-else-if="flaggedPages?.includes(slot.pageNumber)"
            class="vpt-badge vpt-badge-blank"
          >{{ t('blank_badge') }}</span>
          <span v-else class="vpt-page-num">{{ slot.pageNumber }}</span>

          <button
            v-if="selectable && slot.view"
            type="button"
            class="vpt-zoom-btn"
            :title="t('pdf_zoom')"
            @click="openLightbox(slot.pageNumber)"
          >⤢</button>
        </div>
      </div>
    </div>

    <!-- first-load skeleton -->
    <ul v-else-if="loading" class="vpt-skeleton">
      <li v-for="i in skeletonCount" :key="i" class="vpt-skeleton-card" />
    </ul>

    <p v-else class="vpt-empty">
      {{ errorMessage || t('pdf_empty') }}
      <span v-if="errorDetail" class="vpt-error-detail">{{ errorDetail }}</span>
    </p>

    <p v-if="total > 0 && renderedCount < total && !loading" class="vpt-lazy-hint">
      {{ t('pdf_lazy_hint') }}
    </p>

    <!-- lightbox: built-in by default, overridable via #lightbox slot -->
    <Teleport to="body">
      <slot
        v-if="$slots.lightbox && lightboxIndex !== null"
        name="lightbox"
        :pages="pages"
        :index="lightboxIndex"
        :close="closeLightbox"
      />
      <div v-else-if="currentLightbox" class="vpt-lightbox" @click="closeLightbox">
        <img :src="currentLightbox.url" :alt="t('page', { index: currentLightbox.pageNumber })" class="vpt-lightbox-img" @click.stop />
        <button class="vpt-lightbox-close" type="button" @click="closeLightbox">×</button>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePdfPreview, PDF_PREVIEW_MAX_PAGES } from '../composables/usePdfPreview'
import { createPdfPreviewBuilder, type PdfPreviewBuilder } from '../core/builder'
import { DEFAULT_PREVIEW_TEXTS, interpolate, type PreviewTexts } from '../i18n/preview-texts'
import PdfPreviewTextLayer from './PdfPreviewTextLayer.vue'
import PdfPreviewAnnotationLayer from './PdfPreviewAnnotationLayer.vue'

const emit = defineEmits<{
  (e: 'update:selectedPages', pages: number[]): void
  (e: 'progress', progress: { current: number; total: number } | null): void
  (e: 'busy', busy: boolean): void
  (e: 'error', error: { code: string; detail: string }): void
}>()

const props = withDefaults(
  defineProps<{
    files: File[]
    /** Render function (heavy work must run in a Worker). Defaults to the bundled builder. */
    build?: PdfPreviewBuilder
    maxPages?: number
    selectable?: boolean
    selectedPages?: number[]
    /** Target paper aspect (w/h) for resize previews; omit to use the real page ratio. */
    pageAspect?: number | null
    fit?: 'contain' | 'cover' | 'stretch'
    flaggedPages?: number[]
    /** [补充①] Fetch + show a selectable text layer. */
    showTextLayer?: boolean
    /** [补充②] Annotation fidelity mode for the overlay layer. */
    annotationMode?: 'none' | 'display' | 'forms'
    /** UI strings (i18n). Merged over the English defaults. */
    texts?: Partial<PreviewTexts>
    /** Built-in zoom lightbox. Set false to rely solely on the #lightbox slot. */
    lightbox?: boolean
    /** Extra change signature from the host (options, etc.). */
    signature?: () => string
  }>(),
  {
    maxPages: PDF_PREVIEW_MAX_PAGES,
    selectable: false,
    selectedPages: () => [],
    pageAspect: null,
    fit: 'contain',
    flaggedPages: () => [],
    showTextLayer: false,
    annotationMode: 'display',
    texts: () => ({}),
    lightbox: true,
    signature: undefined
  }
)

const mergedTexts = computed<PreviewTexts>(() => ({ ...DEFAULT_PREVIEW_TEXTS, ...props.texts }))
function t(key: keyof PreviewTexts, vars?: Record<string, string | number>): string {
  return interpolate(mergedTexts.value[key], vars)
}

// Default builder is reactive to the overlay flags so flipping them re-fetches layers.
const effectiveBuild = computed<PdfPreviewBuilder>(() =>
  props.build ??
  createPdfPreviewBuilder({
    wantText: props.showTextLayer,
    wantAnnotations: props.annotationMode !== 'none',
    annotationIntent: props.annotationMode === 'forms' ? 'enableForms' : 'display'
  })
)
const buildProxy: PdfPreviewBuilder = (files, signal, onProgress, req) => effectiveBuild.value(files, signal, onProgress, req)

// The overlay layers only align when the card box equals the rendered bitmap
// (i.e. not in resize-preview mode where the bitmap is letterboxed).
const textLayerEnabled = computed(() => props.showTextLayer && !props.pageAspect)
const annotationLayerEnabled = computed(() => props.annotationMode !== 'none' && !props.pageAspect)

const preview = usePdfPreview({
  files: () => props.files,
  build: buildProxy,
  signature: () =>
    [props.showTextLayer, props.annotationMode, props.pageAspect, props.fit, props.signature?.() ?? ''].join('|'),
  maxPages: () => props.maxPages
})

const {
  pages,
  slotList,
  total,
  renderedCount,
  loading,
  progress,
  errorCode,
  errorDetail,
  skipped,
  ensure
} = preview

const errorMessage = computed(() => (errorCode.value ? t('pdf_failed') : ''))

// Report host-facing state as events (replaces minopdf.com's useToolPreviewState).
watch(loading, (v) => emit('busy', v))
watch(progress, (p) => emit('progress', p))
watch([errorCode, errorDetail], ([code, detail]) => {
  if (code) emit('error', { code, detail: detail ?? '' })
})

/* ---- lazy scroll rendering ---- */
const containerRef = ref<HTMLElement | null>(null)
const GAP = 16
const BUFFER_ROWS = 2
const CARD_MIN = 280
const MAX_COLS = 1
const PAGE_ASPECT = 1.414
const columns = ref(1)
const columnWidth = ref(300)
const cardH = ref(360)
let raf = 0
let observer: ResizeObserver | null = null

function computeColumns(): void {
  const el = containerRef.value
  if (!el) return
  const w = el.clientWidth
  columns.value = Math.max(1, Math.min(MAX_COLS, Math.floor((w + GAP) / (CARD_MIN + GAP))))
  columnWidth.value = columns.value > 0 ? (w - (columns.value - 1) * GAP) / columns.value : w
  cardH.value = columnWidth.value * PAGE_ASPECT
}

const PAGE_RATIO = 595 / 842
function inResizeScope(pageNumber: number): boolean {
  const sel = props.selectedPages
  return sel.length === 0 || sel.includes(pageNumber)
}
function ratioFor(slot: { pageNumber: number; view?: { width: number; height: number } }): number {
  const v = slot.view
  const real = v && v.width > 0 && v.height > 0 ? v.width / v.height : PAGE_RATIO
  if (!props.pageAspect || !inResizeScope(slot.pageNumber)) return real
  const landscape = real > 1
  return landscape ? 1 / props.pageAspect : props.pageAspect
}
function fitClassFor(pageNumber: number): string {
  if (!props.pageAspect || !inResizeScope(pageNumber)) return 'vpt-fit-contain'
  return props.fit === 'stretch' ? 'vpt-fit-fill' : props.fit === 'cover' ? 'vpt-fit-cover' : 'vpt-fit-contain'
}

function scheduleScroll(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(onScroll)
}
function onScroll(): void {
  raf = 0
  const el = containerRef.value
  if (!el || total.value <= 0) return
  const top = el.scrollTop
  const h = el.clientHeight
  const rowH = cardH.value + GAP
  const firstRow = Math.max(0, Math.floor(top / rowH) - BUFFER_ROWS)
  const lastRow = Math.ceil((top + h) / rowH) + BUFFER_ROWS
  const first = firstRow * columns.value + 1
  const last = Math.min(total.value, (lastRow + 1) * columns.value)
  if (last >= first) ensure(`${first}-${last}`)
}

const skeletonCount = computed(() => Math.max(1, Math.min(props.maxPages, total.value || 1)))

onMounted(() => {
  nextTick(() => {
    computeColumns()
    scheduleScroll()
  })
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => {
    computeColumns()
    scheduleScroll()
  })
  // The scroll container renders only once `total > 0` (see template), so it may
  // not exist at mount. Attach the observer as soon as the ref becomes available.
  if (containerRef.value) {
    observer.observe(containerRef.value)
  } else {
    const stop = watch(containerRef, (el) => {
      if (el) {
        observer!.observe(el)
        stop()
      }
    })
  }
})
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  observer?.disconnect()
  observer = null
})

watch([total, columns], () => {
  computeColumns()
  scheduleScroll()
})
watch(
  () => props.selectedPages,
  (sel) => {
    if (sel.length) ensure(sel.join(','))
  }
)

/* ---- page selection ---- */
let lastClicked = -1
function isSelected(pageNumber: number): boolean {
  return props.selectedPages.includes(pageNumber)
}
function onPageClick(pageNumber: number, e: MouseEvent): void {
  if (!props.selectable) {
    openLightbox(pageNumber)
    return
  }
  const next = new Set(props.selectedPages)
  if (e.shiftKey && lastClicked >= 0) {
    const [lo, hi] = [Math.min(lastClicked, pageNumber), Math.max(lastClicked, pageNumber)]
    for (let k = lo; k <= hi; k++) {
      if (k >= 1 && k <= total.value) next.add(k)
    }
  } else if (next.has(pageNumber)) {
    if (next.size === total.value) {
      next.clear()
      next.add(pageNumber)
    } else {
      next.delete(pageNumber)
    }
  } else {
    next.add(pageNumber)
  }
  lastClicked = pageNumber
  emit('update:selectedPages', [...next].sort((a, b) => a - b))
}

/* ---- lightbox ---- */
const lightboxIndex = ref<number | null>(null)
const currentLightbox = computed(() =>
  lightboxIndex.value !== null ? pages.value[lightboxIndex.value] ?? null : null
)
function openLightbox(pageNumber: number): void {
  const idx = pages.value.findIndex((p) => p.pageNumber === pageNumber)
  if (idx < 0) return
  lightboxIndex.value = idx
}
function closeLightbox(): void {
  lightboxIndex.value = null
}
</script>

<style scoped>
.vpt-root { display: block; }
.vpt-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.vpt-title { font-size: 0.875rem; font-weight: 600; color: #374151; }
:global(.dark) .vpt-title { color: #e5e7eb; }
.vpt-status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.vpt-status-text { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #9ca3af; }
.vpt-spinner {
  width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%; display: inline-block; animation: vpt-spin 0.7s linear infinite;
}
@keyframes vpt-spin { to { transform: rotate(360deg); } }

.vpt-scroll {
  max-height: 70vh; overflow: auto; border: 1px solid #e5e7eb; background: #f3f4f6;
  border-radius: 12px; padding: 16px;
}
:global(.dark) .vpt-scroll { border-color: #374151; background: #1f2937; }
.vpt-grid { display: grid; gap: 16px; margin: 0 auto; }
.vpt-card {
  position: relative; display: flex; flex-direction: column; overflow: hidden;
  border-radius: 2px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  outline: 1px solid rgba(0,0,0,0.1);
}
:global(.dark) .vpt-card { background: #111827; outline-color: rgba(255,255,255,0.1); }
.vpt-card-selected { outline: 2px solid #6366f1; }
.vpt-card-btn { display: block; width: 100%; height: 100%; border: 0; padding: 0; background: none; }
.vpt-cursor-zoom { cursor: zoom-in; }
.vpt-cursor-select { cursor: pointer; }
.vpt-card-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #9ca3af; transition: color 0.15s; }
.vpt-card-placeholder:hover { color: #6b7280; }
.vpt-placeholder-num { font-size: 0.875rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.vpt-img { width: 100%; height: 100%; }
.vpt-fit-contain { object-fit: contain; }
.vpt-fit-cover { object-fit: cover; }
.vpt-fit-fill { object-fit: fill; }

.vpt-badge {
  position: absolute; left: 8px; top: 8px; display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px; font-size: 10px; font-weight: 600; color: #fff; border-radius: 6px;
}
.vpt-badge-check { background: #4f46e5; }
.vpt-badge-blank { background: #f59e0b; }
.vpt-page-num {
  position: absolute; right: 8px; bottom: 8px; padding: 2px 6px; font-size: 10px; font-weight: 600;
  color: #fff; background: rgba(17,24,39,0.7); border-radius: 6px; font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.vpt-zoom-btn {
  position: absolute; right: 8px; top: 8px; padding: 6px; color: #fff; background: rgba(17,24,39,0.7);
  border: 0; border-radius: 6px; cursor: pointer; transition: background 0.15s;
}
.vpt-zoom-btn:hover { background: rgba(17,24,39,1); }

.vpt-skeleton { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (min-width: 640px) { .vpt-skeleton { grid-template-columns: repeat(3, 1fr); } }
.vpt-skeleton-card { aspect-ratio: 3/4; border-radius: 12px; border: 1px solid #e5e7eb; background: #fff; animation: vpt-pulse 1.4s ease-in-out infinite; }
:global(.dark) .vpt-skeleton-card { border-color: #374151; background: #111827; }
@keyframes vpt-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

.vpt-empty { margin: 0; padding: 32px 12px; text-align: center; font-size: 0.75rem; color: #9ca3af; border: 1px dashed #e5e7eb; border-radius: 12px; }
:global(.dark) .vpt-empty { border-color: #374151; }
.vpt-error-detail { display: block; margin-top: 4px; font-size: 11px; color: #9ca3af; }

.vpt-lazy-hint { text-align: center; font-size: 11px; color: #9ca3af; }

.vpt-lightbox {
  position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85); padding: 48px 0 120px;
}
.vpt-lightbox-img { max-width: 92vw; max-height: 86vh; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
.vpt-lightbox-close {
  position: absolute; top: 16px; right: 20px; width: 40px; height: 40px; font-size: 24px; line-height: 1;
  color: #fff; background: rgba(255,255,255,0.15); border: 0; border-radius: 50%; cursor: pointer;
}
.vpt-lightbox-close:hover { background: rgba(255,255,255,0.3); }
</style>
