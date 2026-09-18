import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm } from '@/components/auth/auth-form'
import { OAuthButtons } from '@/components/auth/oauth-buttons'

export const metadata = { title: 'Account maken' }

export default function RegisterPage() {
  return (
    <AuthShell
      title="Maak je Snatzee"
      subtitle="Gratis, in een halve minuut. Daarna hoef je alleen nog je eindscores in te voeren."
    >
      <OAuthButtons />
      <div className="my-7 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-navy-100" />
        <span className="text-xs font-semibold uppercase tracking-widest text-navy-300">of</span>
        <span className="h-px flex-1 bg-navy-100" />
      </div>
      <AuthForm mode="register" />
    </AuthShell>
  )
}
