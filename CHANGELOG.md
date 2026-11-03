# Changelog

All notable changes to **vue-pdf-thumbnails** are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## 0.1.0

Initial public release. Extracted from the production [MinoPDF](https://minopdf.com)
tool suite and packaged as a self-contained, framework-agnostic Vue 3 library.

### Features
- **Virtualized lazy rendering** — only the visible page window is rasterized, so
  500+ page documents stay responsive.
- **Worker-based rasterization** — heavy rendering runs in a Web Worker via
  `OffscreenCanvas`, keeping the main thread free.
- **Font-fallback (OTS)** — detects blank pages caused by rejected embedded fonts
  and falls back gracefully.
- **Optional selectable text layer** (`show-text-layer`) using pdf.js `TextLayer`.
- **Annotation / form / signature fidelity** (`annotation-mode`:
  `none | display | forms`) using pdf.js `AnnotationLayer`.
- **Built-in lightbox** (overridable via the `#lightbox` slot), multi-select with
  shift-range, blank-page flags, and i18n via the `texts` prop.
- **Composable core** — `usePdfPreview` + `createPdfPreviewBuilder` for fully
  custom UIs, with the default builder included out of the box.
