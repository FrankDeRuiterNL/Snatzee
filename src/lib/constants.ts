/**
 * Central configuration. The database mirrors these bounds in
 * `public.app_settings`, which is the source of truth server-side.
 */
export const SCORE_MIN = 0
export const SCORE_MAX = 1575

/** Minimum registered games before a player joins the average-score ranking. */
export const MIN_GAMES_FOR_AVERAGE_RANKING = 5

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
export const DISPLAY_NAME_MAX = 40
export const NOTE_MAX = 280
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

export const RARITY_ORDER = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const

export const RARITY_STYLES = {
  COMMON: {
    label: 'Common',
    ring: 'ring-navy-100',
    chip: 'bg-navy-50 text-navy-500',
    glow: 'from-navy-100 to-navy-50',
    accent: 'text-navy-500',
  },
  RARE: {
    label: 'Rare',
    ring: 'ring-aqua-100',
    chip: 'bg-aqua-100 text-aqua-500',
    glow: 'from-aqua-100 to-cream-50',
    accent: 'text-aqua-500',
  },
  EPIC: {
    label: 'Epic',
    ring: 'ring-grape-100',
    chip: 'bg-grape-100 text-grape-600',
    glow: 'from-grape-100 to-cream-50',
    accent: 'text-grape-600',
  },
  LEGENDARY: {
    label: 'Legendary',
    ring: 'ring-tangerine-100',
    chip: 'bg-tangerine-100 text-tangerine-600',
    glow: 'from-tangerine-100 to-cream-50',
    accent: 'text-tangerine-600',
  },
} as const

export const ACHIEVEMENT_CATEGORIES = [
  { key: 'all', label: 'Alles' },
  { key: 'scores', label: 'Scores' },
  { key: 'yahtzee', label: 'Yahtzee' },
  { key: 'wins', label: 'Wins' },
  { key: 'games', label: 'Potjes' },
  { key: 'social', label: 'Sociaal' },
  { key: 'secret', label: 'Secret' },
] as const

export type LeaderboardMetric =
  | 'highest_score'
  | 'average_score'
  | 'games_played'
  | 'wins'
  | 'yahtzee_count'
  | 'first_roll_yahtzee_count'

export const LEADERBOARD_METRICS: {
  key: LeaderboardMetric
  label: string
  title: string
  suffix?: string
  decimals?: number
}[] = [
  { key: 'highest_score', label: 'Score', title: 'Hoogste score ooit' },
  { key: 'average_score', label: 'Gemiddelde', title: 'Hoogste gemiddelde score', decimals: 1 },
  { key: 'games_played', label: 'Potjes', title: 'Meeste gespeelde potjes' },
  { key: 'wins', label: 'Wins', title: 'Meeste overwinningen' },
  { key: 'yahtzee_count', label: 'Yahtzee', title: "Meeste Yahtzee's" },
  { key: 'first_roll_yahtzee_count', label: '1 worp', title: "Meeste Yahtzee's in één worp" },
]

export type LeaderboardScope = 'global' | 'friends' | 'group'

export const LEADERBOARD_SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: 'global', label: 'Wereldwijd' },
  { key: 'friends', label: 'Vrienden' },
  { key: 'group', label: 'Groep' },
]
