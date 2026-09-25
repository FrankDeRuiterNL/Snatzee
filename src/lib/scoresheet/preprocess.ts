/**
 * Turning a phone photo of a scoresheet into something a grid detector can
 * read, without sending the photo anywhere.
 *
 * Everything here runs on plain arrays rather than a canvas, so the same
 * code can be unit-tested in Node and moved into a worker later. The
 * caller does the decoding; this module only sees pixels.
 *
 * The order matters, and each step exists because of a specific property
 * of a photo taken by hand, on a table, in a living room:
 *
 *  1. greyscale      — ink is darker than paper; hue says nothing useful.
 *  2. downscale      — a 12MP photo is ~40x more pixels than the lines and
 *                      digits need, and every later step is linear in that.
 *  3. flatten        — a lamp on one side makes the far half of the paper
 *                      darker than the ink on the near half, so any single
 *                      threshold either loses the far ink or floods the
 *                      near paper. Dividing out a blurred copy of the page
 *                      removes the gradient and leaves the marks.
 *  4. deskew         — the sheet is never square to the camera. A degree
 *                      or two is enough to smear the row lines across
 *                      several pixel rows, which is exactly the signal the
 *                      grid detection looks for.
 *  5. binarise       — after flattening the page is uniform, so one global
 *                      Otsu threshold is both sufficient and stable.
 */

/** A single-channel image. `data` is row-major, one byte per pixel. */
export interface GrayImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** 1 = ink, 0 = paper. Inverted relative to the greyscale, so that the
 *  interesting pixels are the ones that sum to something. */
export interface BinaryImage {
  data: Uint8Array
  width: number
  height: number
}

/*
 * A note on the `!` after every pixel read below.
 *
 * `noUncheckedIndexedAccess` types an element read as possibly undefined,
 * which is right for a sparse array and never true of a typed array read
 * inside its own bounds — every index here is derived from the image's own
 * width and height. Checking each read would put a branch in the innermost
 * loop of a pipeline that runs over a million pixels.
 */

/**
 * Longest side the pipeline works at.
 *
 * A row on a scoresheet is a few millimetres tall; at 1600px across an A4
 * that is still ~25px, which is more than enough for both the ruling and
 * the digits, and it keeps the blur and the angle sweep well inside a
 * frame's worth of work on a phone.
 */
export const WORK_SIZE = 1600

/** How far the sheet may be rotated before we stop trying to fix it. */
const MAX_SKEW_DEG = 10
/** Coarse pass step, then a fine pass around the winner. */
const COARSE_STEP_DEG = 0.5
const FINE_STEP_DEG = 0.05

/**
 * Width the skew search runs at.
 *
 * The score is a sum over rows, so it survives heavy downscaling, and the
 * sweep evaluates ~60 angles — cheap only if each one is cheap.
 */
const SKEW_WIDTH = 600

/**
 * Background blur radius, as a fraction of the shorter side.
 *
 * Has to be far larger than anything we want to keep (a printed rule, a
 * handwritten digit) and smaller than the lighting gradient itself. A
 * sixteenth of the page is comfortably between the two.
 */
const BACKGROUND_FRACTION = 1 / 16

export function toGray(source: ImageData): GrayImage {
  const { width, height } = source
  const data = source.data
  const out = new Uint8ClampedArray(width * height)
  const dst = out
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    // Rec. 601 luma: green carries most of the perceived brightness, and
    // blue the least, which also happens to suppress the blue ruling
    // printed on some sheets relative to the pencil on top of it.
    dst[p] = (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8
  }
  return { data: out, width, height }
}

/**
 * Area-average downscale.
 *
 * Not a sampler: dropping pixels from a photo of thin printed lines drops
 * whole lines, at which point the grid detector is looking for something
 * that is no longer in the image. Averaging keeps a thinned-but-present
 * line, which is what a threshold can still find.
 */
export function downscale(image: GrayImage, maxSide: number): GrayImage {
  const { width, height } = image
  const longest = Math.max(width, height)
  if (longest <= maxSide) return image

  const scale = maxSide / longest
  const outW = Math.max(1, Math.round(width * scale))
  const outH = Math.max(1, Math.round(height * scale))
  const out = new Uint8ClampedArray(outW * outH)
  const dst = out
  const src = image.data

  for (let y = 0; y < outH; y += 1) {
    const y0 = Math.floor((y * height) / outH)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outH))
    for (let x = 0; x < outW; x += 1) {
      const x0 = Math.floor((x * width) / outW)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outW))
      let sum = 0
      let count = 0
      for (let sy = y0; sy < y1; sy += 1) {
        const row = sy * width
        for (let sx = x0; sx < x1; sx += 1) {
          sum += src[row + sx]!
          count += 1
        }
      }
      dst[y * outW + x] = sum / count
    }
  }

  return { data: out, width: outW, height: outH }
}

/**
 * Box blur via a summed-area table.
 *
 * Cost is independent of the radius, which matters because the radius here
 * is a sixteenth of the image — a naive blur at that size is minutes, not
 * milliseconds.
 */
export function boxBlur(image: GrayImage, radius: number): GrayImage {
  const { width, height } = image
  const data = image.data
  const r = Math.max(1, Math.round(radius))

  // Float64: a 1600x1600 page of 255s sums past 2^32, and the table is
  // read as differences of large numbers, so precision is not optional.
  const table = new Float64Array((width + 1) * (height + 1))
  const sat = table
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    const src = y * width
    const cur = (y + 1) * (width + 1)
    const prev = y * (width + 1)
    for (let x = 0; x < width; x += 1) {
      rowSum += data[src + x]!
      sat[cur + x + 1] = sat[prev + x + 1]! + rowSum
    }
  }

  const out = new Uint8ClampedArray(width * height)
  const dst = out
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height - 1, y + r)
    const top = y0 * (width + 1)
    const bottom = (y1 + 1) * (width + 1)
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width - 1, x + r)
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const sum = sat[bottom + x1 + 1]! - sat[bottom + x0]! - sat[top + x1 + 1]! + sat[top + x0]!
      dst[y * width + x] = sum / area
    }
  }

  return { data: out, width, height }
}

/**
 * Removes the lighting gradient by dividing the page by a blurred copy of
 * itself.
 *
 * The blurred copy is, at this radius, an estimate of "what colour is the
 * paper here" — ink is too small to survive the blur, a shadow is not. So
 * the ratio is 1 wherever there is only paper, whatever the paper's local
 * brightness, and well below 1 wherever there is a mark.
 */
export function flattenLighting(image: GrayImage): GrayImage {
  const radius = Math.min(image.width, image.height) * BACKGROUND_FRACTION
  const background = boxBlur(image, radius).data
  const src = image.data
  const out = new Uint8ClampedArray(image.data.length)
  const dst = out
  for (let i = 0; i < out.length; i += 1) {
    // The floor stops a near-black background — a photo with the sheet in
    // deep shadow at one corner — from turning noise into a bright burst.
    const bg = Math.max(background[i]!, 16)
    dst[i] = (src[i]! / bg) * 255
  }
  return { data: out, width: image.width, height: image.height }
}

/**
 * Otsu's threshold: the split that best separates the histogram into two
 * groups. On a flattened page that is paper against ink, so it lands
 * wherever the ink happens to sit rather than on a number we picked.
 */
export function otsuThreshold(image: GrayImage): number {
  const histogram = new Float64Array(256)
  const data = image.data
  for (let i = 0; i < data.length; i += 1) histogram[data[i]!]! += 1

  const total = image.data.length
  let sum = 0
  for (let v = 0; v < 256; v += 1) sum += v * histogram[v]!

  let weightBelow = 0
  let sumBelow = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t += 1) {
    weightBelow += histogram[t]!
    if (weightBelow === 0) continue
    const weightAbove = total - weightBelow
    if (weightAbove === 0) break

    sumBelow += t * histogram[t]!
    const meanBelow = sumBelow / weightBelow
    const meanAbove = (sum - sumBelow) / weightAbove
    const between = weightBelow * weightAbove * (meanBelow - meanAbove) ** 2

    if (between > bestVariance) {
      bestVariance = between
      best = t
    }
  }

  return best
}

/** Anything at or below the threshold is ink. */
export function binarise(image: GrayImage, threshold = otsuThreshold(image)): BinaryImage {
  const out = new Uint8Array(image.data.length)
  const dst = out
  const src = image.data
  for (let i = 0; i < out.length; i += 1) dst[i] = src[i]! <= threshold ? 1 : 0
  return { data: out, width: image.width, height: image.height }
}

/**
 * How strongly the horizontal rules line up at a given angle.
 *
 * Counts ink per row after shearing the image by the angle, then sums the
 * squared differences between neighbouring rows. When the ruling is level
 * every line lands wholly in one row, so the profile is a row of spikes
 * and the differences are large; a degree out and each line is spread over
 * several rows, flattening the profile. Shearing rather than rotating is
 * both cheaper and, over ten degrees, indistinguishable.
 */
function skewScore(image: BinaryImage, angleRad: number): number {
  const { width, height } = image
  const data = image.data
  const slope = Math.tan(angleRad)
  const profile = new Float64Array(height)

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    for (let x = 0; x < width; x += 1) {
      if (data[row + x]! === 0) continue
      const target = y - Math.round((x - width / 2) * slope)
      if (target >= 0 && target < height) profile[target]! += 1
    }
  }

  let score = 0
  for (let y = 1; y < height; y += 1) {
    const delta = profile[y]! - profile[y - 1]!
    score += delta * delta
  }
  return score
}

/**
 * The sheet's rotation, in degrees, positive clockwise.
 *
 * Two passes: half a degree across the whole range, then a twentieth of a
 * degree around the winner. One fine pass over the full range would cost
 * ten times as much for the same answer.
 */
export function estimateSkew(image: GrayImage): number {
  const small = downscale(image, SKEW_WIDTH)
  const mask = binarise(small)

  let best = 0
  let bestScore = -1
  for (let deg = -MAX_SKEW_DEG; deg <= MAX_SKEW_DEG; deg += COARSE_STEP_DEG) {
    const score = skewScore(mask, (deg * Math.PI) / 180)
    if (score > bestScore) {
      bestScore = score
      best = deg
    }
  }

  const from = best - COARSE_STEP_DEG
  const to = best + COARSE_STEP_DEG
  for (let deg = from; deg <= to; deg += FINE_STEP_DEG) {
    const score = skewScore(mask, (deg * Math.PI) / 180)
    if (score > bestScore) {
      bestScore = score
      best = deg
    }
  }

  return best
}

/**
 * Rotates about the centre with bilinear sampling, keeping the canvas the
 * same size. Anything rotated in from outside becomes paper-white, so the
 * corners never read as a huge block of ink.
 */
export function rotate(image: GrayImage, degrees: number): GrayImage {
  if (Math.abs(degrees) < 0.01) return image

  const { width, height } = image
  const data = image.data
  const out = new Uint8ClampedArray(image.data.length)
  const dst = out
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2

  for (let y = 0; y < height; y += 1) {
    const dy = y - cy
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx
      // Inverse map: where in the source does this destination pixel come
      // from? Forward mapping would leave holes.
      const sx = cos * dx + sin * dy + cx
      const sy = -sin * dx + cos * dy + cy

      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        dst[y * width + x] = 255
        continue
      }

      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, width - 1)
      const y1 = Math.min(y0 + 1, height - 1)
      const fx = sx - x0
      const fy = sy - y0

      const top = data[y0 * width + x0]! * (1 - fx) + data[y0 * width + x1]! * fx
      const bottom = data[y1 * width + x0]! * (1 - fx) + data[y1 * width + x1]! * fx
      dst[y * width + x] = top * (1 - fy) + bottom * fy
    }
  }

  return { data: out, width, height }
}

export interface PreparedSheet {
  /** Flattened, deskewed greyscale — what the binary was made from, and
   *  what a later step can re-threshold locally if it needs to. */
  gray: GrayImage
  /** 1 = ink. The grid detection works on this. */
  mask: BinaryImage
  /** Degrees the photo was rotated by, for the debug view. */
  skew: number
  /** The Otsu cut, likewise. */
  threshold: number
}

/** greyscale → downscale → flatten → deskew → threshold. */
export function prepareSheet(source: ImageData, maxSide = WORK_SIZE): PreparedSheet {
  const small = downscale(toGray(source), maxSide)
  const flat = flattenLighting(small)
  const skew = estimateSkew(flat)
  // Rotating after flattening rather than before: the rotation's white
  // border would otherwise become part of the background estimate and drag
  // the whole edge of the page brighter.
  const gray = rotate(flat, -skew)
  const threshold = otsuThreshold(gray)
  return { gray, mask: binarise(gray, threshold), skew, threshold }
}

/** Renders either image back to RGBA, for the debug view. */
export function toImageData(image: GrayImage | BinaryImage): ImageData {
  const { width, height } = image
  const data = image.data
  const binary = image.data instanceof Uint8Array
  const rgba = new Uint8ClampedArray(width * height * 4)
  const dst = rgba
  for (let p = 0, i = 0; p < data.length; p += 1, i += 4) {
    const v = binary ? (data[p]! ? 0 : 255) : data[p]!
    dst[i] = v
    dst[i + 1] = v
    dst[i + 2] = v
    dst[i + 3] = 255
  }
  return new ImageData(rgba, width, height)
}
