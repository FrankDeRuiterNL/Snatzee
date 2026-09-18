import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/auth/onboarding-flow'
import { getCurrentProfile, getCurrentUser } from '@/lib/supabase/queries'

export const metadata = { title: 'Welkom' }

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getCurrentProfile()
  if (profile?.onboarding_completed) redirect('/app')

  return (
    <OnboardingFlow
      userId={user.id}
      initialUsername={profile?.username ?? ''}
      initialDisplayName={profile?.display_name ?? ''}
      initialAvatarUrl={profile?.avatar_url ?? null}
    />
  )
}
