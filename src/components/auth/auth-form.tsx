'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })

      if (signUpError) {
        setPending(false)
        setError(signUpError.message)
        return
      }

      // With e-mail confirmation on, there is no session yet.
      if (!data.session) {
        setPending(false)
        toast.success('Check je mail 📬', {
          description: 'We hebben je een bevestigingslink gestuurd.',
        })
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

      <p className="pt-2 text-center text-sm text-navy-300">
        {mode === 'register' ? (
          <>
            Heb je al een account?{' '}
            <Link href="/login" className="font-semibold text-navy-900 underline underline-offset-4">
              Inloggen
            </Link>
          </>
        ) : (
          <>
            Nog geen account?{' '}
            <Link
              href="/register"
              className="font-semibold text-navy-900 underline underline-offset-4"
            >
              Registreren
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
