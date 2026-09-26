import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, ChevronRight, History, Settings, Users, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { ProfileHeader } from '@/components/profile/profile-header'
import { AchievementPreview } from '@/components/profile/achievement-preview'
import { LevelCard } from '@/components/profile/level-badge'
import { Button } from '@/components/ui/button'
import {
  getAchievementsForUser,
  getCurrentProfile,
  getMyGroups,
  getUserStatistics,
} from '@/lib/supabase/queries'
import { getFriendsAndRequests } from '@/lib/supabase/friends'
import { pluralize } from '@/lib/utils'

export const metadata = { title: 'Profiel' }
export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const [stats, achievements, { friends }, groups] = await Promise.all([
    getUserStatistics(profile.id),
    getAchievementsForUser(profile.id),
    getFriendsAndRequests(),
    getMyGroups(),
  ])

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Profiel"
          subtitle="Je cijfers, level en achievements."
          action={
            <Link
              href="/app/settings"
              aria-label="Instellingen"
              className="press grid size-11 place-items-center rounded-full bg-surface text-ink-soft ring-1 ring-hairline shadow-soft"
            >
              <Settings className="size-5" aria-hidden />
            </Link>
          }
        />
      </div>

      <div className="space-y-6">
        <ProfileHeader
          displayName={profile.display_name}
          username={profile.username}
          avatarUrl={profile.avatar_url}
          bio={profile.bio}
          stats={stats}
          friendCount={friends.length}
          action={
            <Button asChild variant="soft" full size="sm">
              <Link href={`/u/${profile.username}`}>Bekijk publiek profiel</Link>
            </Button>
          }
        />

        {stats && <LevelCard stats={stats} />}

        <AchievementPreview achievements={achievements} />

        <nav aria-label="Meer" className="space-y-2 px-5">
          <NavCard
            href="/app/history"
            icon={History}
            accent="bg-aqua-500/15 text-aqua-300"
            title="Scorehistorie"
            subtitle={`${stats?.games_played ?? 0} ${pluralize(stats?.games_played ?? 0, 'potje', 'potjes')}`}
          />
          <NavCard
            href="/app/statistics"
            icon={BarChart3}
            accent="bg-mint-500/15 text-mint-300"
            title="Statistieken"
            subtitle="Grafieken, gemiddelden en records"
          />
          <NavCard
            href="/app/friends"
            icon={Users}
            accent="bg-tangerine-500/15 text-tangerine-300"
            title="Vrienden"
            subtitle={`${friends.length} ${pluralize(friends.length, 'vriend', 'vrienden')}`}
          />
          <NavCard
            href="/app/groups"
            icon={UsersRound}
            accent="bg-grape-500/15 text-grape-300"
            title="Groepen"
            subtitle={`${groups.length} ${pluralize(groups.length, 'groep', 'groepen')}`}
          />
        </nav>
      </div>
    </PageTransition>
  )
}

function NavCard({
  href,
  icon: Icon,
  accent,
  title,
  subtitle,
}: {
  href: string
  icon: LucideIcon
  accent: string
  title: string
  subtitle: string
}) {
  return (
    <Link
      href={href}
      className="press flex items-center gap-4 rounded-[1.5rem] bg-surface p-4 ring-1 ring-hairline shadow-soft"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${accent}`}>
        <Icon className="size-5" strokeWidth={2.4} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold tracking-tight text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-sm text-ink-muted">{subtitle}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
    </Link>
  )
}
