'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

export function AuthForm({ mode, next }: { mode: 'login' | 'register'; next?: string }) {
  const router = useRouter()
  const emailId = useId()
  const passwordId = useId()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  /** Set once a confirmation mail has gone out, which swaps the form for the
   *  "check your inbox" panel. */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  // Rate-limits the resend button; GoTrue refuses rapid repeats anyway.
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return

    if (!email.trim()) return setError('Vul je e-mailadres in')
    if (password.length < 8) return setError('Wachtwoord moet minimaal 8 tekens zijn')

    setPending(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      })

      if (signUpError) {
        setPending(false)
        setError(signUpError.message)
        return
      }

      // With e-mail confirmation on there is no session yet, so the account
      // is not usable until the link in the mail is opened.
      if (!data.session) {
        setPending(false)
        setAwaitingConfirmation(email.trim())
        setResendIn(30)
        return
      }

      router.replace('/onboarding')
      router.refresh()
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setPending(false)
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'E-mailadres of wachtwoord klopt niet'
          : signInError.message,
      )
      return
    }

    router.replace(next ?? '/app')
    router.refresh()
  }

  async function resend() {
    if (resending || resendIn > 0 || !awaitingConfirmation) return
    setResending(true)

    const supabase = getSupabaseBrowserClient()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: awaitingConfirmation,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })

    setResending(false)

    if (resendError) {
      toast.error('Versturen is niet gelukt', { description: resendError.message })
      return
    }

    setResendIn(30)
    toast.success('Mail opnieuw verzonden 📬')
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-hairline">
          <span className="grid size-12 place-items-center rounded-2xl bg-mint-500/15 ring-1 ring-mint-500/30">
            <MailCheck className="size-6 text-mint-400" aria-hidden />
          </span>

          <h2 className="mt-4 text-lg font-extrabold tracking-tight text-white">
            Check je mail 📬
          </h2>

          <p className="mt-2 text-[0.95rem] leading-relaxed text-white">
            We hebben een bevestigingslink gestuurd naar{' '}
            <strong className="font-bold text-white">{awaitingConfirmation}</strong>. Open die
            link om je account te activeren.
          </p>

          <p className="mt-3 text-[0.95rem] leading-relaxed text-white">
            Niets ontvangen? Check ook even je <strong className="font-bold">spamfolder</strong> —
            daar belandt de mail nog wel eens.
          </p>
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            full
            size="lg"
            variant="soft"
            loading={resending}
            disabled={resending || resendIn > 0}
            onClick={resend}
          >
            {resendIn > 0 ? `Opnieuw verzenden (${resendIn}s)` : 'Bevestigingsmail opnieuw sturen'}
          </Button>

          <Button
            type="button"
            full
            size="lg"
            variant="ghost"
            onClick={() => setAwaitingConfirmation(null)}
          >
            Ander e-mailadres gebruiken
          </Button>
        </div>

        <p className="text-center text-sm text-ink-soft">
          Al bevestigd?{' '}
          <Link href="/login" className="font-semibold text-mint-400 underline underline-offset-4">
            Inloggen
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor={emailId}>E-mailadres</Label>
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          placeholder="jij@voorbeeld.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <Label htmlFor={passwordId}>Wachtwoord</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          enterKeyHint="go"
          placeholder={mode === 'register' ? 'Minimaal 8 tekens' : '••••••••'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <FieldError>{error}</FieldError>
      </div>

      <Button type="submit" full size="lg" loading={pending} className="mt-2">
        {mode === 'register' ? 'Account maken' : 'Inloggen'}
      </Button>

      <p className="pt-2 text-center text-sm text-ink-muted">
        {mode === 'register' ? (
          <>
            Heb je al een account?{' '}
            <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
              Inloggen
            </Link>
          </>
        ) : (
          <>
            Nog geen account?{' '}
            <Link
              href="/register"
              className="font-semibold text-ink underline underline-offset-4"
            >
              Registreren
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
