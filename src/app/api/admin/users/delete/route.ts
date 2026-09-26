import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseRequestClient } from '@/lib/supabase/request'
import { serviceClient } from '@/lib/push-server'

export const dynamic = 'force-dynamic'

const schema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})

/**
 * A superadmin deletes someone else's account.
 *
 * admin_delete_user() decides who may do this and removes the account
 * (every row follows through the cascades) and logs it; only when that
 * succeeded are the avatar files removed from storage, which sits outside
 * the cascade. A Sign in with Apple link cannot be revoked from here —
 * Apple only allows that with the player's own authorisation.
 */
export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRequestClient(request)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  const { userId, reason } = parsed.data

  const { data, error } = await supabase.rpc('admin_delete_user', {
    p_user_id: userId,
    p_reason: reason?.trim() || null,
  })
  if (error) {
    const status = error.hint === 'forbidden' ? 403 : error.hint === 'not_found' ? 404 : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  // Avatars: best effort, the account is already gone.
  try {
    const storage = serviceClient().storage.from('avatars')
    const { data: files } = await storage.list(userId, { limit: 1000 })
    if (files?.length) await storage.remove(files.map((file) => `${userId}/${file.name}`))
  } catch {
    // Carry on.
  }

  return NextResponse.json({ deleted: true, user: data })
}
