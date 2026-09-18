import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { HistoryView } from '@/components/score/history-view'
import { getCurrentProfile, getRecentScores } from '@/lib/supabase/queries'
import { pluralize } from '@/lib/utils'

export const metadata = { title: 'Historie' }
export const dynamic = 'force-dynamic'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const { filter } = await searchParams
  const entries = await getRecentScores(profile.id, 500)

  const initialFilter = filter === 'won' || filter === 'lost' ? filter : 'all'

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Historie"
          subtitle={`${entries.length} ${pluralize(entries.length, 'potje', 'potjes')} geregistreerd`}
          backHref="/app"
        />
      </div>

      <HistoryView entries={entries} initialFilter={initialFilter} />
    </PageTransition>
  )
}
