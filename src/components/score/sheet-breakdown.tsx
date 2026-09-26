import { cn } from '@/lib/utils'
import {
  BONUS_FROM,
  SHEET_ROWS,
  UPPER_BONUS,
  UPPER_ROWS,
  YAHTZEE_BONUS,
  sheetTotals,
} from '@/lib/scoresheet/sheet'

/**
 * The scoresheet behind a score, read-only.
 *
 * Shown where a game is looked back at rather than entered, so it is the
 * same rows in the same order as the form, with the same totals worked
 * out the same way — just without anything to tap. A game that was only
 * ever a number has none of this, and is not given an empty table.
 */
export function SheetBreakdown({
  entries,
  yahtzees = 0,
  score,
}: {
  entries: number[]
  yahtzees?: number
  /** The stored score. Games saved before the Yahtzee bonus was counted
   *  add up without it, and are shown the way they were saved. */
  score?: number
}) {
  const withBonus = sheetTotals(entries, yahtzees)
  const totals = score === undefined || withBonus.total === score ? withBonus : sheetTotals(entries)

  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline">
      <h3 className="bg-surface-elevated px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
        Scoreblad
      </h3>
      <dl className="divide-y divide-hairline">
        {SHEET_ROWS.slice(0, UPPER_ROWS).map((row, index) => (
          <Line key={row.label} label={row.label} value={entries[index] ?? 0} />
        ))}
        <Line label="Totaal aantal punten" value={totals.subtotal} muted />
        <Line
          label="Extra bonus"
          hint={`Vanaf ${BONUS_FROM} punten · ${UPPER_BONUS} punten`}
          value={totals.bonus}
          muted
        />
        <Line label="Totaal bovenste helft" value={totals.upper} muted strong />

        {SHEET_ROWS.slice(UPPER_ROWS).map((row, index) => (
          <Line key={row.label} label={row.label} value={entries[UPPER_ROWS + index] ?? 0} />
        ))}
        <Line label="Totaal onderste helft" value={totals.lower} muted />
        {totals.yahtzeeBonus > 0 && (
          <Line
            label="Yahtzee-bonus"
            hint={`${YAHTZEE_BONUS} per extra Yahtzee`}
            value={totals.yahtzeeBonus}
            muted
          />
        )}
        <Line label="Totaal bovenste helft" value={totals.upper} muted />
        <Line label="Totaal generaal" value={totals.total} muted strong />
      </dl>
    </div>
  )
}

function Line({
  label,
  hint,
  value,
  muted = false,
  strong = false,
}: {
  label: string
  hint?: string
  value: number
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-4 py-2', muted && 'bg-canvas/40')}>
      <dt className="min-w-0">
        <span
          className={cn(
            'block text-[0.95rem]',
            strong ? 'font-bold text-ink' : muted ? 'font-semibold text-ink-soft' : 'text-ink-soft',
          )}
        >
          {label}
        </span>
        {hint && <span className="block truncate text-xs text-ink-muted">{hint}</span>}
      </dt>
      <dd
        className={cn(
          'tabular shrink-0 text-right',
          strong ? 'text-lg font-black text-mint-400' : 'text-base font-bold text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
