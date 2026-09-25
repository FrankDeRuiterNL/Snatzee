/**
 * Reading a whole game column at once.
 *
 * Reading boxes one at a time is the wrong problem. A Yahtzee sheet is
 * not nineteen independent numbers: a "drieën" box can only hold 0, 3, 6,
 * 9, 12 or 15, the bonus is 35 or nothing, and every total is the sum of
 * the boxes above it. Those rules are worth more than the pixels in any
 * single box — they turn a shaky digit into a decidable one — and they
 * are free.
 *
 * So each box contributes a score for every value it is allowed to hold,
 * and the column is then chosen as a whole: the combination of entries
 * whose own scores, plus the agreement of the totals the player wrote
 * down, is highest. Two sums over a few hundred possible subtotals do it,
 * which is small enough to run while the photo is still on screen.
 *
 * What comes out is the grand total — the one number Snatzee keeps — plus
 * everything it was derived from, so the review screen can show its work
 * and the player can correct any of it.
 */

import type { BinaryImage } from '@/lib/scoresheet/preprocess'
import type { CellBox } from '@/lib/scoresheet/grid'
import type { CellReading } from '@/lib/scoresheet/cells'
import { classifyDigit, type DigitWeights } from '@/lib/scoresheet/digits/model'
import { digitWeights } from '@/lib/scoresheet/digits'
import { BONUS_FROM, SHEET_ROWS, TOPSCORE_ROW, UPPER_BONUS, UPPER_ROWS } from '@/lib/scoresheet/sheet'

/**
 * What each row may hold, taken from the sheet's own rules rather than
 * restated here: the reader, the form and the database all decide what a
 * box can contain from the same list.
 */
export const ROW_VALUES: number[][] = SHEET_ROWS.map((row) => row.values)

const UPPER_ENTRIES = UPPER_ROWS
const LOWER_ENTRIES = 7
/** Row indices within each block that hold a total rather than an entry. */
const UPPER_SUBTOTAL_ROW = 6
const UPPER_TOTAL_ROW = 8
const LOWER_TOTAL_ROW = 7
const GRAND_TOTAL_ROW = 9

/**
 * How much the totals the player wrote may pull the answer.
 *
 * They are strong evidence — a total is one number that has to agree with
 * thirteen others — but they are also the longest numbers on the sheet
 * and so the hardest to read, which is why this is a weight and not a
 * decision.
 */
const DEFAULT_TOTAL_WEIGHT = 2
/** The score given to a value the box says nothing about. */
const UNSEEN = -12

const FIELD = 28
const DIGIT_BOX = 20
/** Ignore this much of the box's edge, where the printed border bleeds. */
const INSET = 0.1
/** Cuts are never made this close to the ink's own ends. */
const EDGE_MARGIN = 3
/** At most this many cut points are considered, and so at most three
 *  digits — no score on a sheet is longer. */
const MAX_CUTS = 5

export interface ValueScores {
  /** log-likelihood per allowed value; higher is better. */
  scores: Map<number, number>
  /** Best value on this box's own evidence, ignoring the rest. */
  best: number
  /** How far ahead of the runner-up, in log-likelihood. */
  margin: number
}

/** The digit fields for one horizontal slice of a box. */
function fieldFor(
  mask: BinaryImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Float32Array | null {
  let top = -1
  let bottom = -1
  for (let y = y0; y <= y1; y += 1) {
    let any = false
    for (let x = x0; x <= x1; x += 1) {
      if (mask.data[y * mask.width + x] === 1) {
        any = true
        break
      }
    }
    if (any) {
      if (top < 0) top = y
      bottom = y
    }
  }
  if (top < 0) return null

  const width = x1 - x0 + 1
  const height = bottom - top + 1
  const scale = DIGIT_BOX / Math.max(width, height)
  const smallWidth = Math.max(1, Math.round(width * scale))
  const smallHeight = Math.max(1, Math.round(height * scale))

  // Area average rather than nearest pixel: MNIST's own digits were made
  // by averaging down a larger scan, so its strokes have grey edges, and
  // a hard-edged input is a shape the net has never been shown.
  const sum = new Float32Array(smallWidth * smallHeight)
  const count = new Float32Array(smallWidth * smallHeight)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = Math.min(smallWidth - 1, Math.floor(x * scale))
      const dy = Math.min(smallHeight - 1, Math.floor(y * scale))
      count[dy * smallWidth + dx]! += 1
      if (mask.data[(y + top) * mask.width + (x + x0)] === 1) sum[dy * smallWidth + dx]! += 1
    }
  }
  for (let i = 0; i < sum.length; i += 1) sum[i] = count[i]! > 0 ? sum[i]! / count[i]! : 0

  let mass = 0
  let centreX = 0
  let centreY = 0
  for (let y = 0; y < smallHeight; y += 1) {
    for (let x = 0; x < smallWidth; x += 1) {
      const value = sum[y * smallWidth + x]!
      mass += value
      centreX += x * value
      centreY += y * value
    }
  }
  if (mass === 0) return null

  const offsetX = Math.round(FIELD / 2 - centreX / mass)
  const offsetY = Math.round(FIELD / 2 - centreY / mass)
  const field = new Float32Array(FIELD * FIELD)
  for (let y = 0; y < smallHeight; y += 1) {
    for (let x = 0; x < smallWidth; x += 1) {
      const fx = x + offsetX
      const fy = y + offsetY
      if (fx < 0 || fy < 0 || fx >= FIELD || fy >= FIELD) continue
      field[fy * FIELD + fx] = sum[y * smallWidth + x]!
    }
  }
  return field
}

/** Where the ink thins out — the places a number is most likely to be cut
 *  between digits. */
function cutPoints(profile: number[], from: number, to: number): number[] {
  const width = profile.length
  const window = Math.max(4, Math.round(width * 0.1))
  const found: { at: number; depth: number }[] = []

  for (let x = from + EDGE_MARGIN; x <= to - EDGE_MARGIN; x += 1) {
    let left = 0
    let right = 0
    for (let i = Math.max(from, x - window); i < x; i += 1) left = Math.max(left, profile[i]!)
    for (let i = x + 1; i <= Math.min(to, x + window); i += 1) right = Math.max(right, profile[i]!)
    const depth = Math.min(left, right) - profile[x]!
    if (depth > 0) found.push({ at: x, depth })
  }

  found.sort((a, b) => b.depth - a.depth)
  const kept: number[] = []
  for (const candidate of found) {
    if (kept.every((at) => Math.abs(at - candidate.at) > width * 0.12)) kept.push(candidate.at)
    if (kept.length >= MAX_CUTS) break
  }
  return kept.sort((a, b) => a - b)
}

/**
 * Scores every value the row allows, in one pass over the box.
 *
 * Each way of cutting the ink is classified once and cached, so adding
 * more candidate values costs nothing — which is what makes it affordable
 * to score all twenty-seven values a "chance" box may hold.
 */
export function scoreCell(
  mask: BinaryImage,
  box: CellBox,
  allowed: number[],
  weights: DigitWeights = digitWeights(),
): ValueScores {
  const boxWidth = box.x1 - box.x0
  const boxHeight = box.y1 - box.y0
  const x0 = Math.max(0, Math.round(box.x0 + boxWidth * INSET))
  const x1 = Math.min(mask.width - 1, Math.round(box.x1 - boxWidth * INSET))
  const y0 = Math.max(0, Math.round(box.y0 + boxHeight * INSET))
  const y1 = Math.min(mask.height - 1, Math.round(box.y1 - boxHeight * INSET))

  const scores = new Map<number, number>()
  if (x1 <= x0 || y1 <= y0) {
    for (const value of allowed) scores.set(value, UNSEEN)
    return { scores, best: allowed[0] ?? 0, margin: 0 }
  }

  const width = x1 - x0 + 1
  const profile: number[] = []
  for (let x = x0; x <= x1; x += 1) {
    let ink = 0
    for (let y = y0; y <= y1; y += 1) ink += mask.data[y * mask.width + x]!
    profile.push(ink)
  }

  let left = 0
  let right = width - 1
  while (left < width && profile[left] === 0) left += 1
  while (right > left && profile[right] === 0) right -= 1
  if (right <= left) {
    for (const value of allowed) scores.set(value, UNSEEN)
    return { scores, best: allowed[0] ?? 0, margin: 0 }
  }

  const cuts = cutPoints(profile, left, right)
  const distributions = new Map<string, Float32Array | null>()
  const distributionFor = (a: number, b: number) => {
    const key = `${a}:${b}`
    if (!distributions.has(key)) {
      const field = fieldFor(mask, x0 + a, y0, x0 + b, y1)
      if (!field) distributions.set(key, null)
      else {
        const prediction = classifyDigit(field, weights)
        const spread = new Float32Array(10)
        // The net reports its two best; the rest share what is left, so
        // an unexpected digit is unlikely rather than impossible.
        const rest = Math.max(0, 1 - prediction.confidence - prediction.secondConfidence) / 8
        spread.fill(rest)
        spread[prediction.value] = prediction.confidence
        spread[prediction.second] = prediction.secondConfidence
        distributions.set(key, spread)
      }
    }
    return distributions.get(key)!
  }

  // Every way of cutting the ink into one, two or three pieces.
  const segmentations: number[][] = [[]]
  for (const cut of cuts) segmentations.push([cut])
  for (let i = 0; i < cuts.length; i += 1) {
    for (let j = i + 1; j < cuts.length; j += 1) segmentations.push([cuts[i]!, cuts[j]!])
  }

  for (const value of allowed) scores.set(value, UNSEEN)

  for (const points of segmentations) {
    const bounds = [left, ...points, right]
    const parts: [number, number][] = []
    for (let i = 0; i < bounds.length - 1; i += 1) {
      parts.push([bounds[i]! + (i > 0 ? 1 : 0), bounds[i + 1]!])
    }

    const spreads = parts.map(([a, b]) => distributionFor(a, b))
    if (spreads.some((spread) => spread === null)) continue

    for (const value of allowed) {
      const digits = String(value).split('')
      if (digits.length !== parts.length) continue
      let score = 0
      digits.forEach((digit, index) => {
        score += Math.log(spreads[index]![Number(digit)]! + 1e-6)
      })
      score /= digits.length
      if (score > scores.get(value)!) scores.set(value, score)
    }
  }

  let best = allowed[0] ?? 0
  let bestScore = -Infinity
  let runnerUp = -Infinity
  for (const [value, score] of scores) {
    if (score > bestScore) {
      runnerUp = bestScore
      bestScore = score
      best = value
    } else if (score > runnerUp) runnerUp = score
  }

  return { scores, best, margin: Number.isFinite(runnerUp) ? bestScore - runnerUp : 0 }
}

export interface ColumnReading {
  /** The score Snatzee keeps. */
  total: number
  upper: number
  lower: number
  subtotal: number
  bonus: number
  /** The thirteen entries, in sheet order. */
  entries: number[]
  /** Whether a Yahtzee was scored, from the topscore row. */
  yahtzee: boolean
  /** Entries the reading is not confident about, by index. */
  unsure: number[]
  /** Whether the totals the player wrote agree with the entries. */
  reconciles: boolean
}

/** A box's score for one value, treating strokes and blanks as zero. */
function cellScores(
  mask: BinaryImage,
  cell: CellReading,
  allowed: number[],
  weights: DigitWeights,
): ValueScores {
  if (cell.kind !== 'written') {
    // A stroke means zero, and so does a blank box. Both are certain
    // enough that the solver should not trade them away.
    const scores = new Map<number, number>()
    for (const value of allowed) scores.set(value, value === 0 ? 0 : UNSEEN)
    return { scores, best: 0, margin: -UNSEEN }
  }
  return scoreCell(mask, cell.box, allowed, weights)
}

/** Best log-likelihood for each reachable sum, added one row at a time. */
function sumTable(rows: ValueScores[]): Map<number, number> {
  let table = new Map<number, number>([[0, 0]])
  for (const row of rows) {
    const next = new Map<number, number>()
    for (const [sum, running] of table) {
      for (const [value, score] of row.scores) {
        const total = sum + value
        const best = next.get(total)
        if (best === undefined || running + score > best) next.set(total, running + score)
      }
    }
    table = next
  }
  return table
}

/** Reconstructs which values produced a given sum. */
function backtrack(rows: ValueScores[], target: number): number[] {
  const tables: Map<number, number>[] = [new Map([[0, 0]])]
  for (const row of rows) {
    const previous = tables[tables.length - 1]!
    const next = new Map<number, number>()
    for (const [sum, running] of previous) {
      for (const [value, score] of row.scores) {
        const total = sum + value
        const best = next.get(total)
        if (best === undefined || running + score > best) next.set(total, running + score)
      }
    }
    tables.push(next)
  }

  const values: number[] = []
  let remaining = target
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const previous = tables[index]!
    let chosen = 0
    let bestScore = -Infinity
    for (const [value, score] of rows[index]!.scores) {
      const before = previous.get(remaining - value)
      if (before === undefined) continue
      if (before + score > bestScore) {
        bestScore = before + score
        chosen = value
      }
    }
    values.unshift(chosen)
    remaining -= chosen
  }
  return values
}

/**
 * Reads one game column: `cells[0]` is the upper block's nine rows,
 * `cells[1]` the lower block's ten.
 */
export function readColumn(
  mask: BinaryImage,
  cells: [CellReading[], CellReading[]],
  weights: DigitWeights = digitWeights(),
  totalWeight = DEFAULT_TOTAL_WEIGHT,
): ColumnReading | null {
  const [upperRows, lowerRows] = cells
  if (upperRows.length < 9 || lowerRows.length < 10) return null

  const upperScores = Array.from({ length: UPPER_ENTRIES }, (_, row) =>
    cellScores(mask, upperRows[row]!, ROW_VALUES[row]!, weights),
  )
  const lowerScores = Array.from({ length: LOWER_ENTRIES }, (_, row) =>
    cellScores(mask, lowerRows[row]!, ROW_VALUES[UPPER_ENTRIES + row]!, weights),
  )

  const upperTable = sumTable(upperScores)
  const lowerTable = sumTable(lowerScores)

  // The totals the player wrote are read against the sums that are
  // actually reachable, which is a far smaller set than "any number".
  const withBonus = (sum: number) => sum + (sum >= BONUS_FROM ? UPPER_BONUS : 0)
  const reachableUpper = [...upperTable.keys()]
  const reachableLower = [...lowerTable.keys()]
  const reachableGrand = new Set<number>()
  for (const upper of reachableUpper) {
    for (const lower of reachableLower) reachableGrand.add(withBonus(upper) + lower)
  }

  const evidence = (cell: CellReading, candidates: number[]) =>
    cell.kind === 'written' && candidates.length > 0
      ? scoreCell(mask, cell.box, candidates, weights).scores
      : null

  const subtotalSaid = evidence(upperRows[UPPER_SUBTOTAL_ROW]!, reachableUpper)
  const upperTotalSaid = evidence(upperRows[UPPER_TOTAL_ROW]!, reachableUpper.map(withBonus))
  const lowerTotalSaid = evidence(lowerRows[LOWER_TOTAL_ROW]!, reachableLower)
  const grandSaid = evidence(lowerRows[GRAND_TOTAL_ROW]!, [...reachableGrand])

  let best: { upper: number; lower: number; score: number } | null = null
  for (const [upper, upperScore] of upperTable) {
    const upperWithBonus = withBonus(upper)
    for (const [lower, lowerScore] of lowerTable) {
      let score = upperScore + lowerScore
      if (subtotalSaid) score += totalWeight * (subtotalSaid.get(upper) ?? UNSEEN)
      if (upperTotalSaid) score += totalWeight * (upperTotalSaid.get(upperWithBonus) ?? UNSEEN)
      if (lowerTotalSaid) score += totalWeight * (lowerTotalSaid.get(lower) ?? UNSEEN)
      if (grandSaid) score += totalWeight * (grandSaid.get(upperWithBonus + lower) ?? UNSEEN)
      if (!best || score > best.score) best = { upper, lower, score }
    }
  }
  if (!best) return null

  const upperEntries = backtrack(upperScores, best.upper)
  const lowerEntries = backtrack(lowerScores, best.lower)
  const entries = [...upperEntries, ...lowerEntries]

  // A box is worth checking when its own evidence disagrees with what the
  // arithmetic settled on, or when it barely preferred what it chose.
  const allScores = [...upperScores, ...lowerScores]
  const unsure = entries
    .map((value, index) => {
      const cell = allScores[index]!
      const disagrees = cell.best !== value
      const weak = cell.margin < 0.35
      return disagrees || weak ? index : -1
    })
    .filter((index) => index >= 0)

  const bonus = best.upper >= BONUS_FROM ? UPPER_BONUS : 0
  const grand = withBonus(best.upper) + best.lower
  const reconciles =
    (!grandSaid || (grandSaid.get(grand) ?? UNSEEN) > UNSEEN) &&
    (!subtotalSaid || (subtotalSaid.get(best.upper) ?? UNSEEN) > UNSEEN)

  return {
    total: grand,
    upper: withBonus(best.upper),
    lower: best.lower,
    subtotal: best.upper,
    bonus,
    entries,
    // The topscore row is only ever 0 or 50, so anything in it is one.
    yahtzee: (entries[TOPSCORE_ROW] ?? 0) > 0,
    unsure,
    reconciles,
  }
}
