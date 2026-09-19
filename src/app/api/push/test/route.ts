import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isPushConfigured, sendPushToUser } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

/**
 * Sends a test notification to the caller's own devices.
 *
 * Only ever to yourself — the endpoint takes no target, so it cannot be used
 * to push to anyone else even by an admin.
 */
export async function POST() {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: 'Push is niet geconfigureerd op deze server.' },
      { status: 503 },
    )
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const result = await sendPushToUser(user.id, {
    title: 'Snatzee',
    body: 'Meldingen werken 🎲 Je hoort het als er iets te vieren valt.',
    url: '/app',
    tag: 'snatzee-test',
  })

  return NextResponse.json(result)
}
