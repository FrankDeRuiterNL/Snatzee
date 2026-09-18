import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { AchievementsView } from '@/components/achievements/achievements-view'
import { EmptyState } from '@/components/ui/empty-state'
import { getAchievementsForUser, getCurrentProfile } from '@/lib/supabase/queries'

export const metadata = { title: 'Achievements' }
export const dynamic = 'force-dynamic'

export default async function AchievementsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const achievements = await getAchievementsForUser(profile.id)

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Achievements"
          subtitle="Records, mijlpalen en een paar geheimen."
          backHref="/app"
        />
      </div>

      {achievements.length === 0 ? (
        <div className="px-5">
          <EmptyState
            emoji="🏅"
            title="Nog geen achievements"
            description="Begin met spelen om achievements vrij te spelen."
          />
        </div>
      ) : (
        <AchievementsView achievements={achievements} />
      )}
    </PageTransition>
  )
}
