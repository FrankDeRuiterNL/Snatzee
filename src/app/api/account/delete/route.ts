import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseRequestClient } from '@/lib/supabase/request'
import { serviceClient } from '@/lib/push-server'
import { revokeAppleAuthorization } from '@/lib/apple'

export const dynamic = 'force-dynamic'

const schema = z
  .object({
    // From the iOS app: a fresh Sign in with Apple authorization code, so
    // the Apple ID can be disconnected as Apple requires.
    appleAuthorizationCode: z.string().min(1).max(2000).optional(),
    appleClientId: z.string().min(1).max(200).optional(),
  })
  .optional()

/**
 * Deletes the caller's account, everywhere it lives.
 *
 * The database cascade takes care of rows; this also removes the avatar
 * files in storage (outside that cascade) with the service role, and
 * revokes the Sign in with Apple authorisation when the app passes a code.
 * Works for the website (cookie) and the iOS app (bearer token) alike.
 */
export async function POST(request: Request) {
  const { supabase, user } = await createSupabaseRequestClient(request)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  // Apple first: once the account is gone there is nothing left to say
  // whose authorisation this was. A failure does not block the deletion.
  let appleRevoked: boolean | null = null
  const code = parsed.data?.appleAuthorizationCode
  if (code) {
    const clientId = parsed.data?.appleClientId ?? process.env.APNS_BUNDLE_ID ?? ''
    const result = await revokeAppleAuthorization(code, clientId).catch(() => ({ ok: false }))
    appleRevoked = result.ok
  }

  // Avatars: best effort, a leftover file must not keep an account alive.
  try {
    const storage = serviceClient().storage.from('avatars')
    const { data: files } = await storage.list(user.id, { limit: 1000 })
    if (files?.length) await storage.remove(files.map((file) => `${user.id}/${file.name}`))
  } catch {
    // Carry on.
  }

  const { error } = await supabase.rpc('delete_own_account')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ deleted: true, appleRevoked })
}
