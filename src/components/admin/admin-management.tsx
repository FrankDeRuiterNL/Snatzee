'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Search, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/skeleton'
import { AdminPanel } from '@/components/profile/admin-panel'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import type { AdminUser, AppRole } from '@/types/database'

/**
 * The Beheer tab: the app-wide settings that used to sit in a card on the
 * Instellingen page, plus the per-player achievement reset.
 *
 * They live here because both are admin work, and a normal user should
 * never see either — this whole console is behind /app/admin, which turns
 * anyone else away.
 */
export function AdminManagement({
  role,
  settings,
}: {
  role: AppRole
  settings: Record<string, number>
}) {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState(0)
  const [resetting, setResetting] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowserClient()

    void supabase
      .rpc('admin_list_users', { p_search: null })
      .then((response: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return
        if (response.error) {
          toast.error('Spelers laden is niet gelukt', { description: response.error.message })
          setUsers([])
          return
        }
        setUsers((response.data ?? []) as AdminUser[])
      })

    return () => {
      cancelled = true
    }
    // `version` re-reads the list after a reset, so the counts stay honest.
  }, [version])

  const visible = useMemo(() => {
    if (!users) return null
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    )
  }, [users, query])

  const confirmReset = useCallback(async () => {
    if (!resetting) return
    const target = resetting
    setResetting(null)
    setBusy(true)

    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.rpc('admin_reset_user_achievements', {
      p_user_id: target.user_id,
    })
    setBusy(false)

    if (error) {
      toast.error('Resetten is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    toast.success(`${data ?? 0} achievements gewist bij ${target.display_name}`)
    setVersion((v) => v + 1)
    router.refresh()
  }, [resetting, router])

  return (
    <div className="space-y-6 px-5">
      <AdminPanel role={role} settings={settings} />

      <section>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mint-400">
          <Trophy className="size-4" aria-hidden strokeWidth={2.4} />
          Achievements resetten
        </h2>
        <p className="mb-4 text-sm text-ink-muted">
          Wist de behaalde achievements van één speler. Scores blijven staan, dus alles waar de
          speler nog aan voldoet wordt opnieuw toegekend zodra er weer iets geregistreerd wordt.
        </p>

        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op naam of username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Spelers zoeken"
            className="pl-12"
          />
        </div>

        {visible === null ? (
          <ListSkeleton rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState emoji="🔍" title="Geen spelers gevonden" />
        ) : (
          <ul className="space-y-2">
            {visible.map((user) => (
              <li
                key={user.user_id}
                className="card-surface flex items-center gap-3 rounded-2xl p-3"
              >
                <Avatar src={user.avatar_url} name={user.display_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {user.display_name}
                  </span>
                  <span className="block truncate text-sm text-ink-muted">
                    @{user.username} · {user.achievement_count}{' '}
                    {user.achievement_count === 1 ? 'achievement' : 'achievements'}
                  </span>
                </span>
                <Button
                  variant="dangerSoft"
                  size="sm"
                  disabled={busy || user.achievement_count === 0}
                  onClick={() => {
                    haptic('light')
                    setResetting(user)
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                  Reset
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={resetting !== null}
        onOpenChange={(open) => !open && setResetting(null)}
        title="Achievements resetten?"
        description={
          resetting
            ? `Alle ${resetting.achievement_count} achievements van ${resetting.display_name} worden gewist. Scores blijven staan.`
            : ''
        }
        confirmLabel="Resetten"
        onConfirm={confirmReset}
      />
    </div>
  )
}
