'use client'

import {
  operations,
  type ScanOperation,
  type ScanOperations,
  type ScanRequest,
  type ScanResponse,
} from './operations'

/**
 * Calls into the scanner worker.
 *
 * One worker for the lifetime of the page, started on first use. When a
 * worker cannot be created or dies, the same operations run on the main
 * thread instead: slower to look at, but the scan still works.
 */

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void }

let worker: Worker | null = null
let broken = false
let nextId = 1
const pending = new Map<number, Pending>()

function failAll(reason: Error) {
  for (const entry of pending.values()) entry.reject(reason)
  pending.clear()
}

function getWorker(): Worker | null {
  if (broken || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<ScanResponse>) => {
      const entry = pending.get(event.data.id)
      if (!entry) return
      pending.delete(event.data.id)
      if (event.data.ok) entry.resolve(event.data.output)
      else entry.reject(new Error(event.data.error))
    }
    worker.onerror = () => {
      broken = true
      worker?.terminate()
      worker = null
      failAll(new Error('worker-crashed'))
    }
    return worker
  } catch {
    broken = true
    return null
  }
}

function runInline<K extends ScanOperation>(op: K, input: Parameters<ScanOperations[K]>[0]) {
  const run = operations[op] as (input: unknown) => ReturnType<ScanOperations[K]>
  return run(input)
}

/** Runs one scanner step, in the worker when there is one. */
export async function runScan<K extends ScanOperation>(
  op: K,
  input: Parameters<ScanOperations[K]>[0],
  transfer: Transferable[] = [],
): Promise<ReturnType<ScanOperations[K]>> {
  const target = getWorker()
  if (!target) return runInline(op, input)

  const id = nextId++
  try {
    return await new Promise<ReturnType<ScanOperations[K]>>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      const request: ScanRequest<K> = { id, op, input }
      target.postMessage(request, transfer)
    })
  } catch (error) {
    // A crashed worker (not an error thrown by the pipeline itself) gets
    // one retry on the main thread. Transferred buffers are gone, so the
    // caller's input is only reusable when nothing was transferred.
    if ((error as Error).message === 'worker-crashed' && transfer.length === 0) {
      return runInline(op, input)
    }
    throw error
  }
}
