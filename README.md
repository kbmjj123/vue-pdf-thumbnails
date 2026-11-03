# vue-pdf-thumbnails

Virtualized, worker-rendered PDF thumbnails for **Vue 3** — optional selectable text
& annotation layers, with an OpenType/OTS font-fallback so rejected embedded fonts
don't render blank pages.

**Made by [MinoPDF](https://minopdf.com) — simple tools for better PDFs.** This
library is the thumbnail/preview engine extracted from the [MinoPDF](https://minopdf.com)
suite, packaged to be dropped into any Vue 3 app.

## Features

- **Virtualized lazy rendering** — for huge PDFs, only the visible page window is
  rasterized, never the whole document.
- **Worker-based rasterization** — heavy rendering runs off the main thread
  (`OffscreenCanvas` + Web Worker), so the UI never freezes.
- **Optional selectable text layer** (`show-text-layer`) — searchable / copyable /
  screen-reader accessible, built with pdf.js `TextLayer`.
- **Annotation / form / signature fidelity** (`annotation-mode`) — links,
  highlights, form fields and signatures are displayed via pdf.js `AnnotationLayer`.
- **Font-sanitizer (OTS) fallback** — detects blank pages caused by rejected
  embedded fonts and falls back gracefully.
- **Built-in lightbox**, multi-select with shift-range, blank-page flags, and full
  i18n via the `texts` prop.

## Install

```bash
npm i vue-pdf-thumbnails
# pdfjs-dist is bundled; vue ^3.5 is a peer dependency.
```

Import the stylesheet once (side-effect import):

```ts
import 'vue-pdf-thumbnails/style.css'
```

## CDN

Once the package is published to npm, it is **automatically mirrored** by
[jsDelivr](https://www.jsdelivr.com) and [unpkg](https://unpkg.com) — no separate
publish step is needed. Use a versioned URL (swap `@0.1.0` for `@latest` or a
specific tag):

```html
<!-- ESM in the browser — jsDelivr rewrites the `vue` peer import automatically -->
<script type="module">
  import { PdfPreview } from 'https://cdn.jsdelivr.net/npm/vue-pdf-thumbnails@0.1.0/+esm'
</script>
```

Direct / bundler URLs:

```bash
# jsDelivr — raw ESM file
https://cdn.jsdelivr.net/npm/vue-pdf-thumbnails@0.1.0/dist/vue-pdf-thumbnails.js
# jsDelivr — browser-ready ESM (recommended external link)
https://cdn.jsdelivr.net/npm/vue-pdf-thumbnails@0.1.0/+esm
# unpkg — ESM rewrite via ?module
https://unpkg.com/vue-pdf-thumbnails@0.1.0/dist/vue-pdf-thumbnails.js?module
# Stylesheet
https://cdn.jsdelivr.net/npm/vue-pdf-thumbnails@0.1.0/dist/style.css
```

> The library needs **Vue 3** as a peer. With the `+esm` / `?module` CDN forms the
> `vue` import is resolved for you; with the raw bundle you must provide Vue yourself
> (e.g. `https://unpkg.com/vue@3/dist/vue.esm-browser.js`).

## Quick start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { PdfPreview } from 'vue-pdf-thumbnails'
import 'vue-pdf-thumbnails/style.css'

const files = ref<File[]>([])
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) files.value = Array.from(input.files)
}
</script>

<template>
  <input type="file" accept="application/pdf" multiple @change="onPick" />
  <PdfPreview :files="files" />
</template>
```

The default builder handles rendering for you. To bring your own rendering (e.g. a
server-side rasterizer), pass a `build` function — see
[`usePdfPreview`](#composable-usepdfpreview).

## Usage

### Selectable text layer (补充①)

```vue
<PdfPreview :files="files" show-text-layer />
```

Text is overlaid on the bitmap and scales with the card. It is a display layer only
(no editing); it is automatically disabled in resize-preview mode, where the card
box no longer matches the rendered bitmap.

### Annotation / form / signature fidelity (补充②)

```vue
<!-- display links, highlights and signatures -->
<PdfPreview :files="files" annotation-mode="display" />
<!-- also make form fields interactive -->
<PdfPreview :files="files" annotation-mode="forms" />
```

External links open in a new tab. Internal navigation and form editing are display-only
in a preview context; wire a custom `build`/`LinkService` for full interactivity.

### Lightbox & selection

```vue
<PdfPreview
  :files="files"
  :selectable="true"
  :selected-pages="selected"
  @update:selected-pages="selected = $event"
  lightbox
/>
```

Provide your own overlay via the `#lightbox` slot:

```vue
<PdfPreview :files="files">
  <template #lightbox="{ pages, index, close }">
    <MyLightbox :src="pages[index].url" @close="close" />
  </template>
</template>
```

### Custom copy / i18n

```vue
<PdfPreview :files="files" :texts="{ pdf_title: 'Document', pdf_empty: 'No PDF loaded' }" />
```

All keys: see `PreviewTexts` (exported type) in `src/i18n/preview-texts.ts`.

### Resize-preview mode

```vue
<PdfPreview :files="files" :page-aspect="1.414" fit="contain" />
```

Forces every card to a fixed paper aspect and letterboxes the bitmap (`fit`:
`contain` | `cover` | `stretch`). Used by MinoPDF's resize output; overlay layers
are disabled because the card box no longer equals the bitmap.

## API

### `<PdfPreview>` props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `files` | `File[]` | — (required) | PDF files to preview. |
| `build` | `PdfPreviewBuilder` | bundled default | Custom render function (must run heavy work in a Worker). |
| `maxPages` | `number` | `12` | Max pages rendered in the initial window. |
| `selectable` | `boolean` | `false` | Enable click-to-select (shift = range). |
| `selectedPages` | `number[]` | `[]` | V-model-ish selected pages (emit only). |
| `pageAspect` | `number \| null` | `null` | Force a paper aspect ratio for resize previews. |
| `fit` | `'contain' \| 'cover' \| 'stretch'` | `'contain'` | Bitmap fit inside the card (resize mode). |
| `flaggedPages` | `number[]` | `[]` | Pages flagged as blank/problematic. |
| `showTextLayer` | `boolean` | `false` | Overlay a selectable text layer (补充①). |
| `annotationMode` | `'none' \| 'display' \| 'forms'` | `'display'` | Annotation fidelity (补充②). |
| `texts` | `Partial<PreviewTexts>` | `{}` | i18n overrides. |
| `lightbox` | `boolean` | `true` | Built-in zoom lightbox. |
| `signature` | `() => string` | `undefined` | Extra change key to force a rebuild. |

### Events

| Event | Payload | Description |
| --- | --- | --- |
| `update:selectedPages` | `number[]` | Selection changed (when `selectable`). |
| `progress` | `{ current, total } \| null` | Render progress. |
| `busy` | `boolean` | Rendering in flight. |
| `error` | `{ code, detail }` | Processing error (see `ErrorCode`). |

### Slots

| Slot | Scope | Description |
| --- | --- | --- |
| `actions` | — | Header action area (e.g. a toolbar). |
| `lightbox` | `{ pages, index, close }` | Replace the built-in lightbox. |

### Composable: `usePdfPreview`

For fully custom UIs, drive the engine yourself:

```ts
import { usePdfPreview, createPdfPreviewBuilder, type PdfPreviewBuilder } from 'vue-pdf-thumbnails'

const build: PdfPreviewBuilder = createPdfPreviewBuilder()

const { slotList, total, renderedCount, loading, ensure } = usePdfPreview({
  files: () => myFiles,
  build,
  maxPages: () => 12
})

// on scroll: ensure only the visible window
ensure('5-20')
```

`ensure(range)` requests (and caches) a page window; `slotList` is the ordered list
of slots for the current document, each with a `view` once it has been rendered.

### Custom `build`

```ts
const build: PdfPreviewBuilder = async (files, signal, onProgress, req) => {
  const pdf = await files[0].arrayBuffer()
  // ... rasterize req.pageRange to bitmaps (off-thread) ...
  return {
    pages: [{ pageNumber: 1, blob, width, height /*, textContent, annotations, viewport */ }],
    total: 500,
    skipped: 0
  }
}
```

Return `textContent` / `annotations` / `viewport` to enable the overlay layers.

## Development

```bash
pnpm install
pnpm build            # type-check + bundle (dist/ + d.ts)
pnpm test             # vitest unit tests (deterministic paths + 500-page virtualization)
pnpm test:visual      # generate sample PDF + Playwright visual/behavior regression
```

The `examples/demo` folder is a Vite app showcasing every prop — run `pnpm dev`
and open the printed URL.

## License

MIT © [MinoPDF](https://minopdf.com)
