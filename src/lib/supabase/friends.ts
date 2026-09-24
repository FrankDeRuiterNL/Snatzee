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

/**
 * Accepted friends, incoming pending requests and outgoing ones, in one
 * pass.
 *
 * Outgoing requests used to be dropped here because only incoming ones can
 * be acted on — but that left the Verzoeken tab empty after sending one,
 * while the search results already said "Verzonden". They are returned
 * separately rather than mixed in, because the only thing you can do with
 * your own request is withdraw it.
 */
export async function getFriendsAndRequests(): Promise<{
  friends: FriendSummary[]
  requests: RequestSummary[]
  sent: RequestSummary[]
}> {
  const user = await getCurrentUser()
  if (!user) return { friends: [], requests: [], sent: [] }

  const supabase = await createSupabaseServerClient()

  const { data } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .in('status', ['pending', 'accepted'])

  const rows = (data as Pick<Friendship, 'id' | 'requester_id' | 'addressee_id' | 'status'>[] | null) ?? []
  if (rows.length === 0) return { friends: [], requests: [], sent: [] }

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
  const sent: RequestSummary[] = []

  for (const row of rows) {
    const otherId = row.requester_id === user.id ? row.addressee_id : row.requester_id
    const summary = toSummary(otherId)
    if (!summary) continue

    if (row.status === 'accepted') {
      friends.push(summary)
    } else if (row.addressee_id === user.id) {
      requests.push({ ...summary, friendship_id: row.id })
    } else {
      sent.push({ ...summary, friendship_id: row.id })
    }
  }

  friends.sort((a, b) => b.games_played - a.games_played)
  return { friends, requests, sent }
}
