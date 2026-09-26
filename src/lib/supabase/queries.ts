import 'server-only'
import { cache } from 'react'
import { createSupabaseServerClient } from './server'
import type {
  Achievement,
  AchievementWithUnlock,
  Group,
  HomeSummary,
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

export async function getProfileByUsername(username: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    // Usernames are stored lowercase. Not ilike: `_` is a wildcard there,
    // and underscores are allowed in usernames.
    .eq('username', username.toLowerCase())
    .maybeSingle()
  return (data as Profile | null) ?? null
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

/** Scores of any player, without the private note field. */
export async function getPublicScores(userId: string, limit = 30): Promise<PublicScoreEntry[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from('public_score_entries')
    .select('*')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(limit)
  return (data as PublicScoreEntry[] | null) ?? []
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

/**
 * How many accepted friends a player has.
 *
 * Goes through an RPC because friendships are only visible to the two
 * people in them — a plain count would read 0 on anyone else's profile.
 */
export async function getFriendCount(userId: string): Promise<number> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('friend_count', { p_user: userId })
  if (error) return 0
  return Number(data ?? 0)
}
