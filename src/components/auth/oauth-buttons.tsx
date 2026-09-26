'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { APPLE_SIGN_IN_ENABLED } from '@/lib/constants'

/** Email and Sign in with Apple are the only ways in. */
type Provider = 'apple'

export function OAuthButtons({ next }: { next?: string }) {
  const [pending, setPending] = useState<Provider | null>(null)

  async function signIn(provider: Provider) {
    if (pending) return
    setPending(provider)

    const supabase = getSupabaseBrowserClient()
    const redirectTo = `${window.location.origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ''
    }`

    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })

    if (error) {
      setPending(null)
      toast.error('Inloggen is niet gelukt', { description: error.message })
    }
  }

  // Nothing configured: render nothing at all rather than an empty gap.
  if (!APPLE_SIGN_IN_ENABLED) return null

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="soft"
        size="lg"
        full
        loading={pending === 'apple'}
        disabled={pending !== null}
        onClick={() => signIn('apple')}
      >
        <AppleMark />
        Doorgaan met Apple
      </Button>
    </div>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden focusable="false" fill="currentColor">
      <path d="M16.36 12.84c.02 2.6 2.28 3.47 2.3 3.48-.02.06-.36 1.24-1.19 2.45-.72 1.05-1.47 2.1-2.65 2.12-1.16.02-1.53-.69-2.85-.69-1.32 0-1.73.67-2.83.71-1.14.04-2-1.13-2.73-2.18-1.48-2.14-2.61-6.06-1.09-8.7.75-1.32 2.1-2.15 3.57-2.17 1.11-.02 2.16.75 2.85.75.68 0 1.96-.93 3.3-.79.56.02 2.14.23 3.15 1.71-.08.05-1.88 1.1-1.86 3.31M14.2 4.9c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.33-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.23" />
    </svg>
  )
}

