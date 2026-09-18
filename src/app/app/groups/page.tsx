import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { GroupsView } from '@/components/groups/groups-view'
import { getCurrentProfile, getMyGroups } from '@/lib/supabase/queries'

export const metadata = { title: 'Groepen' }
export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const groups = await getMyGroups()

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Groepen"
          subtitle="Ranglijsten binnen je eigen kring."
          backHref="/app/friends"
        />
      </div>

      <GroupsView
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          emoji: g.emoji,
          description: g.description,
          member_count: g.member_count,
        }))}
      />
    </PageTransition>
  )
}
