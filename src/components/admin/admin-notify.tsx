'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Search, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import type { NotifiableUser } from '@/types/database'

/**
 * Send a notification to everyone, or to a hand-picked few.
 *
 * The picker lists every player, not only the reachable ones, because
 * "why didn't Bob get it" is a question worth answering in the UI: people
 * without notifications on are shown greyed out and are never counted
 * towards the send.
 */

const TITLE_MAX = 80
const BODY_MAX = 300

type Audience = 'all' | 'selected'

export function AdminNotify() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<NotifiableUser[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowserClient()

    void supabase
      .rpc('admin_list_notifiable_users', { p_search: null })
      .then((response: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return
        if (response.error) {
          setError(response.error.message)
          setUsers([])
          return
        }
        setUsers((response.data ?? []) as NotifiableUser[])
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Filtering in the browser keeps typing instant; this list is the size
  // of a friend group, not a user base.
  const visible = useMemo(() => {
    if (!users) return null
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
    )
  }, [users, query])

  const reachable = useMemo(() => users?.filter((u) => u.has_push) ?? [], [users])

  const selectedReachable = useMemo(
    () => selected.filter((id) => reachable.some((u) => u.user_id === id)),
    [selected, reachable],
  )

  const recipientCount = audience === 'all' ? reachable.length : selectedReachable.length

  const toggle = useCallback((userId: string) => {
    haptic('light')
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }, [])

  const validate = useCallback(() => {
    if (title.trim().length === 0) return 'Vul een titel in'
    if (body.trim().length === 0) return 'Vul een tekst in'
    if (audience === 'selected' && selectedReachable.length === 0) {
      return 'Kies minstens één speler met meldingen aan'
    }
    if (recipientCount === 0) return 'Er is niemand met meldingen aan'
    return null
  }, [title, body, audience, selectedReachable, recipientCount])

  function review() {
    const message = validate()
    setError(message)
    if (message) return
    haptic('light')
    setConfirmOpen(true)
  }

  async function send() {
    setConfirmOpen(false)
    setSending(true)

    try {
      const response = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          userIds: audience === 'selected' ? selectedReachable : undefined,
        }),
      })

      const result = (await response.json()) as { sent?: number; error?: string }

      if (!response.ok) {
        toast.error(result.error ?? 'Versturen is niet gelukt')
        return
      }

      haptic('success')
      toast.success(
        `Verstuurd naar ${result.sent ?? 0} ${result.sent === 1 ? 'speler' : 'spelers'}`,
      )
      setTitle('')
      setBody('')
      setSelected([])
      setError(null)
    } catch {
      toast.error('Versturen is niet gelukt')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5 px-5">
      <div className="card-surface rounded-3xl p-4">
        <Label htmlFor="notify-title">Titel</Label>
        <Input
          id="notify-title"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Toernooi zaterdag"
          maxLength={TITLE_MAX}
        />
        <p className="mt-1 text-right text-xs text-ink-muted">
          {title.length}/{TITLE_MAX}
        </p>

        <Label htmlFor="notify-body" className="mt-3">
          Tekst
        </Label>
        <Textarea
          id="notify-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          placeholder="Om 20:00 bij Frank. Neem je dobbelstenen mee!"
          maxLength={BODY_MAX}
        />
        <p className="mt-1 text-right text-xs text-ink-muted">
          {body.length}/{BODY_MAX}
        </p>
      </div>

      <Segmented
        ariaLabel="Ontvangers"
        layoutId="notify-audience"
        options={[
          { key: 'all', label: 'Iedereen' },
          { key: 'selected', label: 'Selectie' },
        ]}
        value={audience}
        onChange={(next) => setAudience(next as Audience)}
      />

      {audience === 'selected' && (
        <div className="space-y-2">
          <div className="relative">
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
            <EmptyState emoji="🔕" title="Geen spelers gevonden" />
          ) : (
            <ul className="space-y-2">
              {visible.map((user) => {
                const isSelected = selected.includes(user.user_id)
                return (
                  <li key={user.user_id}>
                    <button
                      type="button"
                      onClick={() => user.has_push && toggle(user.user_id)}
                      disabled={!user.has_push}
                      aria-pressed={isSelected}
                      className={`press flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition ${
                        isSelected
                          ? 'bg-mint-500/10 ring-mint-500/40'
                          : 'card-surface ring-hairline'
                      } ${user.has_push ? '' : 'opacity-45'}`}
                    >
                      <Avatar
                        src={user.avatar_url}
                        name={user.display_name}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">
                          {user.display_name}
                        </span>
                        <span className="block truncate text-sm text-ink-muted">
                          {user.has_push ? `@${user.username}` : 'Meldingen staan uit'}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`grid size-6 shrink-0 place-items-center rounded-full ${
                          isSelected ? 'bg-mint-500 text-navy-950' : 'ring-1 ring-hairline'
                        }`}
                      >
                        {isSelected && <Check className="size-4" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <FieldError>{error}</FieldError>

      <Button full size="lg" loading={sending} onClick={review}>
        <Send className="size-5" aria-hidden />
        {recipientCount > 0
          ? `Stuur naar ${recipientCount} ${recipientCount === 1 ? 'speler' : 'spelers'}`
          : 'Stuur melding'}
      </Button>

      <p className="pb-2 text-center text-sm text-ink-muted">
        Alleen spelers met meldingen aan ontvangen iets. Elke verzending komt in het auditlog.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Melding versturen?"
        description={`"${title.trim()}" gaat naar ${recipientCount} ${
          recipientCount === 1 ? 'speler' : 'spelers'
        }. Dit kan niet ongedaan gemaakt worden.`}
        confirmLabel="Versturen"
        onConfirm={send}
      />
    </div>
  )
}
