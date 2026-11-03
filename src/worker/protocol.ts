/**
 * Worker communication protocol (extracted from minopdf.com app/workers/protocol.ts).
 * Main thread → Worker: WorkerRequest (with id). Worker → main: WorkerResponse
 * (progress / result / error). Main → Worker: cancel by id.
 */

import { toProcessingError, type ErrorCode } from '../core/errors'

export interface WorkerRequest<P = unknown> {
  id: string
  type: string
  payload: P
}

export interface WorkerProgress {
  current: number
  total: number
  message?: string
}

export type WorkerResponse<R = unknown> =
  | { id: string; type: 'progress'; progress: WorkerProgress }
  | { id: string; type: 'result'; payload: R }
  | { id: string; type: 'error'; code: ErrorCode; message: string; context?: Record<string, unknown> }

export interface WorkerCancelMessage {
  id: string
  type: 'cancel'
}

export type WorkerInboundMessage = WorkerRequest | WorkerCancelMessage
export type WorkerOutboundMessage = WorkerResponse

export interface WorkerCallOptions {
  onProgress?: (progress: WorkerProgress) => void
  signal?: AbortSignal
}

export interface WorkerHandlerContext {
  signal: AbortSignal
  reportProgress: (progress: WorkerProgress) => void
}

export type WorkerHandler<P = unknown, R = unknown> = (
  payload: P,
  ctx: WorkerHandlerContext
) => Promise<R>

/**
 * Minimal type → handler registry + message loop. No external deps, so it can
 * live inside the library's own worker bundle.
 */
export function createWorkerHandlerRegistry(): {
  register: <P, R>(type: string, handler: WorkerHandler<P, R>) => void
  start: (self: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void }) => void
} {
  const handlers = new Map<string, WorkerHandler>()
  const aborts = new Map<string, AbortController>()

  return {
    register(type, handler) {
      handlers.set(type, handler as WorkerHandler)
    },
    start(self) {
      self.onmessage = (e: MessageEvent) => {
        const data = e.data as WorkerInboundMessage
        if (!data || typeof data !== 'object') return

        if (data.type === 'cancel') {
          aborts.get(data.id)?.abort()
          return
        }

        const req = data as WorkerRequest
        const handler = handlers.get(req.type)
        if (!handler) {
          self.postMessage({
            id: req.id,
            type: 'error',
            code: 'WORKER_ERROR',
            message: `Unknown worker request type: ${req.type}`
          } satisfies WorkerResponse)
          return
        }

        const controller = new AbortController()
        aborts.set(req.id, controller)

        handler(req.payload, {
          signal: controller.signal,
          reportProgress: (progress) =>
            self.postMessage({ id: req.id, type: 'progress', progress } satisfies WorkerResponse)
        })
          .then((payload) => {
            self.postMessage({ id: req.id, type: 'result', payload } satisfies WorkerResponse)
          })
          .catch((err: unknown) => {
            const normalized = toProcessingError(err)
            self.postMessage({
              id: req.id,
              type: 'error',
              code: normalized.code,
              message: normalized.message,
              context: normalized.context
            } satisfies WorkerResponse)
          })
          .finally(() => {
            aborts.delete(req.id)
          })
      }
    }
  }
}
