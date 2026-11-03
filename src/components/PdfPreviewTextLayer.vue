<template>
  <div ref="rootRef" class="vpt-textlayer">
    <!-- pdf.js mounts its `.textLayer` inside this scaler; we scale it to the card box. -->
    <div ref="scalerRef" class="vpt-textlayer-scaler" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
// Imported from the same legacy build the worker uses, so the textContent
// format and the TextLayer API are guaranteed to match. (Bundle-size tuning is
// a Phase 5 concern; pdf.js is already bundled for the worker chunk.)
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

interface SerializedViewport {
  width: number
  height: number
  scale: number
  rotation: number
  transform: number[]
}

const props = defineProps<{
  /** Serializable pdf.js textContent (items + styles). */
  textContent: unknown
  /** Serialized rendered-page viewport used to position text. */
  viewport: unknown
}>()

const rootRef = ref<HTMLElement | null>(null)
const scalerRef = ref<HTMLElement | null>(null)
// pdf.js TextLayer instance (loosely typed — its shape varies across builds).
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

async function mountLayer(): Promise<void> {
  if (!props.textContent || !props.viewport || !scalerRef.value) return
  destroyLayer()
  const TextLayerCtor = (pdfjsLib as unknown as { TextLayer?: new (o: unknown) => { render: () => Promise<void>; destroy?: () => void } }).TextLayer
  if (!TextLayerCtor) return
  const instance = new TextLayerCtor({
    textContentSource: props.textContent,
    container: scalerRef.value,
    viewport: props.viewport
  })
  layer = instance
  try {
    await instance.render()
  } catch {
    // Rendering a text layer is best-effort; a failure must not break the preview.
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
  () => [props.textContent, props.viewport] as const,
  () => {
    void nextTick(mountLayer)
  }
)
</script>

<style scoped>
/* Container matches the card box; passes clicks through except on text. */
.vpt-textlayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
.vpt-textlayer-scaler {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
/* pdf.js mounts `.textLayer` here; styles mirror pdf.js viewer essentials. */
.vpt-textlayer-scaler :deep(.textLayer) {
  position: absolute;
  inset: 0;
  overflow: clip;
  opacity: 1;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0 0;
  cursor: text;
}
.vpt-textlayer-scaler :deep(.textLayer) > span,
.vpt-textlayer-scaler :deep(.textLayer) > br {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0 0;
  pointer-events: auto;
}
.vpt-textlayer-scaler :deep(.textLayer) .endOfContent {
  display: none;
}
</style>
