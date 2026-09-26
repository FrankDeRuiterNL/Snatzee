import { NextResponse } from 'next/server'
import { createSupabaseRequestClient } from '@/lib/supabase/request'
import { drainNotifications, isPushConfigured } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

/**
 * Sends whatever the database has queued.
 *
 * Any signed-in user may trigger a flush: it takes no input, returns only
 * counts, and the queue's contents are decided entirely by triggers. The
 * app pings it after the actions that queue something, which is what makes
 * delivery feel immediate without a background worker.
 */
export async function POST(request: Request) {
  if (!isPushConfigured()) return NextResponse.json({ claimed: 0, sent: 0, failed: 0 })

  const { user } = await createSupabaseRequestClient(request)

  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  return NextResponse.json(await drainNotifications())
}
