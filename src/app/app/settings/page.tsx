import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { SettingsView } from '@/components/profile/settings-view'
import { getAppSettings, getCurrentProfile, getCurrentUser } from '@/lib/supabase/queries'

export const metadata = { title: 'Instellingen' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [profile, user] = await Promise.all([getCurrentProfile(), getCurrentUser()])
  if (!profile || !user) redirect('/login')

  // Only admins can act on these, so only fetch them when they are shown.
  const appSettings = profile.role === 'user' ? {} : await getAppSettings()

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader title="Instellingen" backHref="/app/profile" />
      </div>

      <SettingsView profile={profile} email={user.email ?? null} appSettings={appSettings} />
    </PageTransition>
  )
}
