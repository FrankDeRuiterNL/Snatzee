'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Search, UserPlus, UserX, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { InviteOutsider } from '@/components/friends/invite-outsider'
import { ListSkeleton } from '@/components/ui/skeleton'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/utils'
import type { SearchUserRow } from '@/types/database'
import { pingNotificationDrain } from '@/lib/push'

type Tab = 'friends' | 'requests' | 'search'

export interface FriendSummary {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  games_played: number
}

export interface RequestSummary extends FriendSummary {
  friendship_id: string
}

export function FriendsView({
  friends,
  requests,
  sent,
  username,
  initialTab = 'friends',
}: {
  friends: FriendSummary[]
  requests: RequestSummary[]
  /** Requests this user sent that have not been answered yet. */
  sent: RequestSummary[]
  /** The signed-in user's own username, used to sign the invite. */
  username: string
  initialTab?: Tab
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<FriendSummary | null>(null)
  const [withdrawing, setWithdrawing] = useState<RequestSummary | null>(null)

  // Search results carry the query they belong to, so "loading" is derived and
  // the effect only ever writes state after the request resolves.
  const [search, setSearch] = useState<{ query: string; rows: SearchUserRow[] } | null>(null)

  const trimmedQuery = query.trim()

  useEffect(() => {
    if (tab !== 'search' || trimmedQuery.length < 2) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.rpc('search_users', { p_query: trimmedQuery, p_limit: 20 })
      if (!cancelled) setSearch({ query: trimmedQuery, rows: (data as SearchUserRow[] | null) ?? [] })
    }, 320)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [trimmedQuery, tab])

  const results = search?.query === trimmedQuery ? search.rows : null

  const sendRequest = useCallback(
    async (userId: string, displayName: string) => {
      if (busyId) return
      setBusyId(userId)

      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.rpc('send_friend_request', { p_user_id: userId })
      setBusyId(null)

      if (error) {
        toast.error('Verzoek versturen is niet gelukt', { description: error.message })
        return
      }

      haptic('success')
      pingNotificationDrain()
      toast.success('Vriendverzoek verzonden', { description: `Naar ${displayName}` })
      setSearch((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === userId
                  ? { ...r, friendship_status: 'pending' as const, is_incoming: false }
                  : r,
              ),
            }
          : prev,
      )
      router.refresh()
    },
    [busyId, router],
  )

  const respond = useCallback(
    async (friendshipId: string, accept: boolean) => {
      if (busyId) return
      setBusyId(friendshipId)

      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.rpc('respond_friend_request', {
        p_id: friendshipId,
        p_accept: accept,
      })
      setBusyId(null)

      if (error) {
        toast.error('Er ging iets mis', { description: error.message })
        return
      }

      haptic(accept ? 'success' : 'light')
      toast.success(accept ? 'Jullie zijn nu vrienden 🎉' : 'Verzoek geweigerd')
      router.refresh()
    },
    [busyId, router],
  )

  /**
   * Withdraws a request this user sent.
   *
   * remove_friend deletes the row whichever direction it points in, so a
   * pending outgoing request needs no separate RPC.
   */
  async function withdrawRequest() {
    if (!withdrawing) return
    const target = withdrawing
    setWithdrawing(null)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('remove_friend', { p_user_id: target.id })

    if (error) {
      toast.error('Intrekken is niet gelukt', { description: error.message })
      return
    }

    haptic('light')
    toast.success(`Verzoek aan ${target.display_name} ingetrokken`)
    router.refresh()
  }

  async function removeFriend() {
    if (!removing) return
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('remove_friend', { p_user_id: removing.id })

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }
    toast.success('Vriend verwijderd')
    setRemoving(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="px-5">
        <Segmented
          ariaLabel="Vrienden weergave"
          layoutId="friends-tab"
          options={[
            { key: 'friends', label: `Vrienden${friends.length ? ` (${friends.length})` : ''}` },
            { key: 'requests', label: `Verzoeken${requests.length ? ` (${requests.length})` : ''}` },
            { key: 'search', label: 'Zoeken' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'friends' && (
        <div className="px-5">
          {friends.length === 0 ? (
            <EmptyState
              emoji="🤝"
              title="Nog geen vrienden"
              description="Zoek je medespelers op username en stuur ze een vriendverzoek."
              action={
                <Button full onClick={() => setTab('search')}>
                  <Search className="size-4" aria-hidden />
                  Spelers zoeken
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <PersonRow
                    person={friend}
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${friend.display_name} verwijderen als vriend`}
                        onClick={(event) => {
                          event.preventDefault()
                          setRemoving(friend)
                        }}
                      >
                        <UserX className="size-5 text-ink-muted" aria-hidden />
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-6 px-5">
          {requests.length === 0 && sent.length === 0 ? (
            <EmptyState
              emoji="📭"
              title="Geen openstaande verzoeken"
              description="Verzoeken die je krijgt én verstuurt verschijnen hier."
            />
          ) : (
            <>
          {requests.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-muted">
              Ontvangen
            </h2>
            <ul className="space-y-2">
              {requests.map((request) => (
                <li key={request.friendship_id}>
                  <PersonRow
                    person={request}
                    action={
                      <span className="flex gap-2">
                        <Button
                          size="icon"
                          aria-label={`Verzoek van ${request.display_name} accepteren`}
                          loading={busyId === request.friendship_id}
                          onClick={(event) => {
                            event.preventDefault()
                            void respond(request.friendship_id, true)
                          }}
                        >
                          <Check className="size-5" aria-hidden />
                        </Button>
                        <Button
                          variant="soft"
                          size="icon"
                          aria-label={`Verzoek van ${request.display_name} weigeren`}
                          onClick={(event) => {
                            event.preventDefault()
                            void respond(request.friendship_id, false)
                          }}
                        >
                          <X className="size-5 text-ink-muted" aria-hidden />
                        </Button>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
          )}

          {sent.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-muted">
                Verzonden
              </h2>
              <p className="mb-2 text-sm text-ink-muted">
                Deze spelers hebben nog niet gereageerd.
              </p>
              <ul className="space-y-2">
                {sent.map((request) => (
                  <li key={request.friendship_id}>
                    <PersonRow
                      person={request}
                      action={
                        <Button
                          variant="soft"
                          size="sm"
                          aria-label={`Verzoek aan ${request.display_name} intrekken`}
                          onClick={(event) => {
                            event.preventDefault()
                            setWithdrawing(request)
                          }}
                        >
                          Intrekken
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
            </>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div className="space-y-4 px-5">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            {/*
              iOS decides a field is a login box from its name, id and
              placeholder, and the placeholder here used to say "username" —
              which is why Safari offered to fill in a Keychain account.
              A neutral name, autoComplete off and a placeholder without
              credential words keep it a search box. The data- attributes do
              the same for 1Password and LastPass.
            */}
            <Input
              type="search"
              name="speler-zoeken"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek een speler"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              aria-label="Spelers zoeken"
              aria-autocomplete="none"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="pl-12"
            />
          </div>

          {trimmedQuery.length < 2 ? (
            <EmptyState
              emoji="🔍"
              title="Zoek een medespeler"
              description="Typ minimaal twee tekens van een username of naam."
            />
          ) : results === null ? (
            <ListSkeleton rows={3} />
          ) : results.length === 0 ? (
            <EmptyState
              emoji="🤷"
              title="Niemand gevonden"
              description={`Geen speler gevonden voor "${trimmedQuery}".`}
            />
          ) : (
            <ul className="space-y-2">
              {results.map((result) => (
                <li key={result.id}>
                  <PersonRow
                    person={{
                      id: result.id,
                      username: result.username,
                      display_name: result.display_name,
                      avatar_url: result.avatar_url,
                      games_played: result.games_played,
                    }}
                    action={
                      result.friendship_status === 'accepted' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-mint-500/15 px-3 py-1.5 text-xs font-bold text-mint-300">
                          <Check className="size-3.5" aria-hidden strokeWidth={3} />
                          Vrienden
                        </span>
                      ) : result.friendship_status === 'pending' && result.is_incoming ? (
                        <Button
                          size="sm"
                          loading={busyId === result.friendship_id}
                          onClick={(event) => {
                            event.preventDefault()
                            if (result.friendship_id) void respond(result.friendship_id, true)
                          }}
                        >
                          Accepteren
                        </Button>
                      ) : result.friendship_status === 'pending' ? (
                        <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-ink-muted">
                          Verzonden
                        </span>
                      ) : (
                        <Button
                          size="icon"
                          aria-label={`${result.display_name} toevoegen als vriend`}
                          loading={busyId === result.id}
                          onClick={(event) => {
                            event.preventDefault()
                            void sendRequest(result.id, result.display_name)
                          }}
                        >
                          <UserPlus className="size-5" aria-hidden />
                        </Button>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Always here, whatever the search turned up: the person you
              are looking for may simply not have an account yet. */}
          <InviteOutsider username={username} />
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Vriend verwijderen?"
        description={
          removing
            ? `${removing.display_name} verdwijnt uit je vriendenlijst en uit je vrienden-ranglijsten.`
            : undefined
        }
        confirmLabel="Verwijderen"
        destructive
        onConfirm={removeFriend}
      />

      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        title="Verzoek intrekken?"
        description={
          withdrawing
            ? `${withdrawing.display_name} ziet je vriendverzoek dan niet meer. Je kunt er later opnieuw een sturen.`
            : undefined
        }
        confirmLabel="Intrekken"
        destructive
        onConfirm={withdrawRequest}
      />
    </div>
  )
}

function PersonRow({
  person,
  action,
}: {
  person: FriendSummary
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-[1.5rem] bg-surface p-3 pr-3 ring-1 ring-hairline shadow-soft">
      <Link href={`/u/${person.username}`} className="press flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={person.avatar_url} name={person.display_name} size="md" />
        <span className="min-w-0">
          <span className="block truncate font-bold tracking-tight text-ink">
            {person.display_name}
          </span>
          <span className="block truncate text-xs text-ink-muted">
            @{person.username} · {person.games_played}{' '}
            {pluralize(person.games_played, 'potje', 'potjes')}
          </span>
        </span>
      </Link>
      {action}
    </div>
  )
}
