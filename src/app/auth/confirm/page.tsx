'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type State = 'working' | 'done' | 'failed'

/**
 * Landing page for the link in a confirmation e-mail.
 *
 * GoTrue can hand the session back in three different shapes depending on
 * version and flow, and only one of them is visible to a server route:
 *
 *   #access_token=…&refresh_token=…   implicit flow, fragment only
 *   ?token_hash=…&type=signup         verifies here
 *   ?code=…                           PKCE exchange
 *
 * A fragment never reaches the server, which is why the old server-only
 * callback left people on the login screen with an account that looked
 * unconfirmed. Handling all three in the browser covers every case.
 */
function ConfirmInner() {
  const router = useRouter()
  const [state, setState] = useState<State>('working')
  const [message, setMessage] = useState<string | null>(null)
  const ran = useRef(false)

  const finish = useCallback(
    async () => {
      const supabase = getSupabaseBrowserClient()

      const url = new URL(window.location.href)
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

      const hashError = hash.get('error_description') ?? url.searchParams.get('error_description')
      if (hashError) {
        setState('failed')
        setMessage(hashError)
        return
      }

      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const tokenHash = url.searchParams.get('token_hash') ?? url.searchParams.get('token')
      const type = url.searchParams.get('type')
      const code = url.searchParams.get('code')

      let failure: string | null = null

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        failure = error?.message ?? null
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'signup' | 'email_change' | 'recovery' | 'invite' | 'magiclink',
        })
        failure = error?.message ?? null
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        failure = error?.message ?? null
      } else {
        failure = 'Deze link bevat geen bevestigingsgegevens.'
      }

      if (failure) {
        setState('failed')
        setMessage(failure)
        return
      }

      // Clear the tokens out of the address bar before moving on.
      window.history.replaceState(null, '', '/auth/confirm')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setState('failed')
        setMessage('We konden je sessie niet starten. Probeer opnieuw in te loggen.')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle()

      setState('done')
      router.replace(profile?.onboarding_completed ? '/app' : '/onboarding')
      router.refresh()
    },
    [router],
  )

  useEffect(() => {
    // Strict mode mounts twice in development; the token is single-use.
    if (ran.current) return
    ran.current = true
    void finish()
  }, [finish])

  if (state === 'working') {
    return (
      <AuthShell title="Even geduld" subtitle="We bevestigen je account…">
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-5 ring-1 ring-hairline">
          <Loader2 className="size-5 animate-spin text-mint-400" aria-hidden />
          <p className="text-[0.95rem] text-ink">Je account wordt geactiveerd.</p>
        </div>
      </AuthShell>
    )
  }

  if (state === 'done') {
    return (
      <AuthShell title="Gelukt!" subtitle="Je account is bevestigd.">
        <div className="flex items-center gap-3 rounded-2xl bg-mint-500/10 p-5 ring-1 ring-mint-500/30">
          <CheckCircle2 className="size-5 text-mint-400" aria-hidden />
          <p className="text-[0.95rem] text-ink">Je wordt doorgestuurd…</p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Link werkt niet" subtitle="We konden je account niet bevestigen.">
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-hairline">
        <MailWarning className="size-6 text-tangerine-400" aria-hidden />
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink">
          {message ?? 'Deze bevestigingslink is verlopen of al gebruikt.'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Vraag op de registratiepagina een nieuwe bevestigingsmail aan, of log in als je
          account al actief is.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <Button asChild full size="lg">
          <Link href="/register">Nieuwe mail aanvragen</Link>
        </Button>
        <Button asChild full size="lg" variant="soft">
          <Link href="/login">Naar inloggen</Link>
        </Button>
      </div>
    </AuthShell>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  )
}
