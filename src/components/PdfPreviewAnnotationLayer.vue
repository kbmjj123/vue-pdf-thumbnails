<template>
  <div ref="rootRef" class="vpt-annlayer">
    <div ref="scalerRef" class="vpt-annlayer-scaler" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

interface SerializedViewport {
  width: number
  height: number
  scale: number
  rotation: number
  transform: number[]
}

const props = defineProps<{
  /** Serializable pdf.js annotations (from getAnnotations). */
  annotations: unknown
  /** Serialized rendered-page viewport used to position annotations. */
  viewport: unknown
  /** When false, links/forms are inert (display only). */
  interactive?: boolean
}>()

const rootRef = ref<HTMLElement | null>(null)
const scalerRef = ref<HTMLElement | null>(null)
let layer: { render: () => Promise<void>; destroy?: () => void } | null = null
let ro: ResizeObserver | null = null

function applyScale(): void {
  const root = rootRef.value
  const scaler = scalerRef.value
  const vp = props.viewport as SerializedViewport | undefined
  if (!root || !scaler || !vp) return
  const sx = root.clientWidth / vp.width
  const sy = root.clientHeight / vp.height
  scaler.style.transform = `scale(${sx}, ${sy})`
}

function buildLinkService(): unknown {
  const Ctor = (pdfjsLib as unknown as { LinkService?: new () => Record<string, unknown> }).LinkService
  if (!Ctor) return {}
  const svc = new Ctor()
  // External links open in a new tab; internal links are inert in a preview.
  ;(svc as Record<string, unknown>).externalLinkTarget = 2
  ;(svc as Record<string, unknown>).externalLinkRel = 'noopener noreferrer nofollow'
  return svc
}

async function mountLayer(): Promise<void> {
  if (!props.annotations || !props.viewport || !scalerRef.value) return
  destroyLayer()
  const Ctor = (pdfjsLib as unknown as { AnnotationLayer?: new (o: unknown) => { render: () => Promise<void>; destroy?: () => void } }).AnnotationLayer
  if (!Ctor) return
  const instance = new Ctor({
    annotations: props.annotations,
    container: scalerRef.value,
    viewport: props.viewport,
    linkService: buildLinkService(),
    annotationCanvasMap: new Map()
  })
  layer = instance
  try {
    await instance.render()
  } catch {
    /* best-effort overlay; a failure must not break the preview */
  }
  applyScale()
}

function destroyLayer(): void {
  try {
    layer?.destroy?.()
  } catch {
    /* noop */
  }
  if (scalerRef.value) scalerRef.value.innerHTML = ''
  layer = null
}

onMounted(() => {
  void mountLayer()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => applyScale())
    if (rootRef.value) ro.observe(rootRef.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  destroyLayer()
})
watch(
  () => [props.annotations, props.viewport, props.interactive] as const,
  () => {
    void nextTick(mountLayer)
  }
)
</script>

<style scoped>
.vpt-annlayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}
.vpt-annlayer-scaler {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.vpt-annlayer-scaler :deep(.annotationLayer) {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
}
.vpt-annlayer-scaler :deep(.annotationLayer) section {
  position: absolute;
}
.vpt-annlayer-scaler :deep(.annotationLayer) .linkAnnotation > a,
.vpt-annlayer-scaler :deep(.annotationLayer) .buttonWidgetAnnotation.pushButton > a {
  position: absolute;
  font-size: 1em;
  transform-origin: 0 0;
  pointer-events: auto;
}
.vpt-annlayer-scaler :deep(.annotationLayer) .textAnnotation img {
  position: absolute;
  cursor: pointer;
  pointer-events: auto;
}
.vpt-annlayer-scaler :deep(.annotationLayer) .popupAnnotation {
  position: absolute;
  font-size: 1em;
  pointer-events: auto;
}
.vpt-annlayer-scaler :deep(.annotationLayer) .popup {
  position: absolute;
  z-index: 3;
  max-width: 180px;
  padding: 4px 6px;
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 2px;
  background: #ff9;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  font-size: 11px;
  white-space: normal;
}
</style>
