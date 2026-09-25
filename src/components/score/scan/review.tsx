'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BONUS_FROM, ROW_VALUES, UPPER_BONUS, type ColumnReading } from '@/lib/scoresheet/read'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

/**
 * Checking what the sheet was read as, before it becomes a score.
 *
 * The reading is a proposal, never an answer. Handwriting is handwriting,
 * and a box that a person reads at a glance can genuinely be a 4 or a 9
 * in the pixels — so every value is editable, the ones the reader was
 * unsure of say so, and the total adds itself up again after every
 * change. Nothing is saved until the score form is submitted as usual.
 *
 * The values on offer per row are the ones Yahtzee allows, which is both
 * fewer taps and one less way to enter a score that cannot exist.
 */

const ROW_LABELS = [
  'Enen',
  'Tweeën',
  'Drieën',
  'Vieren',
  'Vijven',
  'Zessen',
  'Three of a kind',
  'Carré',
  'Full house',
  'Kleine straat',
  'Grote straat',
  'Topscore',
  'Chance',
] as const

const UPPER_ROWS = 6

export interface ReviewResult {
  total: number
  yahtzee: boolean
}

export function ScanReview({
  reading,
  onConfirm,
}: {
  reading: ColumnReading
  onConfirm: (result: ReviewResult) => void
}) {
  const [entries, setEntries] = useState<number[]>(reading.entries)
  // Which boxes the reader flagged; a box the player has touched is no
  // longer in doubt, so it drops off the list.
  const [unsure, setUnsure] = useState<number[]>(reading.unsure)

  const sums = useMemo(() => {
    const upper = entries.slice(0, UPPER_ROWS).reduce((a, b) => a + b, 0)
    const lower = entries.slice(UPPER_ROWS).reduce((a, b) => a + b, 0)
    const bonus = upper >= BONUS_FROM ? UPPER_BONUS : 0
    return { upper, lower, bonus, total: upper + bonus + lower }
  }, [entries])

  function change(index: number, value: number) {
    haptic('light')
    setEntries((previous) => previous.map((entry, i) => (i === index ? value : entry)))
    setUnsure((previous) => previous.filter((i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface p-4 text-center ring-1 ring-hairline">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Eindscore</p>
        <p className="tabular text-4xl font-black tracking-tight text-mint-400">{sums.total}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Boven {sums.upper + sums.bonus}
          {sums.bonus > 0 ? ` (incl. ${UPPER_BONUS} bonus)` : ''} · onder {sums.lower}
        </p>
      </div>

      {unsure.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-tangerine-500/15 px-4 py-3 text-sm text-tangerine-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {unsure.length === 1
              ? 'Eén vakje is lastig te lezen — controleer het even.'
              : `${unsure.length} vakjes zijn lastig te lezen — controleer ze even.`}
          </span>
        </p>
      )}

      <ul className="space-y-1.5">
        {ROW_LABELS.map((label, index) => (
          <li
            key={label}
            className={cn(
              'flex items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1',
              unsure.includes(index)
                ? 'bg-tangerine-500/10 ring-tangerine-500/30'
                : 'bg-surface ring-hairline',
            )}
          >
            <span className="min-w-0 truncate text-sm text-ink-soft">{label}</span>
            <select
              aria-label={label}
              value={entries[index] ?? 0}
              onChange={(event) => change(index, Number(event.target.value))}
              className="tabular min-h-11 rounded-xl bg-canvas px-3 text-right font-semibold text-white ring-1 ring-hairline focus:outline-none"
            >
              {(ROW_VALUES[index] ?? [0]).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>

      <Button
        full
        size="lg"
        onClick={() => onConfirm({ total: sums.total, yahtzee: (entries[11] ?? 0) >= 50 })}
      >
        <Check className="size-5" aria-hidden />
        Deze score overnemen
      </Button>
    </div>
  )
}
