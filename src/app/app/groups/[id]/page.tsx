import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { GroupDetail, type GroupMemberRow } from '@/components/groups/group-detail'
import { getCurrentProfile } from '@/lib/supabase/queries'
import { getFriendsAndRequests } from '@/lib/supabase/friends'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MIN_GAMES_FOR_AVERAGE_RANKING } from '@/lib/constants'
import type { Group, GroupMember, Profile } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: groupRow } = await supabase.from('groups').select('*').eq('id', id).maybeSingle()
  const group = groupRow as Group | null
  // RLS already hides groups the user is not a member of.
  if (!group) notFound()

  const { data: memberRows } = await supabase
    .from('group_members')
    .select('user_id, role, joined_at')
    .eq('group_id', id)

  const memberships = (memberRows as Pick<GroupMember, 'user_id' | 'role' | 'joined_at'>[] | null) ?? []
  const memberIds = memberships.map((m) => m.user_id)

  const [{ data: profiles }, { data: stats }, { data: minGames }, { friends }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', memberIds),
    supabase.from('user_statistics').select('user_id, games_played').in('user_id', memberIds),
    supabase.rpc('app_setting_int', {
      p_key: 'min_games_for_average_ranking',
      p_default: MIN_GAMES_FOR_AVERAGE_RANKING,
    }),
    getFriendsAndRequests(),
  ])

  const profileMap = new Map(
    ((profiles as Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>[] | null) ?? []).map(
      (p) => [p.id, p],
    ),
  )
  const gamesMap = new Map(
    ((stats as { user_id: string; games_played: number }[] | null) ?? []).map((s) => [
      s.user_id,
      s.games_played,
    ]),
  )

  const members: GroupMemberRow[] = memberships
    .map((membership) => {
      const memberProfile = profileMap.get(membership.user_id)
      if (!memberProfile) return null
      return {
        user_id: membership.user_id,
        username: memberProfile.username,
        display_name: memberProfile.display_name,
        avatar_url: memberProfile.avatar_url,
        role: membership.role,
        games_played: gamesMap.get(membership.user_id) ?? 0,
      }
    })
    .filter((m): m is GroupMemberRow => m !== null)
    .sort((a, b) => {
      if (a.role === 'owner') return -1
      if (b.role === 'owner') return 1
      return b.games_played - a.games_played
    })

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
        isOwner={group.owner_id === profile.id}
        minGamesForAverage={(minGames as number | null) ?? MIN_GAMES_FOR_AVERAGE_RANKING}
      />
    </PageTransition>
  )
}
