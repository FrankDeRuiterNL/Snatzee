import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { FriendsView } from '@/components/friends/friends-view'
import { getCurrentProfile, getMyGroups } from '@/lib/supabase/queries'
import { getFriendsAndRequests } from '@/lib/supabase/friends'
import { pluralize } from '@/lib/utils'

export const metadata = { title: 'Vrienden' }
export const dynamic = 'force-dynamic'

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const { tab } = await searchParams
  const [{ friends, requests }, groups] = await Promise.all([
    getFriendsAndRequests(),
    getMyGroups(),
  ])

  const initialTab = tab === 'requests' || tab === 'search' ? tab : 'friends'

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Vrienden"
          subtitle={`${friends.length} ${pluralize(friends.length, 'vriend', 'vrienden')}${
            requests.length > 0 ? ` · ${requests.length} open ${pluralize(requests.length, 'verzoek', 'verzoeken')}` : ''
          }`}
        />
      </div>

      <div className="mb-4 px-5">
        <Link
          href="/app/groups"
          className="press flex items-center gap-4 rounded-[1.5rem] bg-surface p-4 ring-1 ring-hairline shadow-soft"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-grape-500/15 text-grape-300">
            <Users className="size-5" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold tracking-tight text-ink">Groepen</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              {groups.length === 0
                ? 'Maak een groep voor je familie of vrijdagavondclub'
                : `${groups.length} ${pluralize(groups.length, 'groep', 'groepen')}`}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
        </Link>
      </div>

      <FriendsView friends={friends} requests={requests} initialTab={initialTab} />
    </PageTransition>
  )
}
