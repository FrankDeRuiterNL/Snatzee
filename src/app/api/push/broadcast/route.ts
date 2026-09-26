import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseRequestClient } from '@/lib/supabase/request'
import { drainNotifications, isPushConfigured } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(300),
  // Absent or empty means everyone who can receive a notification.
  userIds: z.array(z.uuid()).optional(),
})

/**
 * Queues an admin's own notification and sends it straight away.
 *
 * The superadmin check is not here: admin_broadcast_notification does it,
 * in the database, where it also writes the audit entry. This route only
 * validates the shape and flushes afterwards.
 */
export async function POST(request: Request) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: 'Push is niet geconfigureerd op deze server.' },
      { status: 503 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Titel en tekst zijn verplicht.' }, { status: 400 })
  }

  const { supabase, user } = await createSupabaseRequestClient(request)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data, error } = await supabase.rpc('admin_broadcast_notification', {
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_user_ids: parsed.data.userIds?.length ? parsed.data.userIds : null,
  })

  if (error) {
    const denied = error.message.includes('Geen toegang')
    return NextResponse.json({ error: error.message }, { status: denied ? 403 : 400 })
  }

  const result = await drainNotifications(200)
  return NextResponse.json({ queued: data ?? 0, ...result })
}
