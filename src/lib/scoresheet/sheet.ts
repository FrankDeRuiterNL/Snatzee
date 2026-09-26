/**
 * A Yahtzee sheet's own rules, in one place.
 *
 * What each row may hold and how the totals follow from the entries is
 * the same knowledge in four places: the form people fill in by hand, the
 * screen where a photographed sheet is checked, the reader that decides
 * between two possible digits, and the database that stores the result.
 * Keeping one copy of it is the difference between those four agreeing
 * and those four drifting.
 *
 * The totals are never stored and never entered. They are arithmetic, and
 * arithmetic that is written down is arithmetic that can disagree with
 * what it was derived from.
 */

const step = (from: number, to: number, by: number) => {
  const values: number[] = []
  for (let value = from; value <= to; value += by) values.push(value)
  return values
}

/** Zero, or anything five dice can add up to. */
const ANY_THROW = [0, ...step(5, 30, 1)]

export interface SheetRow {
  label: string
  /** What the row counts, for the hint under the label. */
  hint: string
  /** Every value the row may hold, in order. */
  values: number[]
}

/** The thirteen rows people fill in, in sheet order. */
export const SHEET_ROWS: SheetRow[] = [
  { label: 'Enen', hint: 'Tel alle enen', values: step(0, 5, 1) },
  { label: 'Tweeën', hint: 'Tel alle tweeën', values: step(0, 10, 2) },
  { label: 'Drieën', hint: 'Tel alle drieën', values: step(0, 15, 3) },
  { label: 'Vieren', hint: 'Tel alle vieren', values: step(0, 20, 4) },
  { label: 'Vijven', hint: 'Tel alle vijven', values: step(0, 25, 5) },
  { label: 'Zessen', hint: 'Tel alle zessen', values: step(0, 30, 6) },
  { label: 'Three of a kind', hint: '3 dezelfde · totaal van 5 stenen', values: ANY_THROW },
  { label: 'Carré', hint: '4 dezelfde · totaal van 5 stenen', values: ANY_THROW },
  { label: 'Full house', hint: '3 + 2 dezelfde · 25 punten', values: [0, 25] },
  { label: 'Kleine straat', hint: '4 opeenvolgende · 30 punten', values: [0, 30] },
  { label: 'Grote straat', hint: '5 opeenvolgende · 40 punten', values: [0, 40] },
  { label: 'Topscore', hint: '5 dezelfde · 50 punten', values: [0, 50] },
  { label: 'Chance', hint: 'Vrije keus · totaal van 5 stenen', values: ANY_THROW },
]

/**
 * The points a yes-or-no row is worth, or null for a row with a range.
 *
 * Full house, both straights and the Topscore hold either nothing or
 * their fixed score, so the form offers them as a checkbox rather than a
 * list with two entries.
 */
export function fixedPoints(row: SheetRow): number | null {
  return row.values.length === 2 && row.values[0] === 0 ? row.values[1]! : null
}

/** How many of the rows belong to the sheet's upper half. */
export const UPPER_ROWS = 6
/** The bonus, and the subtotal that earns it. */
export const UPPER_BONUS = 35
export const BONUS_FROM = 63
/** Index of the row that means a Yahtzee was thrown. */
export const TOPSCORE_ROW = 11
/** Every Yahtzee after the first, with the Yahtzee box scored at 50. */
export const YAHTZEE_BONUS = 100

/** A blank sheet: thirteen zeroes, which is also a legal one. */
export const emptySheet = () => new Array<number>(SHEET_ROWS.length).fill(0)

export interface SheetTotals {
  /** The six upper rows added up. */
  subtotal: number
  /** 35 from 63 up, nothing below it. */
  bonus: number
  /** Subtotal plus bonus — the sheet's "totaal van de bovenste helft". */
  upper: number
  /** The seven lower rows added up. */
  lower: number
  /** 100 for every Yahtzee after the first — only when the Yahtzee box
   *  itself holds 50, the way the rules award it. */
  yahtzeeBonus: number
  /** What the player scored. */
  total: number
}

/** The Yahtzee bonus a sheet earns, given how many Yahtzees were thrown. */
export function yahtzeeBonus(entries: number[], yahtzees: number) {
  if ((entries[TOPSCORE_ROW] ?? 0) !== 50) return 0
  return Math.max(0, Math.floor(yahtzees) - 1) * YAHTZEE_BONUS
}

/**
 * The totals a sheet works out to.
 *
 * `yahtzees` is the number of Yahtzees thrown in the game, which is not
 * one of the thirteen boxes; leave it out to get the sheet on its own.
 */
export function sheetTotals(entries: number[], yahtzees = 0): SheetTotals {
  const subtotal = entries.slice(0, UPPER_ROWS).reduce((sum, value) => sum + value, 0)
  const bonus = subtotal >= BONUS_FROM ? UPPER_BONUS : 0
  const lower = entries.slice(UPPER_ROWS).reduce((sum, value) => sum + value, 0)
  const extra = yahtzeeBonus(entries, yahtzees)
  return {
    subtotal,
    bonus,
    upper: subtotal + bonus,
    lower,
    yahtzeeBonus: extra,
    total: subtotal + bonus + lower + extra,
  }
}

/** Whether every value is one its row allows — the same question the
 *  database asks before storing a sheet. */
export function isValidSheet(entries: unknown): entries is number[] {
  return (
    Array.isArray(entries) &&
    entries.length === SHEET_ROWS.length &&
    entries.every(
      (value, row) => typeof value === 'number' && SHEET_ROWS[row]!.values.includes(value),
    )
  )
}
