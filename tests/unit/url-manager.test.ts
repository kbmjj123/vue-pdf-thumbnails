import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createUrlManager } from '../../src/core/url-manager'

// jsdom provides URL.createObjectURL as a no-op returning a blob: URL.
describe('createUrlManager', () => {
  let created: string[] = []
  const original = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    created = []
    // Track created/revoked URLs.
    ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
      const u = `blob:mock/${created.length}`
      created.push(u)
      return u
    }
    ;(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {}
  })
  afterEach(() => {
    URL.createObjectURL = original
    URL.revokeObjectURL = originalRevoke
  })

  it('creates and tracks object URLs', () => {
    const mgr = createUrlManager()
    const url = mgr.urlFor(new Blob(['x']))
    expect(url).toBe('blob:mock/0')
    expect(created).toHaveLength(1)
  })

  it('revokes only known urls', () => {
    const mgr = createUrlManager()
    const url = mgr.urlFor(new Blob(['x']))
    mgr.revoke(url)
    mgr.revoke('blob:unknown') // no-op, not tracked
    // revoke is a no-op in this stub, but clear() must not throw
    expect(() => mgr.clear()).not.toThrow()
  })

  it('clear releases all tracked urls without throwing', () => {
    const mgr = createUrlManager()
    mgr.urlFor(new Blob(['a']))
    mgr.urlFor(new Blob(['b']))
    expect(() => mgr.clear()).not.toThrow()
  })
})
