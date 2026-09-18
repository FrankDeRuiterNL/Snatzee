import 'server-only'
import { createSupabaseServerClient } from './server'
import { getCurrentUser } from './queries'
import type { FriendSummary, RequestSummary } from '@/components/friends/friends-view'
import type { Friendship } from '@/types/database'

interface ProfileJoin {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
}

/** Accepted friends plus incoming pending requests, in one pass. */
export async function getFriendsAndRequests(): Promise<{
  friends: FriendSummary[]
  requests: RequestSummary[]
}> {
  const user = await getCurrentUser()
  if (!user) return { friends: [], requests: [] }

  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .in('status', ['pending', 'accepted'])

  const rows = (data as Pick<Friendship, 'id' | 'requester_id' | 'addressee_id' | 'status'>[] | null) ?? []
  if (rows.length === 0) return { friends: [], requests: [] }

  const otherIds = rows.map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id))

  const [{ data: profiles }, { data: stats }] = await Promise.all([
    supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', otherIds),
    supabase.from('user_statistics').select('user_id, games_played').in('user_id', otherIds),
  ])

  const profileMap = new Map(((profiles as ProfileJoin[] | null) ?? []).map((p) => [p.id, p]))
  const gamesMap = new Map(
    ((stats as { user_id: string; games_played: number }[] | null) ?? []).map((s) => [
      s.user_id,
      s.games_played,
    ]),
  )

  const toSummary = (id: string): FriendSummary | null => {
    const profile = profileMap.get(id)
    if (!profile) return null
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      games_played: gamesMap.get(id) ?? 0,
    }
  }

  const friends: FriendSummary[] = []
  const requests: RequestSummary[] = []

  for (const row of rows) {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id
    const summary = toSummary(otherId)
    if (!summary) continue

    if (row.status === 'accepted') {
      friends.push(summary)
    } else if (row.addressee_id === user.id) {
      // Only incoming requests are actionable.
      requests.push({ ...summary, friendship_id: row.id })
    }
  }

  friends.sort((a, b) => b.games_played - a.games_played)
  return { friends, requests }
}
