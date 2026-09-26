'use client'

import { Suspense, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

type State = 'verifying' | 'form' | 'saved' | 'failed'

/**
 * Where the link in the reset mail lands: choose a new password.
 *
 * The mail (see /api/email-templates/recovery) carries a token hash, which
 * is verified here and works from any device — also when the reset was
 * asked for in the iOS app. Without that template GoTrue's own link comes
 * back with a PKCE code or a session in the fragment; both are handled
 * too, so the page keeps working on a server that was not reconfigured.
 */
function ResetInner() {
  const passwordId = useId()
  const repeatId = useId()
  const [state, setState] = useState<State>('verifying')
  const [failure, setFailure] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    void (async () => {
      const supabase = getSupabaseBrowserClient()
      const url = new URL(window.location.href)
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

      const linkError = hash.get('error_description') ?? url.searchParams.get('error_description')
      const tokenHash = url.searchParams.get('token_hash')
      const code = url.searchParams.get('code')
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      let problem: string | null = linkError
      if (!problem && tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        problem = verifyError?.message ?? null
      } else if (!problem && code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        problem = exchangeError?.message ?? null
      } else if (!problem && accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        problem = sessionError?.message ?? null
      } else if (!problem) {
        problem = 'Deze link bevat geen herstelgegevens.'
      }

      // The token is single-use: keep it out of the history either way.
      window.history.replaceState(null, '', url.pathname)

      if (problem) {
        setFailure(problem)
        setState('failed')
        return
      }
      setState('form')
    })()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    if (password.length < 8) return setError('Wachtwoord moet minimaal 8 tekens zijn')
    if (password !== repeat) return setError('De wachtwoorden zijn niet hetzelfde')

    setPending(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (updateError) {
      setError(
        updateError.message.includes('different from the old')
          ? 'Kies een ander wachtwoord dan je vorige'
          : updateError.message,
      )
      return
    }
    setState('saved')
  }

  if (state === 'verifying') {
    return (
      <AuthShell title="Even geduld" subtitle="We controleren je link.">
        <div className="grid place-items-center py-10" role="status">
          <Loader2 className="size-8 animate-spin text-mint-400" aria-hidden />
        </div>
      </AuthShell>
    )
  }

  if (state === 'failed') {
    return (
      <AuthShell
        title="Link werkt niet meer"
        subtitle="Deze link is al gebruikt of verlopen. Vraag een nieuwe aan."
      >
        <div className="space-y-5">
          <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-hairline">
            <span className="grid size-12 place-items-center rounded-2xl bg-rose-ember-500/15 ring-1 ring-rose-ember-500/30">
              <MailWarning className="size-6 text-rose-ember-300" aria-hidden />
            </span>
            {failure && <p className="mt-4 text-sm leading-relaxed text-ink-muted">{failure}</p>}
          </div>
          <Button asChild full size="lg">
            <Link href="/wachtwoord-vergeten">Nieuwe link aanvragen</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (state === 'saved') {
    return (
      <AuthShell
        title="Wachtwoord gewijzigd"
        subtitle="Je kunt voortaan inloggen met je nieuwe wachtwoord."
      >
        <div className="space-y-5">
          <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-hairline">
            <span className="grid size-12 place-items-center rounded-2xl bg-mint-500/15 ring-1 ring-mint-500/30">
              <CheckCircle2 className="size-6 text-mint-400" aria-hidden />
            </span>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-soft">
              Gebruik je de iPhone-app? Open Snatzee! en log daar in met je nieuwe wachtwoord.
            </p>
          </div>
          <Button asChild full size="lg">
            <Link href="/app">Naar Snatzee</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Nieuw wachtwoord" subtitle="Kies een wachtwoord van minimaal 8 tekens.">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor={passwordId}>Nieuw wachtwoord</Label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            enterKeyHint="next"
            placeholder="Minimaal 8 tekens"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <div>
          <Label htmlFor={repeatId}>Herhaal wachtwoord</Label>
          <Input
            id={repeatId}
            type="password"
            autoComplete="new-password"
            enterKeyHint="go"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
            minLength={8}
          />
          <FieldError>{error}</FieldError>
        </div>
        <Button type="submit" full size="lg" loading={pending}>
          Wachtwoord opslaan
        </Button>
      </form>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  )
}
