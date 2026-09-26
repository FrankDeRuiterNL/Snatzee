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
    ring: 'ring-hairline',
    chip: 'bg-white/8 text-ink-soft',
    glow: 'from-white/12 to-white/5',
    accent: 'text-ink-soft',
  },
  RARE: {
    label: 'Rare',
    ring: 'ring-aqua-500/30',
    chip: 'bg-aqua-500/15 text-aqua-300',
    glow: 'from-aqua-500/20 to-surface',
    accent: 'text-aqua-300',
  },
  EPIC: {
    label: 'Epic',
    ring: 'ring-grape-500/30',
    chip: 'bg-grape-500/15 text-grape-300',
    glow: 'from-grape-500/20 to-surface',
    accent: 'text-grape-300',
  },
  LEGENDARY: {
    label: 'Legendary',
    ring: 'ring-tangerine-500/30',
    chip: 'bg-tangerine-500/15 text-tangerine-300',
    glow: 'from-tangerine-500/20 to-surface',
    accent: 'text-tangerine-300',
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


/**
 * Whether to offer Sign in with Apple next to email.
 *
 * Mirrors APPLE_WEB_ENABLED in the environment: the provider is only
 * configured in GoTrue when the flag is on, so offering the button
 * otherwise would send people to a dead end.
 */
export const APPLE_SIGN_IN_ENABLED =
  process.env.NEXT_PUBLIC_APPLE_ENABLED === 'true'
export const ANY_OAUTH_ENABLED = APPLE_SIGN_IN_ENABLED
