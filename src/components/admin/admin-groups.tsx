'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Search, Trash2, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BottomSheet } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/skeleton'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatNumber, formatPlayedAt } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import type { AdminGroupRow, AdminGroupSort } from '@/types/database'

/**
 * Every group on the instance, including the ones the admin is not in.
 *
 * Groups are member-only under RLS, so this goes through a SECURITY
 * DEFINER function that checks is_superadmin() itself — the tab is a
 * convenience, the database is the boundary.
 */

const PAGE_SIZE = 25

const SORTS: { key: AdminGroupSort; label: string }[] = [
  { key: 'newest', label: 'Nieuwste' },
  { key: 'oldest', label: 'Oudste' },
  { key: 'largest', label: 'Meeste leden' },
  { key: 'smallest', label: 'Minste leden' },
]

export function AdminGroups({ onChanged }: { onChanged: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [sortOpen, setSortOpen] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  // Search, sort and page move together: changing either of the first two
  // must return to page 0, and doing that in one update avoids a second
  // render that would fetch the old page first.
  const [view, setView] = useState<{ search: string; sort: AdminGroupSort; page: number }>({
    search: '',
    sort: 'newest',
    page: 0,
  })
  const { search: debounced, sort, page } = view
  const [deleting, setDeleting] = useState<AdminGroupRow | null>(null)

  // Tagged with the query it belongs to, so a late response for an old
  // search can never overwrite a newer one.
  const [result, setResult] = useState<{
    key: string
    rows: AdminGroupRow[]
    total: number
  } | null>(null)

  useEffect(() => {
    const next = query.trim()
    const timer = setTimeout(
      () => setView((v) => (v.search === next ? v : { ...v, search: next, page: 0 })),
      320,
    )
    return () => clearTimeout(timer)
  }, [query])

  const key = `${debounced}|${sort}|${page}`

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseBrowserClient()

    void supabase
      .rpc('admin_list_groups', {
        p_search: debounced || null,
        p_sort: sort,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      .then((response: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return
        setLoadingMore(false)
        if (response.error) {
          toast.error('Groepen laden is niet gelukt', { description: response.error.message })
          setResult({ key, rows: [], total: 0 })
          return
        }
        const rows = (response.data ?? []) as AdminGroupRow[]
        setResult((prev) => ({
          key,
          // Page 0 replaces; later pages append to what is already shown.
          rows: page === 0 ? rows : [...(prev?.rows ?? []), ...rows],
          total: Number(rows[0]?.total_count ?? (page === 0 ? 0 : (prev?.total ?? 0))),
        }))
      })

    return () => {
      cancelled = true
    }
  }, [debounced, sort, page, key])

  // A stale key means the result belongs to a previous query: show the
  // skeleton rather than rows that do not match what was typed.
  const rows = result && result.key.startsWith(`${debounced}|${sort}|`) ? result.rows : null
  const total = result?.total ?? 0
  const hasMore = rows !== null && rows.length < total

  const confirmDelete = useCallback(async () => {
    if (!deleting) return
    const target = deleting
    setDeleting(null)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('admin_delete_group', { p_id: target.id })

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    toast.success(`${target.name} verwijderd`)
    setResult((prev) =>
      prev
        ? { ...prev, rows: prev.rows.filter((r) => r.id !== target.id), total: Math.max(0, prev.total - 1) }
        : prev,
    )
    onChanged()
    router.refresh()
  }, [deleting, onChanged, router])

  const sortLabel = useMemo(() => SORTS.find((s) => s.key === sort)?.label ?? '', [sort])

  return (
    <>
      <div className="flex items-center gap-2 px-5">
        <div className="relative flex-1">
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
            placeholder="Zoek op groep, code of eigenaar"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Groepen zoeken"
            className="pl-12"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            haptic('light')
            setSortOpen(true)
          }}
          aria-label={`Sorteren: ${sortLabel}`}
          className="press grid size-12 shrink-0 place-items-center rounded-full bg-surface text-ink-soft ring-1 ring-hairline"
        >
          <ArrowUpDown className="size-5" aria-hidden />
        </button>
      </div>

      <div className="space-y-2 px-5">
        {rows === null ? (
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            emoji="👥"
            title="Geen groepen gevonden"
            description={debounced ? 'Probeer een andere zoekterm.' : 'Er zijn nog geen groepen.'}
          />
        ) : (
          rows.map((group, index) => (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
              className="card-surface flex items-center gap-3 rounded-[1.5rem] p-4"
            >
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-2xl bg-canvas text-2xl"
              >
                {group.emoji ?? '🎲'}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold tracking-tight text-ink">{group.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {group.owner_username ? `@${group.owner_username}` : 'geen eigenaar'} ·{' '}
                  {formatPlayedAt(group.created_at)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs font-semibold text-ink">
                    <Users className="size-3" aria-hidden />
                    {group.member_count}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-xs text-ink-muted">
                    {group.invite_code}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                aria-label={`Groep ${group.name} verwijderen`}
                onClick={() => {
                  haptic('light')
                  setDeleting(group)
                }}
                className="shrink-0 text-rose-ember-300"
              >
                <Trash2 className="size-5" aria-hidden />
              </Button>
            </motion.div>
          ))
        )}

        {hasMore && (
          <Button
            variant="soft"
            full
            loading={loadingMore}
            className="mt-2"
            onClick={() => {
              setLoadingMore(true)
              setView((v) => ({ ...v, page: v.page + 1 }))
            }}
          >
            Meer laden ({formatNumber(total - (rows?.length ?? 0))} resterend)
          </Button>
        )}
      </div>

      <BottomSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="Sorteren"
        description="Kies de volgorde van de lijst."
      >
        <div className="space-y-2 pb-4">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                haptic('light')
                setView((v) => ({ ...v, sort: option.key, page: 0 }))
                setSortOpen(false)
              }}
              aria-pressed={sort === option.key}
              className={`press flex min-h-14 w-full items-center rounded-2xl px-4 text-left font-semibold ring-1 ${
                sort === option.key
                  ? 'bg-mint-500 text-navy-950 ring-mint-500'
                  : 'bg-surface text-ink ring-hairline'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Groep verwijderen?"
        description={
          deleting
            ? `${deleting.name} wordt verwijderd, samen met de ${deleting.member_count} ${
                deleting.member_count === 1 ? 'koppeling' : 'koppelingen'
              } van de leden. Scores van de leden blijven staan. Dit kan niet ongedaan gemaakt worden.`
            : ''
        }
        confirmLabel="Verwijderen"
        onConfirm={confirmDelete}
      />
    </>
  )
}
