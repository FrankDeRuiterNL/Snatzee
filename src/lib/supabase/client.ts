'use client'

import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_STORAGE_KEY, getBrowserSupabaseUrl } from './env'

export function createClient() {
  return createBrowserClient(getBrowserSupabaseUrl(), SUPABASE_ANON_KEY, {
    auth: { storageKey: SUPABASE_STORAGE_KEY },
  })
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null

/** Single shared browser client so auth state stays in sync across components. */
export function getSupabaseBrowserClient() {
  if (!browserClient) browserClient = createClient()
  return browserClient
}
