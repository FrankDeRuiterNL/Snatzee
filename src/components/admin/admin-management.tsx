'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { BottomSheet } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/skeleton'
import { AdminPanel } from '@/components/profile/admin-panel'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import type { AdminUser, AppRole } from '@/types/database'

/**
 * The Beheer tab: the app-wide settings that used to sit in a card on the
 * Instellingen page, plus the player list with the per-player achievement
 * reset and account deletion.
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
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowserClient()

    void supabase
      // Half-registered accounts too: those are exactly the ones an admin
      // may want to clean up.
      .rpc('admin_list_users', { p_search: null, p_include_incomplete: true })
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
          <Users className="size-4" aria-hidden strokeWidth={2.4} />
          Spelers
        </h2>
        <p className="mb-4 text-sm text-ink-muted">
          <RotateCcw className="inline size-3.5 align-[-2px]" aria-label="Resetten" /> wist de behaalde
          achievements van één speler; scores blijven staan, dus alles waar de speler nog aan
          voldoet komt terug zodra er weer iets geregistreerd wordt.{' '}
          <Trash2 className="inline size-3.5 align-[-2px]" aria-label="Verwijderen" /> wist het hele
          account met alle potjes, vriendschappen en groepslidmaatschappen.
        </p>

        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <Input
            type="search"
            name="admin-zoeken"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een speler"
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
                  <span className="block truncate text-sm text-ink-muted">@{user.username}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {user.games_played} {user.games_played === 1 ? 'potje' : 'potjes'} ·{' '}
                    {user.achievement_count}{' '}
                    {user.achievement_count === 1 ? 'achievement' : 'achievements'}
                  </span>
                  {(user.role !== 'user' || !user.onboarding_completed) && (
                    <span className="mt-1 flex gap-1.5">
                      {user.role !== 'user' && (
                        <span className="rounded-full bg-tangerine-500/15 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-tangerine-300">
                          {user.role}
                        </span>
                      )}
                      {!user.onboarding_completed && (
                        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-ink-muted">
                          Registratie niet afgerond
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <Button
                  variant="soft"
                  size="icon"
                  disabled={busy || user.achievement_count === 0}
                  aria-label={`Achievements van ${user.display_name} resetten`}
                  title="Achievements resetten"
                  onClick={() => {
                    haptic('light')
                    setResetting(user)
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="dangerSoft"
                  size="icon"
                  disabled={busy || user.role === 'superadmin'}
                  aria-label={`${user.display_name} verwijderen`}
                  title={
                    user.role === 'superadmin'
                      ? 'Een superadmin kun je niet verwijderen'
                      : 'Account verwijderen'
                  }
                  onClick={() => {
                    haptic('light')
                    setDeleting(user)
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeleteUserSheet
        user={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null)
          setVersion((v) => v + 1)
          router.refresh()
        }}
      />

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

/**
 * Deleting an account: typed confirmation, because it cannot be undone.
 * The reason ends up in the audit log.
 */
function DeleteUserSheet({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Emptied on the way out, so the next player starts with a fresh form.
  function reset() {
    setConfirmation('')
    setReason('')
    setError(null)
  }

  const matches = user !== null && confirmation.trim().toLowerCase() === user.username.toLowerCase()

  async function remove() {
    if (!user || !matches || pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.user_id, reason: reason.trim() || undefined }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(body.error ?? 'Verwijderen is niet gelukt')
        return
      }
      haptic('success')
      toast.success(`Account van ${user.display_name} verwijderd`)
      reset()
      onDeleted()
    } catch {
      setError('Geen verbinding met de server')
    } finally {
      setPending(false)
    }
  }

  return (
    <BottomSheet
      open={user !== null}
      onOpenChange={(open) => {
        if (open || pending) return
        reset()
        onClose()
      }}
      title="Account verwijderen"
      description={
        user
          ? `${user.display_name} (@${user.username}) wordt definitief gewist${
              user.games_played > 0
                ? `, met ${user.games_played} ${user.games_played === 1 ? 'potje' : 'potjes'}`
                : ''
            }, samen met vriendschappen en groepslidmaatschappen.`
          : undefined
      }
      footer={
        <Button
          variant="danger"
          full
          size="lg"
          loading={pending}
          disabled={!matches || pending}
          onClick={remove}
        >
          <Trash2 className="size-5" aria-hidden />
          Definitief verwijderen
        </Button>
      }
    >
      {user && (
        <div className="space-y-5 pb-2">
          <div>
            <Label htmlFor="delete-user-reason">
              Reden <span className="font-normal text-ink-muted">(optioneel, voor het auditlog)</span>
            </Label>
            <Textarea
              id="delete-user-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Bijv. aanstootgevende naam na melding"
            />
          </div>
          <div>
            <Label htmlFor="delete-user-confirm">
              Typ <span className="font-bold text-ink">{user.username}</span> om te bevestigen
            </Label>
            <Input
              id="delete-user-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
            />
            <FieldError>{error}</FieldError>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Logde deze speler in met Apple, dan blijft Snatzee in hun Apple ID-instellingen staan
            tot ze het daar zelf verbreken; Apple staat intrekken alleen toe met hun eigen
            toestemming.
          </p>
        </div>
      )}
    </BottomSheet>
  )
}
