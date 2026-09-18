import { Avatar } from '@/components/ui/avatar'
import { formatNumber } from '@/lib/utils'
import type { UserStatistics } from '@/types/database'

/** Big navy profile card with the four headline numbers. */
export function ProfileHeader({
  displayName,
  username,
  avatarUrl,
  bio,
  stats,
  action,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  bio?: string | null
  stats: UserStatistics | null
  action?: React.ReactNode
}) {
  const average = stats?.average_score ?? null

  return (
    <section className="mx-5 rounded-[1.75rem] bg-navy-900 p-6 text-white shadow-lift">
      <div className="flex flex-col items-center text-center">
        <Avatar src={avatarUrl} name={displayName} size="xl" className="ring-4 ring-white/10" />
        <h1 className="mt-4 text-2xl font-black tracking-tight">{displayName}</h1>
        <p className="mt-0.5 text-sm font-medium text-navy-300">@{username}</p>
        {bio && <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-navy-100">{bio}</p>}
        {action && <div className="mt-5 w-full max-w-64">{action}</div>}
      </div>

      <dl className="mt-6 grid grid-cols-4 gap-2 text-center">
        <Stat label="Potjes" value={formatNumber(stats?.games_played ?? 0)} />
        <Stat label="Wins" value={formatNumber(stats?.wins ?? 0)} />
        <Stat
          label="Gem."
          value={average === null ? '—' : formatNumber(average, average % 1 === 0 ? 0 : 1)}
        />
        <Stat
          label="Record"
          value={stats?.highest_score === null || stats === null ? '—' : formatNumber(stats.highest_score)}
        />
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <YahtzeeStat
          emoji="🎲"
          label="Yahtzee's"
          value={formatNumber(stats?.yahtzee_count ?? 0)}
        />
        <YahtzeeStat
          emoji="⚡"
          label="In één worp"
          value={formatNumber(stats?.first_roll_yahtzee_count ?? 0)}
        />
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 py-3">
      <dd className="tabular text-lg font-extrabold">{value}</dd>
      <dt className="mt-0.5 text-[0.65rem] font-semibold text-navy-300">{label}</dt>
    </div>
  )
}

function YahtzeeStat({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
      <span aria-hidden className="text-xl">
        {emoji}
      </span>
      <span className="min-w-0">
        <dd className="tabular text-lg font-extrabold leading-none">{value}</dd>
        <dt className="mt-1 text-[0.65rem] font-semibold text-navy-300">{label}</dt>
      </span>
    </div>
  )
}
