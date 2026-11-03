/**
 * Tracks Object URLs created for preview bitmaps so they can be revoked on
 * unmount / rebuild — replacing minopdf.com's useArtifactManager for this lib.
 */

export interface UrlManager {
  urlFor(blob: Blob): string
  revoke(url: string): void
  clear(): void
}

export function createUrlManager(): UrlManager {
  const urls = new Set<string>()
  return {
    urlFor(blob: Blob): string {
      const url = URL.createObjectURL(blob)
      urls.add(url)
      return url
    },
    revoke(url: string): void {
      if (urls.has(url)) {
        URL.revokeObjectURL(url)
        urls.delete(url)
      }
    },
    clear(): void {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }
}
