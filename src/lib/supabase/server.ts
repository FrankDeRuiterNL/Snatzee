import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_SERVER_URL, SUPABASE_STORAGE_KEY } from './env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_SERVER_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: SUPABASE_STORAGE_KEY },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session cookies instead, so this can safely be ignored.
        }
      },
    },
  })
}
