import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm } from '@/components/auth/auth-form'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { ANY_OAUTH_ENABLED } from '@/lib/constants'

export const metadata = { title: 'Inloggen' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams

  return (
    <AuthShell title="Welkom terug" subtitle="Log in om je scores, records en ranglijsten te zien.">
      {error && <SignInError detail={error} />}
      <OAuthButtons next={next} />
      {ANY_OAUTH_ENABLED && <Divider />}
      <AuthForm mode="login" next={next} />
    </AuthShell>
  )
}

/**
 * What went wrong on the way back from Apple (or a mail link): the callback
 * sends the reason along as ?error=. Said in plain Dutch, with the
 * technical text underneath for whoever runs the server.
 */
function SignInError({ detail }: { detail: string }) {
  const lower = detail.toLowerCase()
  const message = lower.includes('exchange external code')
    ? 'Inloggen met Apple is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het de beheerder weten.'
    : lower.includes('access_denied') || lower.includes('cancel')
      ? 'Inloggen is geannuleerd.'
      : lower.includes('expired') || lower.includes('invalid')
        ? 'Deze link is verlopen of al gebruikt. Log opnieuw in.'
        : 'Inloggen is niet gelukt. Probeer het nog eens.'

  return (
    <div
      role="alert"
      className="mb-6 rounded-[1.5rem] bg-rose-ember-500/10 p-4 ring-1 ring-rose-ember-500/30"
    >
      <p className="text-[0.95rem] font-semibold leading-relaxed text-rose-ember-300">{message}</p>
      <p className="mt-1 break-words text-xs text-ink-muted">{detail}</p>
    </div>
  )
}

function Divider() {
  return (
    <div className="my-7 flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">of</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}
