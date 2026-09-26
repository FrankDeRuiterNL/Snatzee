import 'server-only'

import { drainNotifications, isPushConfigured } from '@/lib/push-server'

/**
 * Flushes the notification outbox on a timer.
 *
 * PUSH_DRAIN_INTERVAL_SECONDS sets the pace (default 15; 0 turns the loop
 * off and leaves only the pings). Runs never overlap: a slow push service
 * delays the next run instead of stacking them up. Claims are atomic in
 * the database, so a ping arriving mid-run cannot send anything twice.
 */
let started = false

export function startPushWorker() {
  if (started) return
  started = true

  const seconds = Number(process.env.PUSH_DRAIN_INTERVAL_SECONDS ?? 15)
  if (!Number.isFinite(seconds) || seconds <= 0) return
  if (!isPushConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      // Keep going while full batches come back, so a broadcast to many
      // people is not spread over many intervals.
      for (let round = 0; round < 10; round += 1) {
        const result = await drainNotifications(50)
        if (result.claimed < 50) break
      }
    } catch (error) {
      console.error('Snatzee push worker:', (error as Error)?.message ?? error)
    } finally {
      running = false
    }
  }

  const timer = setInterval(tick, Math.max(5, seconds) * 1000)
  // Never the reason the process stays alive.
  timer.unref()
  void tick()
}
