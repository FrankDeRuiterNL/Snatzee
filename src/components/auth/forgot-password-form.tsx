'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * "Wachtwoord vergeten": asks GoTrue to mail a reset link.
 *
 * The answer is the same whether or not the address has an account, so
 * this page cannot be used to find out who plays Snatzee.
 */
export function ForgotPasswordForm({ initialEmail = '' }: { initialEmail?: string }) {
  const emailId = useId()
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  async function send(address: string) {
    setPending(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/wachtwoord-herstellen`,
    })
    setPending(false)

    if (resetError) {
      setError(resetError.message)
      return
    }
    setSentTo(address)
    setResendIn(60)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    const address = email.trim()
    if (!address) return setError('Vul je e-mailadres in')
    await send(address)
  }

  if (sentTo) {
    return (
      <div className="space-y-5">
        <div className="rounded-[1.5rem] bg-surface p-5 ring-1 ring-hairline">
          <span className="grid size-12 place-items-center rounded-2xl bg-mint-500/15 ring-1 ring-mint-500/30">
            <MailCheck className="size-6 text-mint-400" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-extrabold tracking-tight text-white">
            Check je mail 📬
          </h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
            Als er een account bestaat voor <strong className="text-white">{sentTo}</strong>, staat
            er een mail klaar met een link om een nieuw wachtwoord te kiezen. Geen mail? Kijk ook in
            je spamfolder.
          </p>
        </div>

        <Button
          variant="soft"
          full
          size="lg"
          loading={pending}
          disabled={resendIn > 0}
          onClick={() => void send(sentTo)}
        >
          {resendIn > 0 ? `Opnieuw versturen (${resendIn})` : 'Mail opnieuw versturen'}
        </Button>
        <FieldError>{error}</FieldError>

        <p className="text-center text-sm text-ink-muted">
          <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
            Terug naar inloggen
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor={emailId}>E-mailadres</Label>
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="send"
          placeholder="jij@voorbeeld.nl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FieldError>{error}</FieldError>
      </div>

      <Button type="submit" full size="lg" loading={pending}>
        Stuur een link
      </Button>

      <p className="text-center text-sm text-ink-muted">
        Weet je het weer?{' '}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Inloggen
        </Link>
      </p>
    </form>
  )
}
