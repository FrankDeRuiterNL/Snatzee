import 'server-only'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './server'
import { SUPABASE_ANON_KEY, SUPABASE_SERVER_URL } from './env'

/**
 * The Supabase client for an API route, acting as whoever called it.
 *
 * The web app is signed in through its session cookie. The iOS app has no
 * cookies: it sends the access token it got from GoTrue as
 * `Authorization: Bearer <token>`, the same way it talks to PostgREST. Both
 * end up as a client that runs with that person's rights, so RLS and the
 * RPCs' own checks apply exactly as they do everywhere else.
 */
export async function createSupabaseRequestClient(
  request: Request,
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const token = bearerToken(request)

  if (token) {
    const supabase = createClient(SUPABASE_SERVER_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    // Verified by GoTrue, not just decoded: an expired or forged token
    // yields no user.
    const { data } = await supabase.auth.getUser(token)
    return { supabase, user: data.user ?? null }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
