/// <reference lib="webworker" />
import { operations, type ScanRequest, type ScanResponse } from './operations'

/**
 * Runs the scoresheet pipeline off the main thread.
 *
 * Locating the table, cleaning up the photo, finding the grid and reading
 * the digits is a few hundred milliseconds of arithmetic — on an older
 * phone well over a second — which froze the sheet, its spinner and every
 * tap while it ran.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<ScanRequest>) => {
  const { id, op, input } = event.data
  let response: ScanResponse
  try {
    const run = operations[op] as (input: unknown) => unknown
    response = { id, ok: true, output: run(input) }
  } catch (error) {
    response = { id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  scope.postMessage(response)
}
