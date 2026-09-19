/**
 * Hand-maintained mirror of the SQL in `supabase/migrations`.
 * Regenerate-able with `supabase gen types typescript`, but kept explicit
 * here so the app type-checks without a live database connection.
 */

export type YahtzeeEventType = 'NORMAL' | 'FIRST_ROLL'
export type FriendshipStatus = 'pending' | 'accepted' | 'declined'
export type GroupMemberRole = 'owner' | 'admin' | 'member'
export type AchievementRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
export type AppRole = 'user' | 'admin' | 'superadmin'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  onboarding_completed: boolean
  is_private: boolean
  role: AppRole
  created_at: string
  updated_at: string
}

export interface AppSetting {
  key: string
  value: number
  description: string | null
  updated_at: string
}

export interface ScoreEntry {
  id: string
  user_id: string
  score: number
  is_win: boolean
  /** Normal Yahtzees thrown during this game, reported with the result. */
  yahtzee_count: number
  played_at: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface PublicScoreEntry {
  id: string
  user_id: string
  score: number
  is_win: boolean
  played_at: string
  created_at: string
}

export interface YahtzeeEvent {
  id: string
  user_id: string
  event_type: YahtzeeEventType
  created_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  owner_id: string
  name: string
  description: string | null
  image_url: string | null
  emoji: string | null
  invite_code: string
  created_at: string
}

export interface GroupMember {
  group_id: string
  user_id: string
  role: GroupMemberRole
  joined_at: string
}

export interface Achievement {
  id: string
  key: string
  name: string
  description: string
  icon: string
  rarity: AchievementRarity
  category: string
  is_secret: boolean
  sort_order: number
  criteria: Record<string, unknown>
  created_at: string
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string
  source_id: string | null
}

export interface PlayerLevel {
  key: string
  name: string
  emoji: string
  min_games: number
  sort_order: number
}

export interface UserStatistics {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  games_played: number
  wins: number
  losses: number
  average_score: number | null
  highest_score: number | null
  lowest_score: number | null
  last_played_at: string | null
  yahtzee_count: number
  first_roll_yahtzee_count: number
  win_rate: number
  achievement_count: number
  level_key: string | null
  level_name: string | null
  level_emoji: string | null
  level_min_games: number | null
  next_level_name: string | null
  next_level_emoji: string | null
  next_level_min_games: number | null
  games_to_next_level: number | null
}

export interface HomeSummary {
  games_played: number
  wins: number
  win_rate: number
  average_score: number | null
  highest_score: number | null
  lowest_score: number | null
  yahtzee_count: number
  first_roll_yahtzee_count: number
  achievement_count: number
  average_this_month: number | null
  average_last_month: number | null
  average_last_10: number | null
  pending_friend_requests: number
  games_today: number
  current_win_streak: number
}

export interface LeaderboardRow {
  rank: number
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  value: number
  games_played: number
  is_current_user: boolean
}

export interface SearchUserRow {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  games_played: number
  friendship_status: FriendshipStatus | null
  friendship_id: string | null
  is_incoming: boolean | null
}

/** Achievement row enriched with the unlock timestamp, as returned by RPCs. */
export type UnlockedAchievement = Achievement & { unlocked_at: string }

export interface RecordScoreResult {
  entry: ScoreEntry
  unlocked: UnlockedAchievement[]
  is_personal_record: boolean
}

export interface AdminScoreRow {
  id: string
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  score: number
  is_win: boolean
  yahtzee_count: number
  note: string | null
  played_at: string
  created_at: string
  total_count: number
}

export interface AdminFirstRollRow {
  id: string
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  created_at: string
  total_count: number
}

export interface AdminCounts {
  score_entries: number
  first_roll_yahtzees: number
  players: number
}

export type AdminScoreSort = 'newest' | 'oldest' | 'highest' | 'lowest'

export interface RecordYahtzeeResult {
  event: YahtzeeEvent
  yahtzee_count: number
  first_roll_yahtzee_count: number
  unlocked: UnlockedAchievement[]
}

export interface AchievementWithUnlock extends Achievement {
  unlocked_at: string | null
}

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
  last_seen_at: string
}

export interface AdminUser {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  has_push: boolean
  achievement_count: number
}
