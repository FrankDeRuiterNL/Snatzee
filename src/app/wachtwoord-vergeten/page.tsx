import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata = { title: 'Wachtwoord vergeten' }

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <AuthShell
      title="Wachtwoord vergeten"
      subtitle="Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord te kiezen."
    >
      <ForgotPasswordForm initialEmail={email ?? ''} />
    </AuthShell>
  )
}
