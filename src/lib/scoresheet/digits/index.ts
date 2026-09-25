/**
 * Reading the number out of a box.
 *
 * Not yet wired into the app: on photos of real sheets this reads about
 * a fifth of the numbers correctly on its own, which is not a score
 * anybody should be offered. What it is missing is the step that knows
 * what a Yahtzee sheet is allowed to hold — a "drieën" box can only be
 * 0, 3, 6, 9, 12 or 15, and the totals have to add up — which turns a
 * shaky digit into a decidable one. That is the next piece; this file is
 * the part underneath it.
 *
 * Two steps, and the first one matters more than the second. A box holds
 * one to three digits written by hand, and the net can only see one digit
 * at a time, so the ink has to be cut into digits first — and a cut in
 * the wrong place turns a correct classifier into a wrong number.
 *
 * Cutting is done on the ink's own shape, not on a fixed grid: blobs of
 * ink that overlap horizontally belong to the same digit (the two strokes
 * of a 4, a 5 whose top bar is detached, the pieces a hard threshold
 * breaks a stroke into), blobs that sit side by side are separate digits.
 *
 * Each digit is then normalised the way MNIST is — scaled so its longest
 * side is 20 pixels and placed by its centre of mass in a 28x28 field —
 * because that is the shape the weights were trained on. Getting this
 * wrong does not fail; it just quietly reads badly, which is why it is
 * spelled out here.
 */

import type { BinaryImage } from '@/lib/scoresheet/preprocess'
import type { CellBox } from '@/lib/scoresheet/grid'
import { classifyDigit, decodeWeights, type DigitWeights, type Prediction } from './model'
import { DIGIT_WEIGHTS_BASE64 } from './weights'

/** Same inset as the classifier uses, so both see the same ink. */
const INSET = 0.12
/** Ink smaller than this fraction of the box is a speck, not a digit. */
const MIN_BLOB = 0.004
/** Two blobs are one digit when they overlap by this much of the
 *  narrower one's width. */
const MERGE_OVERLAP = 0.45
/** No score on a Yahtzee sheet has more digits than this. */
const MAX_DIGITS = 3
/** MNIST's own normalisation: a 20px digit centred in 28x28. */
const FIELD = 28
const DIGIT_BOX = 20

export interface NumberReading {
  /** The number as read, or null when nothing readable was found. */
  value: number | null
  /** Per digit, left to right. */
  digits: Prediction[]
  /** The least confident digit's probability — the number is only as
   *  good as its worst digit. */
  confidence: number
}

let cached: DigitWeights | null = null

/** The weights, decoded once per page load. */
export function digitWeights(): DigitWeights {
  cached ??= decodeWeights(DIGIT_WEIGHTS_BASE64)
  return cached
}

interface Blob {
  x0: number
  y0: number
  x1: number
  y1: number
  pixels: number[]
}

/** Ink blobs inside a box, 8-connected so a diagonal stroke stays whole. */
function blobs(mask: BinaryImage, x0: number, y0: number, x1: number, y1: number): Blob[] {
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const found: Blob[] = []

  const ink = (x: number, y: number) => mask.data[(y + y0) * mask.width + (x + x0)] === 1

  for (let start = 0; start < width * height; start += 1) {
    const sx = start % width
    const sy = (start / width) | 0
    if (seen[start] === 1 || !ink(sx, sy)) continue

    seen[start] = 1
    stack.length = 0
    stack.push(start)

    const pixels: number[] = []
    let minX = sx
    let maxX = sx
    let minY = sy
    let maxY = sy

    while (stack.length > 0) {
      const p = stack.pop()!
      const x = p % width
      const y = (p / width) | 0
      pixels.push(p)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const q = ny * width + nx
          if (seen[q] === 1 || !ink(nx, ny)) continue
          seen[q] = 1
          stack.push(q)
        }
      }
    }

    found.push({ x0: minX, y0: minY, x1: maxX, y1: maxY, pixels })
  }

  const area = width * height
  return found.filter((blob) => blob.pixels.length >= area * MIN_BLOB)
}

/** Merges blobs that stand above or below one another into one digit. */
function groupIntoDigits(found: Blob[]): Blob[] {
  const sorted = [...found].sort((a, b) => a.x0 - b.x0)
  const groups: Blob[] = []

  for (const blob of sorted) {
    const last = groups[groups.length - 1]
    if (last) {
      const overlap = Math.min(last.x1, blob.x1) - Math.max(last.x0, blob.x0) + 1
      const narrower = Math.min(last.x1 - last.x0, blob.x1 - blob.x0) + 1
      if (overlap > 0 && overlap >= narrower * MERGE_OVERLAP) {
        last.x0 = Math.min(last.x0, blob.x0)
        last.y0 = Math.min(last.y0, blob.y0)
        last.x1 = Math.max(last.x1, blob.x1)
        last.y1 = Math.max(last.y1, blob.y1)
        last.pixels.push(...blob.pixels)
        continue
      }
    }
    groups.push({ ...blob, pixels: [...blob.pixels] })
  }

  return groups
}

/** One digit, scaled and centred into MNIST's 28x28 field. */
function normalise(blob: Blob, width: number): Float32Array {
  const blobWidth = blob.x1 - blob.x0 + 1
  const blobHeight = blob.y1 - blob.y0 + 1
  const scale = DIGIT_BOX / Math.max(blobWidth, blobHeight)

  // Drawn at its scaled size first, then shifted so its centre of mass
  // sits in the middle — which is how MNIST was built, and the net has
  // never seen a digit standing anywhere else.
  const scaledWidth = Math.max(1, Math.round(blobWidth * scale))
  const scaledHeight = Math.max(1, Math.round(blobHeight * scale))
  const small = new Float32Array(scaledWidth * scaledHeight)

  for (const pixel of blob.pixels) {
    const x = Math.floor(((pixel % width) - blob.x0) * scale)
    const y = Math.floor(((pixel / width | 0) - blob.y0) * scale)
    small[Math.min(scaledHeight - 1, y) * scaledWidth + Math.min(scaledWidth - 1, x)] = 1
  }

  let mass = 0
  let sumX = 0
  let sumY = 0
  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      if (small[y * scaledWidth + x] === 0) continue
      mass += 1
      sumX += x
      sumY += y
    }
  }
  if (mass === 0) return new Float32Array(FIELD * FIELD)

  const offsetX = Math.round(FIELD / 2 - sumX / mass)
  const offsetY = Math.round(FIELD / 2 - sumY / mass)

  const field = new Float32Array(FIELD * FIELD)
  for (let y = 0; y < scaledHeight; y += 1) {
    for (let x = 0; x < scaledWidth; x += 1) {
      if (small[y * scaledWidth + x] === 0) continue
      const fx = x + offsetX
      const fy = y + offsetY
      if (fx < 0 || fy < 0 || fx >= FIELD || fy >= FIELD) continue
      field[fy * FIELD + fx] = 1
    }
  }
  return field
}

/** Reads the number written in one cell. */
export function readNumber(
  mask: BinaryImage,
  box: CellBox,
  weights = digitWeights(),
): NumberReading {
  const boxWidth = box.x1 - box.x0
  const boxHeight = box.y1 - box.y0
  const x0 = Math.max(0, Math.round(box.x0 + boxWidth * INSET))
  const x1 = Math.min(mask.width - 1, Math.round(box.x1 - boxWidth * INSET))
  const y0 = Math.max(0, Math.round(box.y0 + boxHeight * INSET))
  const y1 = Math.min(mask.height - 1, Math.round(box.y1 - boxHeight * INSET))
  if (x1 <= x0 || y1 <= y0) return { value: null, digits: [], confidence: 0 }

  const width = x1 - x0 + 1
  const digits = groupIntoDigits(blobs(mask, x0, y0, x1, y1))
  if (digits.length === 0 || digits.length > MAX_DIGITS) {
    return { value: null, digits: [], confidence: 0 }
  }

  const predictions = digits.map((digit) => classifyDigit(normalise(digit, width), weights))
  const value = Number(predictions.map((p) => p.value).join(''))
  const confidence = predictions.reduce((worst, p) => Math.min(worst, p.confidence), 1)

  return { value: Number.isFinite(value) ? value : null, digits: predictions, confidence }
}
