'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Home, Plus, Trophy, User, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import { useQuickActions } from '@/components/layout/quick-actions-provider'

const TABS = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/rankings', label: 'Ranking', icon: Trophy, exact: false },
  { href: '/app/friends', label: 'Vrienden', icon: Users, exact: false },
  { href: '/app/profile', label: 'Profiel', icon: User, exact: false },
] as const

/** Past this the badge would outgrow the icon it sits on. */
const BADGE_MAX = 9

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Floating bottom navigation. Sits above the iPhone home indicator and keeps
 * the primary "add a game" action in the centre, raised above the bar.
 */
export function BottomNavigation({ friendRequests = 0 }: { friendRequests?: number }) {
  const pathname = usePathname()
  const { openScoreSheet } = useQuickActions()

  const left = TABS.slice(0, 2)
  const right = TABS.slice(2)

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <div className="relative flex w-full max-w-[26rem] items-center justify-between rounded-[1.75rem] bg-surface-elevated/90 px-2 py-2 shadow-float ring-1 ring-hairline-strong backdrop-blur-xl">
        {left.map((tab) => (
          <NavItem key={tab.href} {...tab} active={isActive(pathname, tab.href, tab.exact)} />
        ))}

        <button
          type="button"
          onClick={() => {
            haptic('medium')
            openScoreSheet()
          }}
          aria-label="Potje toevoegen"
          className="press -mt-8 grid size-14 shrink-0 place-items-center rounded-full bg-mint-500 text-navy-950 shadow-[0_8px_24px_-6px_rgba(36,199,154,0.6)] ring-4 ring-canvas"
        >
          <Plus className="size-7" strokeWidth={2.75} aria-hidden />
        </button>

        {right.map((tab) => (
          <NavItem
            key={tab.href}
            {...tab}
            active={isActive(pathname, tab.href, tab.exact)}
            badge={tab.href === '/app/friends' ? friendRequests : 0}
          />
        ))}
      </div>
    </nav>
  )
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  href: string
  label: string
  icon: typeof Home
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      // The count belongs in the label, not only in the dot: a badge that
      // is purely visual tells a screen reader nothing.
      aria-label={
        badge > 0
          ? `${label}, ${badge} open ${badge === 1 ? 'verzoek' : 'verzoeken'}`
          : label
      }
      aria-current={active ? 'page' : undefined}
      onClick={() => haptic('light')}
      className="press relative flex min-h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl"
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          className="absolute inset-0 rounded-2xl bg-white/10"
          aria-hidden
        />
      )}
      <span className="relative">
        <Icon
          className={cn('size-5 transition-colors', active ? 'text-mint-400' : 'text-ink-muted')}
          strokeWidth={active ? 2.6 : 2}
          aria-hidden
        />
        {badge > 0 && (
          <span
            aria-hidden
            className="absolute -right-2 -top-1.5 grid min-w-[1.05rem] place-items-center rounded-full bg-rose-ember-500 px-1 text-[0.625rem] font-bold leading-[1.05rem] text-white ring-2 ring-surface-elevated"
          >
            {badge > BADGE_MAX ? `${BADGE_MAX}+` : badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          'relative text-[0.625rem] font-semibold transition-colors',
          active ? 'text-white' : 'text-ink-muted',
        )}
      >
        {label}
      </span>
    </Link>
  )
}
