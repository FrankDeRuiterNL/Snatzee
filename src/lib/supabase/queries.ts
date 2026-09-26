import 'server-only'
import { cache } from 'react'
import { createSupabaseServerClient } from './server'
import type {
  Achievement,
  AchievementWithUnlock,
  Group,
  HomeSummary,
  FriendshipStatus,
  Profile,
  PublicScoreEntry,
  ScoreEntry,
  UserAchievement,
  UserStatistics,
} from '@/types/database'

/** Current auth user, memoised per request. */
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return (data as Profile | null) ?? null
})

export async function getHomeSummary(): Promise<HomeSummary | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.rpc('get_home_summary')
  return (data as HomeSummary | null) ?? null
}

export async function getUserStatistics(userId: string): Promise<UserStatistics | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('user_statistics')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as UserStatistics | null) ?? null
}

export async function getRecentScores(userId: string, limit = 5): Promise<ScoreEntry[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('score_entries')
    .select('*')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as ScoreEntry[] | null) ?? []
}

export async function getAchievementsForUser(userId: string): Promise<AchievementWithUnlock[]> {
  const supabase = await createSupabaseServerClient()
  const [{ data: catalogue }, { data: unlocks }] = await Promise.all([
    supabase.from('achievements').select('*').order('sort_order'),
    supabase.from('user_achievements').select('achievement_id, unlocked_at').eq('user_id', userId),
  ])

  const unlockedMap = new Map(
    ((unlocks as Pick<UserAchievement, 'achievement_id' | 'unlocked_at'>[] | null) ?? []).map(
      (u) => [u.achievement_id, u.unlocked_at],
    ),
  )

  return ((catalogue as Achievement[] | null) ?? []).map((a) => ({
    ...a,
    unlocked_at: unlockedMap.get(a.id) ?? null,
  }))
}

/** All configurable limits, keyed by setting name. */
export async function getAppSettings(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('app_settings').select('key, value')
  return Object.fromEntries(
    ((data as { key: string; value: number }[] | null) ?? []).map((row) => [row.key, row.value]),
  )
}

export async function getMyGroups(): Promise<(Group & { member_count: number })[]> {
  const supabase = await createSupabaseServerClient()
  const user = await getCurrentUser()
  if (!user) return []

  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id)

  const ids = ((memberships as { group_id: string }[] | null) ?? []).map((m) => m.group_id)
  if (ids.length === 0) return []

  const { data: groups } = await supabase
    .from('groups')
    .select('*, group_members(count)')
    .in('id', ids)
    .order('created_at', { ascending: false })

  return ((groups as (Group & { group_members: { count: number }[] })[] | null) ?? []).map((g) => ({
    ...g,
    member_count: g.group_members?.[0]?.count ?? 0,
  }))
}

/**
 * Friend requests waiting on the signed-in user.
 *
 * Read in the app layout so the badge on the Vrienden tab is there on
 * first paint rather than appearing a moment later.
 */
export async function getPendingFriendRequestCount(): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('pending_friend_request_count')
  if (error) return 0
  return Number(data ?? 0)
}

export interface PublicProfilePage {
  profile: Pick<
    Profile,
    'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'is_private' | 'created_at'
  >
  is_self: boolean
  can_view_details: boolean
  blocked_by_me: boolean
  friendship: { id: string; status: FriendshipStatus; is_incoming: boolean } | null
  friend_count: number
  stats: UserStatistics | null
  achievements: AchievementWithUnlock[]
  recent_scores: PublicScoreEntry[]
}

/**
 * Everything a public profile page shows, in one call (get_public_profile,
 * shared with the iOS app). Null for a player that does not exist, has
 * not finished onboarding, or blocked the viewer. Memoised per request, so
 * the metadata and the page share one round-trip.
 */
export const getPublicProfile = cache(async (username: string): Promise<PublicProfilePage | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_public_profile', { p_username: username })
  if (error || !data) return null
  return data as PublicProfilePage
})
