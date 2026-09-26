import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { GroupDetail, type GroupMemberRow } from '@/components/groups/group-detail'
import { getCurrentProfile } from '@/lib/supabase/queries'
import { getFriendsAndRequests } from '@/lib/supabase/friends'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MIN_GAMES_FOR_AVERAGE_RANKING } from '@/lib/constants'
import type { Group } from '@/types/database'

interface GroupDetailResponse {
  group: Group
  is_owner: boolean
  my_role: GroupMemberRow['role']
  min_games_for_average_ranking: number
  members: GroupMemberRow[]
}

export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const { id } = await params
  const supabase = await createSupabaseServerClient()

  // One RPC, shared with the iOS app. It refuses anyone who is not a
  // member, which is the same answer as a group that does not exist.
  const [{ data, error }, { friends }] = await Promise.all([
    supabase.rpc('get_group_detail', { p_group_id: id }),
    getFriendsAndRequests(),
  ])
  if (error || !data) notFound()

  const detail = data as GroupDetailResponse
  const group = detail.group
  const members: GroupMemberRow[] = detail.members

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader title="Groep" backHref="/app/groups" />
      </div>

      <GroupDetail
        group={{
          id: group.id,
          name: group.name,
          emoji: group.emoji,
          description: group.description,
          invite_code: group.invite_code,
        }}
        members={members}
        friends={friends.map((f) => ({
          id: f.id,
          username: f.username,
          display_name: f.display_name,
          avatar_url: f.avatar_url,
        }))}
        isOwner={detail.is_owner}
        minGamesForAverage={detail.min_games_for_average_ranking ?? MIN_GAMES_FOR_AVERAGE_RANKING}
      />
    </PageTransition>
  )
}
