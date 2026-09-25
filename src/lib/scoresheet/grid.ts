/**
 * Finding the playing grid on a cleaned-up scoresheet.
 *
 * The sheet prints its table as a black panel with white boxes punched
 * out of it, which is what makes this tractable without any model: after
 * binarising, every cell is a rectangle of paper surrounded by ink. So
 * rather than hunting for thin ruling lines — which a photo of a crumpled
 * sheet rarely keeps intact — this looks for paper rectangles of about
 * the right size, and then for the lattice they form.
 *
 * The lattice is the point. Individual boxes are missed all the time: a
 * digit can touch two edges and cut a box in half, a hard pencil stroke
 * across an unused box splits it diagonally, a fold can flood one. But a
 * column is a dozen boxes at the same x, and a row is up to six boxes at
 * the same y, so the boxes that were found place the ones that were not.
 * Every cell handed on is the intersection of a column and a row, never a
 * component that happened to be found.
 *
 * What this deliberately does not do is assume the sheet's contents. The
 * number of game columns is whatever the sheet has (this one prints six),
 * and the two blocks' row counts are read off the image and reported, so
 * that a sheet which does not match the familiar 9-and-10 shape is
 * something the caller can say out loud rather than something that
 * silently reads the wrong rows.
 */

import type { BinaryImage } from '@/lib/scoresheet/preprocess'

export interface CellBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface SheetGrid {
  /** Game columns, left to right. */
  columns: number
  /**
   * How many rows were actually found in each block, before the known
   * shape filled in the rest. Equal to 9 and 10 when the image gave up
   * the whole grid by itself; lower when rows had to be inferred, which
   * is worth saying out loud rather than hiding.
   */
  rowsFound: number[]
  /** Row blocks, top to bottom: the upper half, then the lower half. */
  blocks: GridBlock[]
  /** Every cell that was actually found, for the debug overlay. */
  found: CellBox[]
}

export interface GridBlock {
  /** `rows[r][c]` — top to bottom, left to right. */
  rows: CellBox[][]
}

/**
 * The shape every Yahtzee sheet has: nine rows above, ten below.
 *
 * Not a guess about these particular sheets — it is what the game is.
 * Six number rows, a subtotal, the bonus and the upper total make nine;
 * seven combinations and three totals make ten. Every printed variant
 * lays that out differently, but none of them has a different count.
 *
 * So it is used as knowledge rather than as a check: a row that was
 * missed because a fold or a shadow broke its boxes is put back, and an
 * eleventh row that came from a sliver of margin is dropped. Only the
 * number of games is discovered from the image.
 */
export const EXPECTED_ROWS = [9, 10] as const

/* Size filter for a candidate cell, as a fraction of the whole image.
 * Wide enough to cover a sheet that fills the frame and one photographed
 * with a margin around it; narrow enough to drop both letterforms and the
 * page itself. */
const MIN_AREA_FRACTION = 0.0003
const MAX_AREA_FRACTION = 0.01
/** A cell is wider than it is tall, but never a sliver. */
const MIN_ASPECT = 0.8
const MAX_ASPECT = 5
/** How much of its own bounding box a component must fill to be a box
 *  rather than, say, the inside of a letter O. */
const MIN_FILL = 0.45

/** How close a box's centre must be to a line's, as a fraction of a
 *  cell's own size, to be counted as sitting on it. */
const LINE_TOLERANCE = 0.35
/** Minimum spacing between two lines, likewise — below this they are the
 *  same line seen twice. */
const LINE_SEPARATION = 0.7
/** A line must be this strong relative to the strongest one found. */
const LINE_STRENGTH = 0.4
/** And this tall, or wide, relative to the typical line: anything
 *  thinner is a sliver of margin rather than a row of cells. */
const MIN_LINE_EXTENT = 0.55
/** A gap wider than this many row pitches separates the two blocks. */
const BLOCK_GAP_PITCHES = 1.6

/** No scoresheet prints more games than this side by side. */
const MAX_COLUMNS = 6
/** A column of cells is mostly paper inside the boxes... */
const COLUMN_MIN_PAPER = 0.6
/** ...and mostly ink in the gutters between them, which is what tells
 *  the printed table apart from the white label column beside it. */
const COLUMN_MIN_GUTTER_INK = 0.5

/**
 * How much of a rectangle is paper rather than ink.
 *
 * The measure that says whether a line of the lattice is really a line of
 * cells: a row or column that lands on the sheet's black panel is almost
 * all ink, one that lands on the boxes is almost all paper, and no
 * threshold on counts of components can tell those apart as directly.
 */
function paperFraction(mask: BinaryImage, cells: CellBox[]): number {
  let paper = 0
  let total = 0
  for (const cell of cells) {
    const x0 = Math.max(0, cell.x0)
    const y0 = Math.max(0, cell.y0)
    const x1 = Math.min(mask.width - 1, cell.x1)
    const y1 = Math.min(mask.height - 1, cell.y1)
    for (let y = y0; y <= y1; y += 1) {
      const row = y * mask.width
      for (let x = x0; x <= x1; x += 1) {
        total += 1
        if (mask.data[row + x] === 0) paper += 1
      }
    }
  }
  return total > 0 ? paper / total : 0
}

/**
 * The evenly spaced ladder of `count` rows that best explains what was
 * found.
 *
 * Rows on a sheet are printed at one pitch, so their positions are an
 * arithmetic progression and two rows define it. Every pair of found
 * rows is tried as those two — for each pair, at every pair of indices it
 * could occupy — and the progression that lands closest to the most
 * found rows wins. That fills a gap where a row was missed and ignores a
 * row that was never really there, without either being a special case.
 */
function fitLadder(found: number[], count: number, score: (rungs: number[]) => number): number[] | null {
  if (found.length < 2 || count < 2) return null

  // The pitch is the typical step between rows that were found. A median
  // rather than a mean, so one missing row in the middle — which shows up
  // as a double-sized step — does not stretch it.
  const steps: number[] = []
  for (let i = 1; i < found.length; i += 1) steps.push(found[i]! - found[i - 1]!)
  const pitch = median(steps)
  if (!(pitch > 0)) return null

  // Where the rows that were found sit within a ladder of `count` rungs
  // is not determined by them: eight rows out of nine could be the top
  // eight or the bottom eight. So every placement is tried and the image
  // decides, by which one lays its cells on paper rather than on the
  // panel between them.
  const span = Math.round((found[found.length - 1]! - found[0]!) / pitch)
  const slack = Math.max(0, count - 1 - span)

  let best: { rungs: number[]; score: number } | null = null
  for (let offset = 0; offset <= slack; offset += 1) {
    const start = found[0]! - pitch * offset
    const rungs = Array.from({ length: count }, (_, index) => start + pitch * index)
    const value = score(rungs)
    if (!best || value > best.score) best = { rungs, score: value }
  }

  return best?.rungs ?? null
}

interface Component {
  x0: number
  y0: number
  x1: number
  y1: number
  area: number
}

/** Paper regions, 4-connected. Iterative: a photo has tens of thousands
 *  of them and a recursive flood fill would exhaust the stack. */
function paperComponents(mask: BinaryImage): Component[] {
  const { width, height } = mask
  const data = mask.data
  const seen = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  const components: Component[] = []

  for (let start = 0; start < data.length; start += 1) {
    if (data[start] === 1 || seen[start] === 1) continue

    let top = 0
    stack[top] = start
    top += 1
    seen[start] = 1

    let x0 = width
    let x1 = 0
    let y0 = height
    let y1 = 0
    let area = 0

    while (top > 0) {
      top -= 1
      const p = stack[top]!
      const x = p % width
      const y = (p / width) | 0
      area += 1
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y

      if (x > 0 && data[p - 1] === 0 && seen[p - 1] === 0) {
        seen[p - 1] = 1
        stack[top] = p - 1
        top += 1
      }
      if (x < width - 1 && data[p + 1] === 0 && seen[p + 1] === 0) {
        seen[p + 1] = 1
        stack[top] = p + 1
        top += 1
      }
      if (y > 0 && data[p - width] === 0 && seen[p - width] === 0) {
        seen[p - width] = 1
        stack[top] = p - width
        top += 1
      }
      if (y < height - 1 && data[p + width] === 0 && seen[p + width] === 0) {
        seen[p + width] = 1
        stack[top] = p + width
        top += 1
      }
    }

    components.push({ x0, y0, x1, y1, area })
  }

  return components
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]!
}

/**
 * The lines a set of centres falls on, strongest first, then sorted.
 *
 * Deliberately not agglomerative clustering: two neighbouring columns are
 * a cell's width apart, and a single wide box — two cells that merged
 * because the ink between them broke — sits exactly between them and
 * chains the two columns into one. Peak picking cannot chain, because a
 * line is only ever a local maximum with its neighbourhood suppressed.
 */
function findLines(
  centres: number[],
  cellSize: number,
  strength = LINE_STRENGTH,
): { at: number; count: number }[] {
  if (centres.length === 0) return []

  const tolerance = cellSize * LINE_TOLERANCE
  const separation = cellSize * LINE_SEPARATION
  const remaining = [...centres].sort((a, b) => a - b)
  const lines: { at: number; count: number }[] = []

  // Each pass takes the position with the most boxes around it, keeps it,
  // and removes everything it explains.
  for (let pass = 0; pass < 64 && remaining.length > 0; pass += 1) {
    let best = remaining[0]!
    let bestCount = 0
    for (const candidate of remaining) {
      let count = 0
      for (const value of remaining) if (Math.abs(value - candidate) <= tolerance) count += 1
      if (count > bestCount) {
        bestCount = count
        best = candidate
      }
    }

    const members = remaining.filter((value) => Math.abs(value - best) <= tolerance)
    lines.push({ at: median(members), count: members.length })

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (Math.abs(remaining[i]! - best) <= separation) remaining.splice(i, 1)
    }
  }

  const strongest = Math.max(...lines.map((line) => line.count))
  return lines
    .filter((line) => line.count >= strongest * strength)
    .sort((a, b) => a.at - b.at)
}

/**
 * The grid, or null when the image does not hold one.
 *
 * Null is a real answer: a photo of a table, of the back of the sheet, or
 * of a sheet so dark that the boxes merged, has no grid to find, and
 * saying so beats returning a lattice over nothing.
 */
export function detectGrid(mask: BinaryImage): SheetGrid | null {
  const imageArea = mask.width * mask.height
  const candidates = paperComponents(mask).filter((component) => {
    const w = component.x1 - component.x0 + 1
    const h = component.y1 - component.y0 + 1
    const aspect = w / h
    return (
      component.area >= imageArea * MIN_AREA_FRACTION &&
      component.area <= imageArea * MAX_AREA_FRACTION &&
      aspect >= MIN_ASPECT &&
      aspect <= MAX_ASPECT &&
      component.area / (w * h) >= MIN_FILL
    )
  })

  if (candidates.length < 12) return null

  // The typical cell, taken as a median so that a few merged or split
  // boxes cannot move it.
  const cellWidth = median(candidates.map((c) => c.x1 - c.x0 + 1))
  const cellHeight = median(candidates.map((c) => c.y1 - c.y0 + 1))
  if (cellWidth < 4 || cellHeight < 4) return null

  const centre = (c: Component) => ({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 })

  /*
   * A column is a stack of boxes at one x — but not every column has as
   * many boxes as the rest. Writing breaks boxes: a digit touching two
   * borders splits one, a stroke across an empty box splits it
   * diagonally. So the game column that was actually played has the
   * fewest clean boxes of all, and judging columns by how many boxes
   * they have drops exactly the one that matters.
   *
   * The strong columns are therefore only a seed. They fix the spacing,
   * and any weaker line that lands on that spacing is a column too,
   * however few boxes survived in it.
   */
  const allColumnLines = findLines(candidates.map((c) => centre(c).x), cellWidth, 0)
  const strongColumns = allColumnLines.filter(
    (line) => line.count >= Math.max(...allColumnLines.map((l) => l.count)) * LINE_STRENGTH,
  )
  if (strongColumns.length < 1) return null

  const columnLines = (() => {
    if (strongColumns.length < 2) return strongColumns
    const steps: number[] = []
    for (let i = 1; i < strongColumns.length; i += 1) {
      steps.push(strongColumns[i]!.at - strongColumns[i - 1]!.at)
    }
    const pitch = median(steps)
    if (!(pitch > 0)) return strongColumns

    const anchor = strongColumns[0]!.at
    const onTheLadder = allColumnLines.filter((line) => {
      const rung = Math.round((line.at - anchor) / pitch)
      return Math.abs(line.at - (anchor + rung * pitch)) <= cellWidth * LINE_TOLERANCE
    })
    if (onTheLadder.length < strongColumns.length) return strongColumns

    // No sheet prints more than six games, so anything beyond that is a
    // line the spacing happened to fit — the sheet's own ruling, or a
    // fold. The ones with the fewest boxes behind them go first.
    if (onTheLadder.length > MAX_COLUMNS) {
      const ranked = [...onTheLadder].sort((a, b) => b.count - a.count).slice(0, MAX_COLUMNS)
      return ranked.sort((a, b) => a.at - b.at)
    }
    return onTheLadder
  })()

  // Only boxes that sit in one of those columns get a say in where the
  // rows are. This is what keeps the sheet's own printing out of the
  // lattice: the holes in the wordmark's letters line up with each other
  // well enough to look like a row, but not with the game columns.
  const inColumns = candidates.filter((c) =>
    columnLines.some((line) => Math.abs(centre(c).x - line.at) <= cellWidth * LINE_TOLERANCE),
  )

  const rowLines = findLines(inColumns.map((c) => centre(c).y), cellHeight).filter(
    (line) => line.count >= Math.max(3, Math.round(columnLines.length * 0.6)),
  )
  const rows = rowLines.map((line) => line.at)
  const columns = columnLines.map((line) => line.at)
  if (rows.length < 6) return null

  // Each column's and row's own extent, from the boxes that make it up —
  // a cell is then the intersection of the two, which is both tighter and
  // better aligned than a median-sized box centred on the crossing.
  const extentAt = (
    position: number,
    size: number,
    pick: (c: Component) => { lo: number; hi: number; at: number },
  ) => {
    const members = inColumns
      .map(pick)
      .filter((m) => Math.abs(m.at - position) <= size * LINE_TOLERANCE)
    return members.length > 0
      ? { lo: median(members.map((m) => m.lo)), hi: median(members.map((m) => m.hi)) }
      : { lo: position - size / 2, hi: position + size / 2 }
  }

  /*
   * A line whose boxes are a fraction of a cell tall is not a row of
   * cells. Cropping tightly to the table leaves a sliver of the sheet's
   * white margin above the panel, and a sliver is exactly what that looks
   * like from a projection: many boxes, all at one y, none of them a
   * cell. Comparing each line's own extent against the typical one throws
   * those out without a fixed pixel size anywhere.
   */
  const keepFull = <T extends { lo: number; hi: number }>(extents: T[]) => {
    const sizes = extents.map((e) => e.hi - e.lo)
    const typical = median(sizes)
    return extents.filter((e) => e.hi - e.lo >= typical * MIN_LINE_EXTENT)
  }

  const columnExtents: { lo: number; hi: number }[] = keepFull(
    columns.map((x) => extentAt(x, cellWidth, (c) => ({ lo: c.x0, hi: c.x1, at: (c.x0 + c.x1) / 2 }))),
  )
  const rowExtents = keepFull(
    rows.map((y) => extentAt(y, cellHeight, (c) => ({ lo: c.y0, hi: c.y1, at: (c.y0 + c.y1) / 2 }))),
  )
  if (rowExtents.length < 6 || columnExtents.length < 1) return null

  // Split into blocks where the vertical gap jumps — on this sheet, the
  // band between the upper and the lower half.
  /*
   * The column people wrote in is the one most likely to be missing.
   *
   * A column is found from the boxes that were detected in it, and
   * writing breaks boxes: a digit touching two borders splits one, a
   * stroke across an empty box splits it diagonally. So the game column
   * that was actually played can end up with too few clean boxes to
   * register, while five empty ones beside it register perfectly — and
   * the one column that matters is the one that disappears.
   *
   * Columns are evenly spaced, so the fix is the same as for the rows:
   * step outwards by the pitch and ask the image whether there is a
   * column of cells there. "Paper inside the boxes" alone is not enough,
   * because the sheet's printed label column beside the table is white
   * too; a column of cells also has the black panel between its boxes,
   * and that is what separates the two.
   */
  const columnPitch = (() => {
    const steps: number[] = []
    for (let i = 1; i < columnExtents.length; i += 1) {
      steps.push(
        (columnExtents[i]!.lo + columnExtents[i]!.hi) / 2 -
          (columnExtents[i - 1]!.lo + columnExtents[i - 1]!.hi) / 2,
      )
    }
    return median(steps)
  })()

  if (columnPitch > 0 && rowExtents.length >= 4) {
    const columnWidth = median(columnExtents.map((column) => column.hi - column.lo))

    /** Whether a strip of the image holds this block's column of boxes. */
    const looksLikeCells = (lo: number, hi: number) => {
      if (lo < 0 || hi >= mask.width) return false
      const cells = rowExtents.map((row) => ({
        x0: Math.round(lo),
        y0: Math.round(row.lo),
        x1: Math.round(hi),
        y1: Math.round(row.hi),
      }))
      if (paperFraction(mask, cells) < COLUMN_MIN_PAPER) return false

      // The bands between consecutive rows, which on the table are the
      // panel and on the label column are more paper.
      const gutters: CellBox[] = []
      for (let i = 1; i < rowExtents.length; i += 1) {
        const top = Math.round(rowExtents[i - 1]!.hi)
        const bottom = Math.round(rowExtents[i]!.lo)
        if (bottom - top < 2) continue
        gutters.push({ x0: Math.round(lo), y0: top, x1: Math.round(hi), y1: bottom })
      }
      if (gutters.length === 0) return false
      return 1 - paperFraction(mask, gutters) >= COLUMN_MIN_GUTTER_INK
    }

    // Outwards from each end, one pitch at a time, while the image keeps
    // saying yes and the sheet could still hold another game.
    while (columnExtents.length < MAX_COLUMNS) {
      const first = columnExtents[0]!
      const lo = first.lo - columnPitch
      if (!looksLikeCells(lo, lo + columnWidth)) break
      columnExtents.unshift({ lo, hi: lo + columnWidth })
    }
    while (columnExtents.length < MAX_COLUMNS) {
      const last = columnExtents[columnExtents.length - 1]!
      const lo = last.lo + columnPitch
      if (!looksLikeCells(lo, lo + columnWidth)) break
      columnExtents.push({ lo, hi: lo + columnWidth })
    }
  }

  const rowCentres = rowExtents.map((row) => (row.lo + row.hi) / 2)
  const gaps: number[] = []
  for (let i = 1; i < rowCentres.length; i += 1) gaps.push(rowCentres[i]! - rowCentres[i - 1]!)
  const pitch = median(gaps)

  const blockStarts = [0]
  for (let i = 1; i < rowCentres.length; i += 1) {
    if (rowCentres[i]! - rowCentres[i - 1]! > pitch * BLOCK_GAP_PITCHES) blockStarts.push(i)
  }

  /*
   * A sheet has exactly two blocks, so anything else is a split in the
   * wrong place rather than a different sheet. One block means the band
   * between the halves was not wide enough to notice, and it is cut at
   * its widest gap; more than two means a gap inside a half was mistaken
   * for the band, and the narrowest of them is stitched back up.
   */
  while (blockStarts.length > EXPECTED_ROWS.length) {
    let narrowest = 1
    let narrowestGap = Infinity
    for (let i = 1; i < blockStarts.length; i += 1) {
      const index = blockStarts[i]!
      const gap = rowCentres[index]! - rowCentres[index - 1]!
      if (gap < narrowestGap) {
        narrowestGap = gap
        narrowest = i
      }
    }
    blockStarts.splice(narrowest, 1)
  }
  if (blockStarts.length === 1 && rowCentres.length >= 4) {
    let widest = 1
    let widestGap = -Infinity
    for (let i = 1; i < rowCentres.length; i += 1) {
      const gap = rowCentres[i]! - rowCentres[i - 1]!
      if (gap > widestGap) {
        widestGap = gap
        widest = i
      }
    }
    blockStarts.push(widest)
  }

  /**
   * The lattice gives every cell the same rectangle, which is only
   * approximately true: a photo taken slightly off square makes the far
   * side of the sheet a little smaller and a little shifted. So where a
   * box really was found under a lattice cell, that box wins.
   *
   * The union of the boxes found there, rather than the first one: a
   * pencil stroke across an unused cell splits it into two triangles, and
   * either one alone would be half a cell.
   */
  const snap = (cell: CellBox): CellBox => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity

    for (const box of inColumns) {
      const cx = (box.x0 + box.x1) / 2
      const cy = (box.y0 + box.y1) / 2
      if (cx < cell.x0 || cx > cell.x1 || cy < cell.y0 || cy > cell.y1) continue
      if (box.x0 < x0) x0 = box.x0
      if (box.y0 < y0) y0 = box.y0
      if (box.x1 > x1) x1 = box.x1
      if (box.y1 > y1) y1 = box.y1
    }

    if (!Number.isFinite(x0)) return cell
    // Clamped to roughly one cell: a component that leaked through a
    // broken border into its neighbour must not drag the cell with it.
    return {
      x0: Math.round(Math.max(x0, cell.x0 - cellWidth * 0.2)),
      y0: Math.round(Math.max(y0, cell.y0 - cellHeight * 0.2)),
      x1: Math.round(Math.min(x1, cell.x1 + cellWidth * 0.2)),
      y1: Math.round(Math.min(y1, cell.y1 + cellHeight * 0.2)),
    }
  }

  const rowsFound: number[] = []
  const blocks: GridBlock[] = blockStarts.map((start, index) => {
    const end = blockStarts[index + 1] ?? rowExtents.length
    const slice = rowExtents.slice(start, end)
    rowsFound.push(slice.length)

    // The rows this block should have, put on the ladder the found ones
    // describe. Their height is the typical height here, since a row that
    // had to be inferred has no boxes of its own to measure.
    const wanted = EXPECTED_ROWS[index] ?? slice.length
    const centres = slice.map((row) => (row.lo + row.hi) / 2)
    const height = median(slice.map((row) => row.hi - row.lo)) || cellHeight
    const ladder = fitLadder(centres, wanted, (rungs) =>
      paperFraction(
        mask,
        rungs.flatMap((centre) =>
          columnExtents.map((column) => ({
            x0: Math.round(column.lo),
            y0: Math.round(centre - height / 2),
            x1: Math.round(column.hi),
            y1: Math.round(centre + height / 2),
          })),
        ),
      ),
    )

    /*
     * The ladder decides how many rows there are and where a missing one
     * belongs. It does not decide where the others are: a sheet
     * photographed at an angle has rows that are not evenly spaced on the
     * image, and a row that was measured off its own boxes is more
     * accurate than one placed by arithmetic. So each rung takes the
     * measured row nearest it, and only a rung with nothing near it is
     * given the ladder's own position.
     */
    const rows = ladder
      ? ladder.map((centre) => {
          let nearest = -1
          let distance = Infinity
          slice.forEach((row, i) => {
            const delta = Math.abs((row.lo + row.hi) / 2 - centre)
            if (delta < distance) {
              distance = delta
              nearest = i
            }
          })
          const measured = slice[nearest]
          return measured && distance <= height * LINE_TOLERANCE
            ? measured
            : { lo: centre - height / 2, hi: centre + height / 2 }
        })
      : slice

    return {
      rows: rows.map((row) =>
        columnExtents.map((column) =>
          snap({
            x0: Math.round(column.lo),
            y0: Math.round(row.lo),
            x1: Math.round(column.hi),
            y1: Math.round(row.hi),
          }),
        ),
      ),
    }
  })

  return {
    columns: columnExtents.length,
    rowsFound,
    blocks,
    found: candidates.map((c) => ({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 })),
  }
}

/**
 * Whether the grid came out of the image whole.
 *
 * The rows themselves are always 9 and 10 now, so this asks the question
 * that is still open: did the image actually show them? A sheet where
 * several rows had to be inferred is one to say something about, because
 * the inferred ones are where a misreading would hide.
 */
export function matchesExpectedShape(grid: SheetGrid): boolean {
  return (
    grid.blocks.length === EXPECTED_ROWS.length &&
    grid.rowsFound.every((found, index) => found >= (EXPECTED_ROWS[index] ?? 0) - 1)
  )
}

/** How many rows had to be filled in from the known shape. */
export function inferredRows(grid: SheetGrid): number {
  return grid.rowsFound.reduce(
    (total, found, index) => total + Math.max(0, (EXPECTED_ROWS[index] ?? found) - found),
    0,
  )
}
