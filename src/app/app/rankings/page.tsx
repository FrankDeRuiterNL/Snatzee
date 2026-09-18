import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { RankingsView } from '@/components/rankings/rankings-view'
import { getCurrentProfile, getMyGroups } from '@/lib/supabase/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MIN_GAMES_FOR_AVERAGE_RANKING } from '@/lib/constants'

export const metadata = { title: 'Ranglijsten' }
export const dynamic = 'force-dynamic'

export default async function RankingsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const supabase = await createSupabaseServerClient()
  const [groups, { data: minGames }] = await Promise.all([
    getMyGroups(),
    supabase.rpc('app_setting_int', {
      p_key: 'min_games_for_average_ranking',
      p_default: MIN_GAMES_FOR_AVERAGE_RANKING,
    }),
  ])

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader title="Ranglijsten" subtitle="Wie is er echt goed met de dobbelstenen?" />
      </div>

      <RankingsView
        groups={groups.map((g) => ({ id: g.id, name: g.name, emoji: g.emoji }))}
        minGamesForAverage={(minGames as number | null) ?? MIN_GAMES_FOR_AVERAGE_RANKING}
      />
    </PageTransition>
  )
}
