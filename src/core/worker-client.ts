/**
 * Main-thread client for the library's preview worker. Mirrors minopdf.com's
 * `useWorkerClient` contract (request id matching, progress streaming, abort).
 */

import type { WorkerRequest, WorkerResponse, WorkerProgress, WorkerCallOptions } from '../worker/protocol'
import { toProcessingError, createProcessingError } from './errors'

export interface PdfThumbnailWorkerClient {
  call<P, R>(
    type: string,
    payload: P,
    opts?: WorkerCallOptions & { transfer?: Transferable[] }
  ): Promise<R>
  terminate(): void
}

let worker: Worker | null = null
let idCounter = 0
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; onProgress?: (p: WorkerProgress) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../worker/pdf.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as WorkerResponse
    if (!msg || typeof msg.id !== 'string') return
    const entry = pending.get(msg.id)
    if (!entry) return
    if (msg.type === 'progress') {
      entry.onProgress?.(msg.progress)
      return
    }
    if (msg.type === 'result') {
      pending.delete(msg.id)
      entry.resolve(msg.payload)
      return
    }
    if (msg.type === 'error') {
      pending.delete(msg.id)
      entry.reject(toProcessingError({ code: msg.code, message: msg.message, context: msg.context }))
    }
  }
  return worker
}

/** Create a client bound to the shared module worker. */
export function createPdfThumbnailWorker(): PdfThumbnailWorkerClient {
  const w = ensureWorker()
  return {
    call(type, payload, opts) {
      const id = `r${++idCounter}`
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress: opts?.onProgress })
        const req: WorkerRequest = { id, type, payload }
        if (opts?.signal) {
          if (opts.signal.aborted) {
            pending.delete(id)
            reject(createProcessingError({ code: 'CANCELLED' }))
            return
          }
          opts.signal.addEventListener(
            'abort',
            () => {
              w.postMessage({ id, type: 'cancel' })
              if (pending.has(id)) {
                pending.delete(id)
                reject(createProcessingError({ code: 'CANCELLED' }))
              }
            },
            { once: true }
          )
        }
        w.postMessage(req, opts?.transfer ?? [])
      })
    },
    terminate() {
      w.terminate()
      worker = null
      pending.clear()
    }
  }
}
