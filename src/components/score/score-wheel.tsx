'use client'

import { useMemo } from 'react'
import { WheelColumn, ITEM_HEIGHT, VISIBLE_ROWS } from '@/components/ui/wheel-picker'
import { SCORE_MAX, SCORE_MIN } from '@/lib/constants'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * Score picker built from three digit wheels instead of a text field.
 *
 * A single wheel covering 0–1575 would mean flicking through 1576 rows to
 * reach a typical score, and a number input summons the keyboard, which on a
 * phone covers the very field being filled in. Three short columns stay fast
 * to reach any value and need no keyboard at all.
 */
export function ScoreWheel({
  value,
  onChange,
  min = SCORE_MIN,
  max = SCORE_MAX,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}) {
  const hundreds = Math.floor(value / 100)
  const tens = Math.floor(value / 10) % 10
  const units = value % 10

  const maxHundreds = Math.floor(max / 100)
  const maxTens = Math.floor(max / 10) % 10
  const maxUnits = max % 10

  /*
   * Each column only offers digits that keep the total within range, rather
   * than letting an invalid combination be entered and clamped afterwards.
   * Clamping after the fact has to rewrite the other digits, which fights
   * with the wheel that is still settling and can land on a different number
   * than the one shown.
   */
  const hundredsItems = useMemo(
    () => Array.from({ length: maxHundreds + 1 }, (_, i) => i),
    [maxHundreds],
  )
  const tensItems = useMemo(
    () =>
      hundreds === maxHundreds
        ? Array.from({ length: maxTens + 1 }, (_, i) => i)
        : DIGITS,
    [hundreds, maxHundreds, maxTens],
  )
  const unitsItems = useMemo(
    () =>
      hundreds === maxHundreds && tens === maxTens
        ? Array.from({ length: maxUnits + 1 }, (_, i) => i)
        : DIGITS,
    [hundreds, tens, maxHundreds, maxTens, maxUnits],
  )

  const set = (next: { h?: number; t?: number; u?: number }) => {
    const h = next.h ?? hundreds
    // Moving into the top hundred can leave the lower digits out of range,
    // so they are pulled back to the highest value still allowed.
    const t = Math.min(next.t ?? tens, h === maxHundreds ? maxTens : 9)
    const u = Math.min(
      next.u ?? units,
      h === maxHundreds && t === maxTens ? maxUnits : 9,
    )
    onChange(Math.min(max, Math.max(min, h * 100 + t * 10 + u)))
  }

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-canvas ring-1 ring-hairline">
      {/* Selection band behind the centre row. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 z-0 rounded-xl bg-mint-500/10 ring-1 ring-mint-500/25"
        style={{
          height: ITEM_HEIGHT,
          top: ((VISIBLE_ROWS - 1) / 2) * ITEM_HEIGHT,
        }}
      />

      {/* Fades the rows away from the centre so the band reads as focus. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-canvas to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-14 bg-gradient-to-t from-canvas to-transparent"
      />

      <div className="relative z-10 flex items-center justify-center gap-1 px-3">
        <WheelColumn
          items={hundredsItems}
          value={hundreds}
          onChange={(h) => set({ h })}
          label="Honderdtallen"
          className="flex-1"
        />
        <WheelColumn
          items={tensItems}
          value={tens}
          onChange={(t) => set({ t })}
          label="Tientallen"
          className="flex-1"
        />
        <WheelColumn
          items={unitsItems}
          value={units}
          onChange={(u) => set({ u })}
          label="Eenheden"
          className="flex-1"
        />
      </div>
    </div>
  )
}
