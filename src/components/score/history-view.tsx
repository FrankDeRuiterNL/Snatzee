'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ScoreEntryCard } from '@/components/score/score-entry-card'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SheetBreakdown } from '@/components/score/sheet-breakdown'
import { isValidSheet } from '@/lib/scoresheet/sheet'
import { Segmented } from '@/components/ui/segmented'
import { useQuickActions } from '@/components/layout/quick-actions-provider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatNumber, formatPlayedAt, formatTime } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import type { ScoreEntry } from '@/types/database'

type Filter = 'all' | 'won' | 'lost'
type Sort = 'newest' | 'oldest' | 'highest' | 'lowest'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'won', label: 'Gewonnen' },
  { key: 'lost', label: 'Verloren' },
]

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Nieuwste' },
  { key: 'oldest', label: 'Oudste' },
  { key: 'highest', label: 'Hoogste' },
  { key: 'lowest', label: 'Laagste' },
]

export function HistoryView({
  entries,
  initialFilter = 'all',
}: {
  entries: ScoreEntry[]
  initialFilter?: Filter
}) {
  const router = useRouter()
  const { openScoreSheet } = useQuickActions()

  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [sort, setSort] = useState<Sort>('newest')
  const [sortOpen, setSortOpen] = useState(false)
  const [detail, setDetail] = useState<ScoreEntry | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const visible = useMemo(() => {
    const filtered = entries.filter((e) =>
      filter === 'all' ? true : filter === 'won' ? e.is_win : !e.is_win,
    )

    const sorted = [...filtered]
    switch (sort) {
      case 'oldest':
        sorted.sort((a, b) => a.played_at.localeCompare(b.played_at))
        break
      case 'highest':
        sorted.sort((a, b) => b.score - a.score)
        break
      case 'lowest':
        sorted.sort((a, b) => a.score - b.score)
        break
      default:
        sorted.sort((a, b) => b.played_at.localeCompare(a.played_at))
    }
    return sorted
  }, [entries, filter, sort])

  // Day grouping only makes sense while the list is in date order.
  const grouped = useMemo(() => {
    if (sort === 'highest' || sort === 'lowest') return null
    return visible.reduce<Record<string, ScoreEntry[]>>((acc, entry) => {
      const key = formatPlayedAt(entry.played_at)
      ;(acc[key] ??= []).push(entry)
      return acc
    }, {})
  }, [visible, sort])

  async function handleDelete() {
    if (!detail) return
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('score_entries').delete().eq('id', detail.id)

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }

    haptic('warning')
    toast.success('Potje verwijderd')
    setDetail(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-5">
        <Segmented
          ariaLabel="Filter op resultaat"
          layoutId="history-filter"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          className="flex-1"
        />
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

      <div className="px-5">
        {visible.length === 0 ? (
          <EmptyState
            emoji="🎲"
            title={filter === 'all' ? 'Nog geen potjes' : 'Niets gevonden'}
            description={
              filter === 'all'
                ? 'Pak de dobbelstenen erbij en voeg na afloop je eerste score toe.'
                : 'Er zijn geen potjes die aan dit filter voldoen.'
            }
            action={
              filter === 'all' ? (
                <Button full onClick={() => openScoreSheet()}>
                  Eerste potje toevoegen
                </Button>
              ) : undefined
            }
          />
        ) : grouped ? (
          <div className="space-y-5">
            {Object.entries(grouped).map(([day, dayEntries]) => (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">{day}</h2>
                  <span className="tabular text-xs font-semibold text-ink-muted">
                    {dayEntries.length}×
                  </span>
                </div>
                <div className="space-y-2">
                  {dayEntries.map((entry, index) => (
                    <ScoreEntryCard
                      key={entry.id}
                      entry={entry}
                      index={index}
                      onClick={() => setDetail(entry)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((entry, index) => (
              <ScoreEntryCard
                key={entry.id}
                entry={entry}
                index={index}
                onClick={() => setDetail(entry)}
              />
            ))}
          </div>
        )}
      </div>

      <BottomSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        title="Sorteren"
        description="Kies de volgorde van je scorehistorie."
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
                  ? 'bg-surface-elevated text-white ring-hairline-strong'
                  : 'bg-surface text-ink ring-hairline'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detail ? `${detail.score} punten` : 'Potje'}
        description={
          detail ? `${formatPlayedAt(detail.played_at)} om ${formatTime(detail.played_at)}` : undefined
        }
        footer={
          <div className="flex gap-2">
            <Button
              variant="soft"
              size="lg"
              className="flex-1"
              onClick={() => {
                const entry = detail
                setDetail(null)
                if (entry) openScoreSheet(entry)
              }}
            >
              <Pencil className="size-4" aria-hidden />
              Bewerken
            </Button>
            <Button
              variant="dangerSoft"
              size="lg"
              className="flex-1"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              Verwijderen
            </Button>
          </div>
        }
      >
        {detail && (
          <div className="space-y-4 pb-2">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="rounded-[1.5rem] bg-surface p-6 text-center ring-1 ring-hairline"
            >
              <p className="tabular text-6xl font-black tracking-tight text-ink">
                {formatNumber(detail.score)}
              </p>
              <p
                className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ${
                  detail.is_win ? 'bg-mint-500/15 text-mint-300' : 'bg-canvas text-ink-soft'
                }`}
              >
                {detail.is_win ? '🏆 Gewonnen' : '🎲 Niet gewonnen'}
              </p>
            </motion.div>

            {isValidSheet(detail.sheet) && (
              <SheetBreakdown
                entries={detail.sheet}
                yahtzees={detail.yahtzee_count}
                score={detail.score}
              />
            )}

            {detail.note && (
              <div className="rounded-2xl bg-surface p-4 ring-1 ring-hairline">
                <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Notitie</p>
                <p className="selectable mt-1.5 text-[0.95rem] leading-relaxed text-ink-soft">
                  {detail.note}
                </p>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Potje verwijderen?"
        description="Dit potje verdwijnt uit je historie en telt niet meer mee in je statistieken en ranglijsten. Dit kan niet ongedaan worden gemaakt."
        confirmLabel="Ja, verwijderen"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
