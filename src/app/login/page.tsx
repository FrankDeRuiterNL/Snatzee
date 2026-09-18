import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm } from '@/components/auth/auth-form'
import { OAuthButtons } from '@/components/auth/oauth-buttons'

export const metadata = { title: 'Inloggen' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <AuthShell title="Welkom terug" subtitle="Log in om je scores, records en ranglijsten te zien.">
      <OAuthButtons next={next} />
      <Divider />
      <AuthForm mode="login" next={next} />
    </AuthShell>
  )
}

function Divider() {
  return (
    <div className="my-7 flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1 bg-navy-100" />
      <span className="text-xs font-semibold uppercase tracking-widest text-navy-300">of</span>
      <span className="h-px flex-1 bg-navy-100" />
    </div>
  )
}
