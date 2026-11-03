/** Default (English) UI strings for PdfPreview. Override via the `texts` prop. */

export interface PreviewTexts {
  pdf_title: string
  pdf_loading: string
  pdf_rendered: string
  pdf_skipped: string
  pdf_empty: string
  pdf_failed: string
  pdf_zoom: string
  select_page: string
  select_page_hint: string
  page: string
  blank_badge: string
  pdf_lazy_hint: string
}

export const DEFAULT_PREVIEW_TEXTS: PreviewTexts = {
  pdf_title: 'PDF preview',
  pdf_loading: 'Rendering the PDF preview…',
  pdf_rendered: 'Rendered {rendered} of {total} pages',
  pdf_skipped: '{count} page(s) could not be rendered',
  pdf_empty: 'No pages to preview yet.',
  pdf_failed: 'The PDF preview could not be rendered.',
  pdf_zoom: 'Open full page',
  select_page: 'Select page {index}',
  select_page_hint: 'Select page {index}',
  page: 'Page {index}',
  blank_badge: 'Blank',
  pdf_lazy_hint: 'Scroll to load the rest of the pages on demand.'
}

/** Interpolate `{name}` placeholders with the provided vars. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))
}
