/**
 * Runs once when the Next.js server starts.
 *
 * Starts the notification sender. Until now the outbox was only flushed
 * when a browser pinged /api/push/drain after doing something; the iOS
 * app, a closed tab or a trigger nobody pinged for (a group score seen by
 * others) all had to wait for the next ping. A small loop in the server
 * process delivers them within seconds regardless of who caused them.
 */
export async function register() {
  // Only in the Node.js server, never in the edge runtime or the build.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  const { startPushWorker } = await import('@/lib/push-worker')
  startPushWorker()
}
