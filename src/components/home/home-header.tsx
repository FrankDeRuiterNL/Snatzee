import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { LevelChip } from '@/components/profile/level-badge'
import { firstName } from '@/lib/utils'

export function HomeHeader({
  displayName,
  username,
  avatarUrl,
  levelEmoji,
  levelName,
}: {
  displayName: string
  username: string
  avatarUrl: string | null
  levelEmoji?: string | null
  levelName?: string | null
}) {
  return (
    <header
      className="flex items-center gap-3 px-5 pb-6"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
    >
      <Link href="/app/profile" aria-label="Naar je profiel" className="press shrink-0">
        <Avatar src={avatarUrl} name={displayName} size="md" className="shadow-soft" />
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-extrabold tracking-tight text-ink">
          Hey, {firstName(displayName)} 👋
        </p>
        {levelName ? (
          <LevelChip emoji={levelEmoji ?? null} name={levelName} className="mt-1" />
        ) : (
          <p className="truncate text-sm text-ink-muted">@{username}</p>
        )}
      </div>

      <Link
        href="/app/settings"
        aria-label="Instellingen"
        className="press grid size-11 shrink-0 place-items-center rounded-full bg-surface text-ink-soft ring-1 ring-hairline shadow-soft"
      >
        <Settings className="size-5" aria-hidden />
      </Link>
    </header>
  )
}
