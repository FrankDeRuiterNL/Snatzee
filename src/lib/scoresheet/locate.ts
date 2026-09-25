/**
 * Proposing the crop, so the person does not have to make it.
 *
 * Cropping to the table alone — no wordmark, no printed label column, no
 * table top around the sheet — is what the rest of the pipeline works
 * best on: everything that is not a scoring box is one less thing that
 * can look like one. Asking for that crop by hand on a phone is fiddly,
 * and the app can already find the table: the grid detection does exactly
 * that, and its lattice has a bounding box.
 *
 * So the photo is run through the pipeline once at low resolution the
 * moment it is picked, and what comes back becomes the starting crop. It
 * is a proposal, not a decision — the handles work exactly as before, and
 * when nothing is found the crop falls back to a generous default rather
 * than to something wrong.
 */

import { prepareSheet } from '@/lib/scoresheet/preprocess'
import { detectGrid } from '@/lib/scoresheet/grid'

export interface CropFractions {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Resolution for the proposal pass.
 *
 * Lower than the reading pass: this only has to place the table to within
 * a few pixels, and it runs while the person is still looking at the
 * photo they just took.
 */
const LOCATE_SIZE = 900

/** Breathing room around the boxes, as a fraction of the table's size, so
 *  the panel's own border and the row arrows stay inside the crop. */
const MARGIN = 0.05

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Where the scoring table is in this photo, as fractions of it, or null
 * when no table was found.
 */
export function suggestSheetCrop(source: ImageData): CropFractions | null {
  const prepared = prepareSheet(source, LOCATE_SIZE)
  const grid = detectGrid(prepared.mask)
  if (!grid) return null

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const block of grid.blocks) {
    for (const row of block.rows) {
      for (const cell of row) {
        if (cell.x0 < x0) x0 = cell.x0
        if (cell.y0 < y0) y0 = cell.y0
        if (cell.x1 > x1) x1 = cell.x1
        if (cell.y1 > y1) y1 = cell.y1
      }
    }
  }
  if (!Number.isFinite(x0)) return null

  const { width, height } = prepared.mask

  /*
   * Those coordinates are in the deskewed image, and the crop is applied
   * to the photo as it was taken, so the rotation has to be undone first.
   * prepareSheet rotates by -skew about the centre, and rotate() maps a
   * destination pixel to its source with exactly this formula, so running
   * the corners through it puts them back where the photo had them.
   *
   * All four corners, not two: a rotated rectangle's bounding box is
   * wider than the rectangle, and cropping to the two corners alone would
   * cut the other two off.
   */
  const radians = (-prepared.skew * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    const dx = x! - cx
    const dy = y! - cy
    const sx = cos * dx + sin * dy + cx
    const sy = -sin * dx + cos * dy + cy
    if (sx < left) left = sx
    if (sx > right) right = sx
    if (sy < top) top = sy
    if (sy > bottom) bottom = sy
  }

  // Fractions of the prepared image are fractions of the photo: the
  // downscale kept the aspect ratio and the whole frame.
  const marginX = ((right - left) * MARGIN) / width
  const marginY = ((bottom - top) * MARGIN) / height

  const fx0 = clamp01(left / width - marginX)
  const fy0 = clamp01(top / height - marginY)
  const fx1 = clamp01(right / width + marginX)
  const fy1 = clamp01(bottom / height + marginY)

  // A proposal that covers almost nothing is a misdetection, not a table.
  if (fx1 - fx0 < 0.15 || fy1 - fy0 < 0.15) return null

  return { x: fx0, y: fy0, width: fx1 - fx0, height: fy1 - fy0 }
}
