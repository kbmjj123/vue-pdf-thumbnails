<template>
  <div class="demo">
    <header>
      <h1>vue-pdf-thumbnails · demo</h1>
      <p>
        Made by <a href="https://minopdf.com" target="_blank" rel="noopener">MinoPDF</a>
        — simple tools for better PDFs.
      </p>
    </header>

    <div class="controls">
      <label><input type="checkbox" v-model="showTextLayer" /> Show text layer</label>
      <label>
        Annotation mode:
        <select v-model="annotationMode">
          <option value="none">none</option>
          <option value="display">display</option>
          <option value="forms">forms</option>
        </select>
      </label>
      <label>
        Fit:
        <select v-model="fit">
          <option value="contain">contain</option>
          <option value="cover">cover</option>
          <option value="stretch">stretch</option>
        </select>
      </label>
      <label><input type="checkbox" v-model="lightbox" /> Lightbox</label>
      <label><input type="checkbox" v-model="selectable" /> Selectable</label>
      <span v-if="selected.length" class="sel">selected: {{ selected.join(', ') }}</span>
    </div>

    <div class="stage">
      <PdfPreview
        :files="files"
        :show-text-layer="showTextLayer"
        :annotation-mode="annotationMode"
        :fit="fit"
        :lightbox="lightbox"
        :selectable="selectable"
        :selected-pages="selected"
        @update:selected-pages="selected = $event"
      >
        <template #actions>
          <button type="button" class="reload" @click="reload">Reload PDF</button>
        </template>
      </PdfPreview>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PdfPreview } from '../../src'

const files = ref<File[]>([])
const showTextLayer = ref(true)
const annotationMode = ref<'none' | 'display' | 'forms'>('display')
const fit = ref<'contain' | 'cover' | 'stretch'>('contain')
const lightbox = ref(true)
const selectable = ref(true)
const selected = ref<number[]>([])

async function load(): Promise<void> {
  const res = await fetch('/sample.pdf')
  const buf = await res.arrayBuffer()
  files.value = [new File([buf], 'sample.pdf', { type: 'application/pdf' })]
}
function reload(): void {
  files.value = []
  selected.value = []
  void load()
}

onMounted(load)
</script>

<style scoped>
.demo { max-width: 960px; margin: 0 auto; padding: 16px; font-family: system-ui, sans-serif; color: #111827; }
header h1 { font-size: 18px; margin: 0 0 4px; }
header p { margin: 0 0 12px; font-size: 13px; color: #6b7280; }
header a { color: #4f46e5; }
.controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin: 12px 0; font-size: 14px; }
.controls label { display: inline-flex; align-items: center; gap: 4px; }
.sel { font-size: 12px; color: #6b7280; }
.reload { font-size: 12px; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; cursor: pointer; }
.stage { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
</style>
