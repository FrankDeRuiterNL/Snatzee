import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { HistoryView } from '@/components/score/history-view'
import { getCurrentProfile, getRecentScores, getUserStatistics } from '@/lib/supabase/queries'
import { pluralize } from '@/lib/utils'

export const metadata = { title: 'Historie' }
export const dynamic = 'force-dynamic'

const HISTORY_LIMIT = 500

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const { filter } = await searchParams
  const [entries, stats] = await Promise.all([
    getRecentScores(profile.id, HISTORY_LIMIT),
    getUserStatistics(profile.id),
  ])
  // The list stops at HISTORY_LIMIT; the count in the header should not.
  const total = Math.max(stats?.games_played ?? 0, entries.length)

  const initialFilter = filter === 'won' || filter === 'lost' ? filter : 'all'

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Historie"
          subtitle={
            total > entries.length
              ? `${total} potjes geregistreerd · laatste ${entries.length} hieronder`
              : `${total} ${pluralize(total, 'potje', 'potjes')} geregistreerd`
          }
          backHref="/app"
        />
      </div>

      <HistoryView entries={entries} initialFilter={initialFilter} />
    </PageTransition>
  )
}
