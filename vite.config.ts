import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { fileURLToPath } from 'node:url'

// Library build: emits ESM + d.ts (via vite-plugin-dts) + style.css.
// `vue` stays external (peer dep); `pdfjs-dist` is bundled.
export default defineConfig({
  plugins: [vue(), dts({ insertTypesEntry: true })],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      name: 'VuePdfThumbnails',
      fileName: 'vue-pdf-thumbnails',
      formats: ['es']
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        // Keep the stylesheet at the stable `style.css` path; everything else
        // (e.g. the pdf.js worker emitted via `?url`) goes under assets/ so the
        // two asset kinds never collide on the same filename.
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? ''
          if (name.endsWith('.css')) return 'style.css'
          return `assets/${name}`
        }
      }
    }
  },
  worker: {
    format: 'es'
  }
})
