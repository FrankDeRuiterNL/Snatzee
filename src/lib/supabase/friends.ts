import 'server-only'
import { createSupabaseServerClient } from './server'
import { getCurrentUser } from './queries'
import type { FriendSummary, RequestSummary } from '@/components/friends/friends-view'

export interface FriendsOverview {
  friends: FriendSummary[]
  requests: RequestSummary[]
  sent: RequestSummary[]
}

const EMPTY: FriendsOverview = { friends: [], requests: [], sent: [] }

/**
 * Accepted friends, incoming pending requests and outgoing ones.
 *
 * One RPC (get_friends_overview), shared with the iOS app, instead of
 * three queries stitched together here. Outgoing requests are returned
 * separately because the only thing you can do with your own request is
 * withdraw it.
 */
export async function getFriendsAndRequests(): Promise<FriendsOverview> {
  const user = await getCurrentUser()
  if (!user) return EMPTY

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_friends_overview')
  if (error || !data) return EMPTY
  return data as FriendsOverview
}
