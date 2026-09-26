'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpDown, Search, Trash2, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChipScroller } from '@/components/ui/segmented'
import { BottomSheet } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminNotify } from '@/components/admin/admin-notify'
import { AdminManagement } from '@/components/admin/admin-management'
import { AdminGroups } from '@/components/admin/admin-groups'
import { AdminReports } from '@/components/admin/admin-reports'
import { ListSkeleton } from '@/components/ui/skeleton'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatNumber, formatPlayedAt, formatTime } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import type {
  AppRole,
  AdminCounts,
  AdminFirstRollRow,
  AdminScoreRow,
  AdminScoreSort,
} from '@/types/database'

type Tab = 'scores' | 'first-roll' | 'groups' | 'reports' | 'notify' | 'manage'

const PAGE_SIZE = 25

const SORTS: { key: AdminScoreSort; label: string }[] = [
  { key: 'newest', label: 'Nieuwste' },
  { key: 'oldest', label: 'Oudste' },
  { key: 'highest', label: 'Hoogste score' },
  { key: 'lowest', label: 'Laagste score' },
]

export function AdminConsole({
  role,
  settings,
}: {
  role: AppRole
  settings: Record<string, number>
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('scores')
  const [counts, setCounts] = useState<AdminCounts | null>(null)
  const [countsVersion, setCountsVersion] = useState(0)

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<AdminScoreSort>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [deletingScore, setDeletingScore] = useState<AdminScoreRow | null>(null)
  const [deletingRoll, setDeletingRoll] = useState<AdminFirstRollRow | null>(null)

  /**
   * Results carry the query they belong to, so "still loading" and "reset to
   * page one" are both derived rather than written from inside an effect.
   */
  const [result, setResult] = useState<{
    key: string
    scores: AdminScoreRow[]
    firstRolls: AdminFirstRollRow[]
    page: number
  } | null>(null)

  const queryKey = `${tab}|${debounced}|${sort}`

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 320)
    return () => clearTimeout(timer)
  }, [query])

  const fetchPage = useCallback(
    async (targetTab: Tab, search: string, order: AdminScoreSort, targetPage: number) => {
      const supabase = getSupabaseBrowserClient()

      if (targetTab === 'scores') {
        const { data, error } = await supabase.rpc('admin_list_score_entries', {
          p_search: search || null,
          p_sort: order,
          p_limit: PAGE_SIZE,
          p_offset: targetPage * PAGE_SIZE,
        })
        if (error) throw new Error(error.message)
        return { scores: (data as AdminScoreRow[] | null) ?? [], firstRolls: [] }
      }

      const { data, error } = await supabase.rpc('admin_list_first_roll_yahtzees', {
        p_search: search || null,
        p_sort: order === 'oldest' ? 'oldest' : 'newest',
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
      })
      if (error) throw new Error(error.message)
      return { scores: [], firstRolls: (data as AdminFirstRollRow[] | null) ?? [] }
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const rows = await fetchPage(tab, debounced, sort, 0)
        if (!cancelled) setResult({ key: queryKey, ...rows, page: 0 })
      } catch (error) {
        if (!cancelled) {
          toast.error('Laden is niet gelukt', { description: (error as Error).message })
          setResult({ key: queryKey, scores: [], firstRolls: [], page: 0 })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchPage, tab, debounced, sort, queryKey])

  // Bumped after a delete to pull fresh totals.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase.rpc('admin_counts')
      if (!cancelled && !error) setCounts((data as AdminCounts | null) ?? null)
    })()

    return () => {
      cancelled = true
    }
  }, [countsVersion])

  const loaded = result?.key === queryKey ? result : null
  const rows: (AdminScoreRow | AdminFirstRollRow)[] | null =
    loaded === null ? null : tab === 'scores' ? loaded.scores : loaded.firstRolls
  const total = rows?.[0]?.total_count ?? 0
  const hasMore = rows !== null && rows.length < total

  async function loadMore() {
    if (loadingMore || !hasMore || !loaded) return
    setLoadingMore(true)
    try {
      const next = loaded.page + 1
      const more = await fetchPage(tab, debounced, sort, next)
      setResult((prev) =>
        prev && prev.key === queryKey
          ? {
              ...prev,
              scores: [...prev.scores, ...more.scores],
              firstRolls: [...prev.firstRolls, ...more.firstRolls],
              page: next,
            }
          : prev,
      )
    } catch (error) {
      toast.error('Laden is niet gelukt', { description: (error as Error).message })
    } finally {
      setLoadingMore(false)
    }
  }

  const dropRow = (id: string) =>
    setResult((prev) =>
      prev
        ? {
            ...prev,
            scores: prev.scores.filter((r) => r.id !== id),
            firstRolls: prev.firstRolls.filter((r) => r.id !== id),
          }
        : prev,
    )

  async function deleteScore() {
    if (!deletingScore) return
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('admin_delete_score_entry', { p_id: deletingScore.id })

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }

    haptic('warning')
    toast.success('Score verwijderd')
    dropRow(deletingScore.id)
    setDeletingScore(null)
    setCountsVersion((v) => v + 1)
    // Statistics and leaderboards are derived, so a refresh is all it takes.
    router.refresh()
  }

  async function deleteFirstRoll() {
    if (!deletingRoll) return
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('admin_delete_first_roll_yahtzee', {
      p_id: deletingRoll.id,
    })

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }

    haptic('warning')
    toast.success('Registratie verwijderd')
    dropRow(deletingRoll.id)
    setDeletingRoll(null)
    setCountsVersion((v) => v + 1)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 px-5">
        <CountTile label="Scores" value={counts?.score_entries} />
        <CountTile label="1-worp Yahtzee's" value={counts?.first_roll_yahtzees} accent />
        <CountTile label="Groepen" value={counts?.groups} />
        <CountTile label="Spelers" value={counts?.players} />
      </section>

      {/* A scroller rather than a segmented control: four full labels do
          not fit side by side at phone width. */}
      <div className="px-5">
        <ChipScroller
          ariaLabel="Adminweergave"
          options={[
            { key: 'scores', label: 'Scores' },
            { key: 'first-roll', label: "1-worp Yahtzee's" },
            { key: 'groups', label: 'Groepen' },
            { key: 'reports', label: 'Rapportages' },
            { key: 'notify', label: 'Meldingen' },
            { key: 'manage', label: 'Beheer' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'reports' ? (
        <AdminReports />
      ) : tab === 'notify' ? (
        <AdminNotify />
      ) : tab === 'groups' ? (
        <AdminGroups onChanged={() => setCountsVersion((v) => v + 1)} />
      ) : tab === 'manage' ? (
        <AdminManagement role={role} settings={settings} />
      ) : (
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
            placeholder="Zoek een speler"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Zoeken"
            className="pl-12"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            haptic('light')
            setSortOpen(true)
          }}
          aria-label={`Sorteren: ${SORTS.find((s) => s.key === sort)?.label}`}
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
            emoji="🔍"
            title="Niets gevonden"
            description={
              debounced
                ? `Geen resultaten voor "${debounced}".`
                : 'Er is nog niets geregistreerd.'
            }
          />
        ) : tab === 'scores' ? (
          (rows as AdminScoreRow[]).map((row, index) => (
            <ScoreRow key={row.id} row={row} index={index} onDelete={() => setDeletingScore(row)} />
          ))
        ) : (
          (rows as AdminFirstRollRow[]).map((row, index) => (
            <FirstRollRow
              key={row.id}
              row={row}
              index={index}
              onDelete={() => setDeletingRoll(row)}
            />
          ))
        )}

        {hasMore && (
          <Button variant="soft" full loading={loadingMore} onClick={loadMore} className="mt-2">
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
                setSort(option.key)
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
        </>
      )}

      <ConfirmDialog
        open={deletingScore !== null}
        onOpenChange={(open) => !open && setDeletingScore(null)}
        title="Score verwijderen?"
        description={
          deletingScore
            ? `Je staat op het punt de score van ${deletingScore.score} punten van ${deletingScore.display_name} te verwijderen. Deze actie kan niet ongedaan worden gemaakt.`
            : undefined
        }
        confirmLabel="Score verwijderen"
        destructive
        onConfirm={deleteScore}
      />

      <ConfirmDialog
        open={deletingRoll !== null}
        onOpenChange={(open) => !open && setDeletingRoll(null)}
        title="Registratie verwijderen?"
        description={
          deletingRoll
            ? `Hiermee wordt deze Yahtzee-in-1-worp registratie van ${deletingRoll.display_name} verwijderd en worden de statistieken van deze gebruiker opnieuw berekend.`
            : undefined
        }
        confirmLabel="Verwijderen"
        destructive
        onConfirm={deleteFirstRoll}
      />
    </div>
  )
}

function CountTile({
  label,
  value,
  accent,
}: {
  label: string
  value?: number
  accent?: boolean
}) {
  return (
    <div className="card-surface rounded-[1.5rem] p-4">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p
        className={`tabular mt-0.5 text-2xl font-extrabold tracking-tight ${
          accent ? 'text-tangerine-300' : 'text-ink'
        }`}
      >
        {value === undefined ? '—' : formatNumber(value)}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">totaal</p>
    </div>
  )
}

function ScoreRow({
  row,
  index,
  onDelete,
}: {
  row: AdminScoreRow
  index: number
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
      className="card-surface flex items-center gap-3 rounded-[1.5rem] p-4"
    >
      <Avatar src={row.avatar_url} name={row.display_name} size="sm" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold tracking-tight text-ink">{row.display_name}</p>
        <p className="truncate text-xs text-ink-muted">@{row.username}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip className="bg-white/8 text-ink">{row.score} punten</Chip>
          {row.yahtzee_count > 0 && (
            <Chip className="bg-mint-500/15 text-mint-300">{row.yahtzee_count}× Yahtzee</Chip>
          )}
          {row.is_win && <Chip className="bg-mint-500/15 text-mint-300">Gewonnen</Chip>}
          <Chip className="bg-white/5 text-ink-muted">{formatPlayedAt(row.played_at)}</Chip>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Score van ${row.display_name} verwijderen`}
        onClick={onDelete}
        className="shrink-0 text-rose-ember-300"
      >
        <Trash2 className="size-5" aria-hidden />
      </Button>
    </motion.div>
  )
}

function FirstRollRow({
  row,
  index,
  onDelete,
}: {
  row: AdminFirstRollRow
  index: number
  onDelete: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.2) }}
      className="card-surface flex items-center gap-3 rounded-[1.5rem] p-4"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-tangerine-500/15 ring-1 ring-tangerine-500/30">
        <Zap className="size-5 text-tangerine-300" aria-hidden strokeWidth={2.6} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold tracking-tight text-ink">{row.display_name}</p>
        <p className="truncate text-xs text-ink-muted">@{row.username} · Yahtzee in 1 worp</p>
        <p className="mt-1 text-xs text-ink-muted">
          {formatPlayedAt(row.created_at)} · {formatTime(row.created_at)}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Registratie van ${row.display_name} verwijderen`}
        onClick={onDelete}
        className="shrink-0 text-rose-ember-300"
      >
        <Trash2 className="size-5" aria-hidden />
      </Button>
    </motion.div>
  )
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${className}`}>
      {children}
    </span>
  )
}
