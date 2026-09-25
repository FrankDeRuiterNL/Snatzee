/**
 * What is in a cell: nothing, a stroke, or something written.
 *
 * Three answers, and only three, because that is what the rest of the
 * reading needs. A blank cell is a score that was never entered. A stroke
 * — a dash, a slash, a cross — is how people write "I did not score this
 * one", and on a Yahtzee sheet that means zero, not missing. Anything
 * else is a number, and goes on to be read digit by digit.
 *
 * Telling a stroke from a number without recognising either is the whole
 * trick here, and it comes down to two measurements over the cell's ink:
 *
 *  - how close all of it lies to a single straight line. A slash is a
 *    line and scores near zero; a 2, a 5, an 8 are not and do not. This
 *    is taken over every ink pixel at once rather than per blob, because
 *    a pencil stroke photographed under a lamp breaks into three pieces
 *    that still lie on the same line.
 *  - how wide it is. That separates a stroke from a lone 1, which is also
 *    a straight line, but a narrow one standing in the middle of the box.
 *
 * Both are ratios of the cell's own size, so nothing here depends on how
 * many pixels the photo happened to have.
 */

import type { BinaryImage } from '@/lib/scoresheet/preprocess'
import type { CellBox, SheetGrid } from '@/lib/scoresheet/grid'

export type CellKind = 'empty' | 'scratched' | 'written'

export interface CellReading {
  kind: CellKind
  box: CellBox
  /** Fraction of the cell's interior that is ink. */
  ink: number
  /** 0 = every pixel on one straight line, 1 = perfectly round. */
  linearity: number
  /** Width of the ink, as a fraction of the cell's. */
  spread: number
  /**
   * Whether this reading sits close enough to the line between two
   * answers to be worth a second look.
   *
   * Strokes and numbers separate cleanly on real sheets — every stroke
   * measured 0.29 or straighter, every number 0.32 or rounder — but that
   * is a narrow gap to stake a score on, so cells that land near it are
   * marked rather than quietly decided. Faint marks are flagged too: too
   * little ink to be sure it is a number, too little to be sure it is not.
   */
  uncertain: boolean
}

/**
 * How much of the cell's edge is ignored.
 *
 * The box is placed on the printed border, and the border bleeds inwards
 * when the photo is soft. A tenth in from each side is past the bleed and
 * still well clear of normal handwriting, which people centre.
 */
const INSET = 0.12

/** Below this fraction of ink the cell is empty: a speck of border, a
 *  fleck of paper, nothing that was written. */
const EMPTY_INK = 0.006

/** A stroke lies this close to its own axis, no further. */
const MAX_STROKE_LINEARITY = 0.3
/** Either side of that, this band is too close to call. */
const UNSURE_LINEARITY = [0.22, 0.42] as const
/** And this little ink is too faint to call, whatever its shape. */
const UNSURE_INK = 0.025
/** And covers at least this much of the cell's width — which a 1 does
 *  not. */
const MIN_STROKE_SPREAD = 0.38
/** And is this thin: more ink than this is a number, however straight. */
const MAX_STROKE_INK = 0.1

/** Reads one cell of the mask. */
export function readCell(mask: BinaryImage, box: CellBox): CellReading {
  const width = box.x1 - box.x0
  const height = box.y1 - box.y0
  const x0 = Math.max(0, Math.round(box.x0 + width * INSET))
  const x1 = Math.min(mask.width - 1, Math.round(box.x1 - width * INSET))
  const y0 = Math.max(0, Math.round(box.y0 + height * INSET))
  const y1 = Math.min(mask.height - 1, Math.round(box.y1 - height * INSET))

  const innerWidth = x1 - x0 + 1
  const innerHeight = y1 - y0 + 1
  if (innerWidth < 3 || innerHeight < 3) {
    return { kind: 'empty', box, ink: 0, linearity: 1, spread: 0, uncertain: false }
  }

  // One pass for the moments, one for the spread: two cheap sweeps
  // instead of a list of coordinates per cell.
  let count = 0
  let sumX = 0
  let sumY = 0
  let left = x1
  let right = x0

  for (let y = y0; y <= y1; y += 1) {
    const row = y * mask.width
    for (let x = x0; x <= x1; x += 1) {
      if (mask.data[row + x] === 0) continue
      count += 1
      sumX += x
      sumY += y
      if (x < left) left = x
      if (x > right) right = x
    }
  }

  const ink = count / (innerWidth * innerHeight)
  if (count === 0 || ink < EMPTY_INK) {
    return { kind: 'empty', box, ink, linearity: 1, spread: 0, uncertain: false }
  }

  const meanX = sumX / count
  const meanY = sumY / count
  let varX = 0
  let varY = 0
  let covariance = 0

  for (let y = y0; y <= y1; y += 1) {
    const row = y * mask.width
    const dy = y - meanY
    for (let x = x0; x <= x1; x += 1) {
      if (mask.data[row + x] === 0) continue
      const dx = x - meanX
      varX += dx * dx
      varY += dy * dy
      covariance += dx * dy
    }
  }
  varX /= count
  varY /= count
  covariance /= count

  // The two eigenvalues of the covariance are the spread along the ink's
  // own long and short axes; their ratio is thickness over length, which
  // is what "how much like a line is this" means.
  const trace = varX + varY
  const determinant = varX * varY - covariance * covariance
  const root = Math.sqrt(Math.max(0, (trace * trace) / 4 - determinant))
  const major = trace / 2 + root
  const minor = Math.max(0, trace / 2 - root)
  const linearity = major > 0 ? Math.sqrt(minor / major) : 1

  const spread = (right - left + 1) / innerWidth

  const scratched =
    linearity <= MAX_STROKE_LINEARITY && spread >= MIN_STROKE_SPREAD && ink <= MAX_STROKE_INK

  const uncertain =
    ink < UNSURE_INK ||
    (linearity >= UNSURE_LINEARITY[0] && linearity <= UNSURE_LINEARITY[1])

  return { kind: scratched ? 'scratched' : 'written', box, ink, linearity, spread, uncertain }
}

export interface SheetReading {
  /** `blocks[b][r][c]`, matching the grid. */
  blocks: CellReading[][][]
  /** Per game column: how many cells hold something. */
  filledPerColumn: number[]
  /** Per game column: how many of those need a second look. */
  uncertainPerColumn: number[]
}

/** Reads every cell of a detected grid. */
export function readCells(mask: BinaryImage, grid: SheetGrid): SheetReading {
  const filledPerColumn = new Array<number>(grid.columns).fill(0)
  const uncertainPerColumn = new Array<number>(grid.columns).fill(0)

  const blocks = grid.blocks.map((block) =>
    block.rows.map((row) =>
      row.map((box, column) => {
        const reading = readCell(mask, box)
        if (reading.kind !== 'empty') {
          filledPerColumn[column]! += 1
          if (reading.uncertain) uncertainPerColumn[column]! += 1
        }
        return reading
      }),
    ),
  )

  return { blocks, filledPerColumn, uncertainPerColumn }
}
