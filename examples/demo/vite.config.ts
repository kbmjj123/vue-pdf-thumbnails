import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// Dev server for the demo / Playwright harness. Rooted at examples/demo so the
// demo's index.html is served at '/'. Imports from '../../src' (the library
// source) are allowed via fs.allow pointing at the repo parents.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: {
    port: 5173,
    fs: {
      allow: [
        fileURLToPath(new URL('..', import.meta.url)),
        fileURLToPath(new URL('../..', import.meta.url))
      ]
    }
  }
})
