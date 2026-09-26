'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import {
  BONUS_FROM,
  SHEET_ROWS,
  UPPER_BONUS,
  UPPER_ROWS,
  YAHTZEE_BONUS,
  fixedPoints,
  sheetTotals,
} from '@/lib/scoresheet/sheet'

/**
 * The scoresheet itself, as a form.
 *
 * One component for both ways in: filling a game in by hand, and checking
 * one that was read off a photo. They are the same thirteen rows and the
 * same arithmetic, so making them the same screen means a player only has
 * to learn it once — and means a correction works identically whether it
 * corrects a misread digit or a mistyped one.
 *
 * Only what the player actually threw is entered. The five totals are
 * shown in the places the paper sheet prints them, but they are worked
 * out, not typed: the subtotal of the upper half, the bonus it earns from
 * 63 up, the upper total, the lower total, and the score itself.
 *
 * Each row offers only the values its row can hold, which is both fewer
 * taps and one less way to enter a game that could not have happened.
 */

export function SheetForm({
  value,
  onChange,
  flagged,
  yahtzees = 0,
}: {
  value: number[]
  /** Yahtzees thrown this game, for the bonus on every one after the
   *  first. Not a box on the sheet, so it comes from outside. */
  yahtzees?: number
  /**
   * The new sheet, and which row was changed to get there.
   *
   * One callback rather than two: a caller that wants both — the photo
   * path drops its doubt about a row the moment it is touched — would
   * otherwise make two state updates from the same closure, and the
   * second would undo the first.
   */
  onChange: (entries: number[], row: number) => void
  /** Rows to mark for a second look: the reader's doubts, on the photo
   *  path. Empty when a game is being typed in. */
  flagged?: number[]
}) {
  const totals = sheetTotals(value, yahtzees)

  function change(row: number, next: number) {
    haptic('light')
    onChange(
      value.map((entry, index) => (index === row ? next : entry)),
      row,
    )
  }

  return (
    <div className="space-y-4">
      <Block title="Deel 1">
        {SHEET_ROWS.slice(0, UPPER_ROWS).map((row, index) => (
          <Row
            key={row.label}
            row={row}
            value={value[index] ?? 0}
            flagged={flagged?.includes(index) ?? false}
            onChange={(next) => change(index, next)}
          />
        ))}
        <Computed label="Totaal aantal punten" value={totals.subtotal} />
        <Computed
          label="Extra bonus"
          hint={`Vanaf ${BONUS_FROM} punten · ${UPPER_BONUS} punten`}
          value={totals.bonus}
        />
        <Computed label="Totaal bovenste helft" value={totals.upper} strong />
      </Block>

      <Block title="Deel 2">
        {SHEET_ROWS.slice(UPPER_ROWS).map((row, index) => (
          <Row
            key={row.label}
            row={row}
            value={value[UPPER_ROWS + index] ?? 0}
            flagged={flagged?.includes(UPPER_ROWS + index) ?? false}
            onChange={(next) => change(UPPER_ROWS + index, next)}
          />
        ))}
        <Computed label="Totaal onderste helft" value={totals.lower} />
        {totals.yahtzeeBonus > 0 && (
          <Computed
            label="Yahtzee-bonus"
            hint={`${YAHTZEE_BONUS} per extra Yahtzee`}
            value={totals.yahtzeeBonus}
          />
        )}
        <Computed label="Totaal bovenste helft" value={totals.upper} />
        <Computed label="Totaal generaal" value={totals.total} strong />
      </Block>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline">
      <h3 className="bg-surface-elevated px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
        {title}
      </h3>
      <div className="divide-y divide-hairline">{children}</div>
    </section>
  )
}

function Row({
  row,
  value,
  flagged,
  onChange,
}: {
  row: (typeof SHEET_ROWS)[number]
  value: number
  flagged: boolean
  onChange: (value: number) => void
}) {
  const points = fixedPoints(row)

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2',
        flagged && 'bg-tangerine-500/10',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-semibold text-ink">{row.label}</span>
        <span className="block truncate text-xs text-ink-muted">
          {flagged ? 'Even controleren' : row.hint}
        </span>
      </span>
      {points !== null ? (
        <PointsCheckbox
          label={row.label}
          points={points}
          checked={value === points}
          flagged={flagged}
          onChange={(checked) => onChange(checked ? points : 0)}
        />
      ) : (
        // A native select, so a phone shows its own wheel: quicker to spin
        // to 24 than any list of chips this row would fit, and it cannot
        // offer a value the row does not allow.
        <select
          aria-label={row.label}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={cn(
            'tabular min-h-11 min-w-20 rounded-xl bg-canvas px-3 text-right text-base font-bold text-white ring-1',
            flagged ? 'ring-tangerine-500/50' : 'ring-hairline',
          )}
        >
          {row.values.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/**
 * A row that is either scored or not: one tap, instead of a wheel with two
 * values on it. Same footprint as the select next to it, so the column of
 * values stays lined up.
 */
function PointsCheckbox({
  label,
  points,
  checked,
  flagged,
  onChange,
}: {
  label: string
  points: number
  checked: boolean
  flagged: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${label}, ${points} punten`}
      onClick={() => onChange(!checked)}
      className={cn(
        'press flex min-h-11 min-w-20 shrink-0 items-center justify-between gap-2.5 rounded-xl pl-2.5 pr-3 ring-1 transition-colors duration-150',
        checked
          ? 'bg-mint-500/15 ring-mint-500'
          : flagged
            ? 'bg-canvas ring-tangerine-500/50'
            : 'bg-canvas ring-hairline',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-6 place-items-center rounded-lg transition-colors duration-150',
          checked ? 'bg-mint-500 text-navy-950 shadow-mint' : 'ring-2 ring-inset ring-white/25',
        )}
      >
        {checked && (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            <Check className="size-4" strokeWidth={3.5} />
          </motion.span>
        )}
      </span>
      <span
        className={cn(
          'tabular text-base font-bold transition-colors duration-150',
          checked ? 'text-mint-300' : 'text-ink-muted',
        )}
      >
        {points}
      </span>
    </button>
  )
}

/** A row the sheet prints but nobody fills in. */
function Computed({
  label,
  hint,
  value,
  strong = false,
}: {
  label: string
  hint?: string
  value: number
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-canvas/40 px-3 py-2">
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[0.95rem]',
            strong ? 'font-bold text-ink' : 'font-semibold text-ink-soft',
          )}
        >
          {label}
        </span>
        {hint && <span className="block truncate text-xs text-ink-muted">{hint}</span>}
      </span>
      <span
        className={cn(
          'tabular min-w-20 px-3 text-right',
          strong ? 'text-lg font-black text-mint-400' : 'text-base font-bold text-ink-soft',
        )}
      >
        {value}
      </span>
    </div>
  )
}
