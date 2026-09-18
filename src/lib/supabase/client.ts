'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null

/** Single shared browser client so auth state stays in sync across components. */
export function getSupabaseBrowserClient() {
  if (!browserClient) browserClient = createClient()
  return browserClient
}
