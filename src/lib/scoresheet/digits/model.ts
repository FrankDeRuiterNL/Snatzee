/**
 * The digit net's forward pass, by hand.
 *
 * Small enough to write out: two convolutions, two poolings and one
 * fully connected layer, about six thousand weights. Written by hand
 * rather than pulled from a library because a library would be megabytes
 * of WebAssembly to run a net this size, and because the whole point of
 * reading the sheet locally is that nothing has to be fetched, installed
 * or asked permission for.
 *
 * The shapes are fixed by the training script that produced the weights
 * (scripts/train-digits.py): a 28x28 input, 8 filters of 5x5, 16 filters
 * of 5x5, and ten outputs. Changing either side without the other is a
 * silent wrong answer, so the weight file carries its shapes and they are
 * checked on load.
 */

export interface DigitWeights {
  /** [8][1][5][5] */
  conv1: Float32Array
  conv1Bias: Float32Array
  /** [16][8][5][5] */
  conv2: Float32Array
  conv2Bias: Float32Array
  /** [256][10], row-major. */
  dense: Float32Array
  denseBias: Float32Array
}

const INPUT = 28
const KERNEL = 5
const CONV1 = 8
const CONV2 = 16
const CLASSES = 10

/** 28 - 4 = 24, halved to 12; 12 - 4 = 8, halved to 4. */
const SIZE1 = INPUT - KERNEL + 1
const POOL1 = SIZE1 / 2
const SIZE2 = POOL1 - KERNEL + 1
const POOL2 = SIZE2 / 2
const FLAT = CONV2 * POOL2 * POOL2

export interface Prediction {
  /** The digit, 0-9. */
  value: number
  /** Softmax probability of that digit, 0-1. */
  confidence: number
  /** The runner-up, for the constraint solving to fall back on. */
  second: number
  secondConfidence: number
}

/**
 * Classifies one 28x28 image, given as 784 values in 0..1 with ink as 1.
 */
export function classifyDigit(input: Float32Array, weights: DigitWeights): Prediction {
  if (input.length !== INPUT * INPUT) throw new Error('digit input must be 28x28')

  // ---- conv 1 + relu + max pool ----
  const pooled1 = new Float32Array(CONV1 * POOL1 * POOL1)
  for (let f = 0; f < CONV1; f += 1) {
    const bias = weights.conv1Bias[f]!
    const filterBase = f * KERNEL * KERNEL
    for (let py = 0; py < POOL1; py += 1) {
      for (let px = 0; px < POOL1; px += 1) {
        // The pooling window is 2x2 of the convolution's own output, so
        // both are computed in one go rather than materialising the
        // 24x24 map: fewer allocations, and it is the hot loop.
        let best = -Infinity
        for (let oy = 0; oy < 2; oy += 1) {
          for (let ox = 0; ox < 2; ox += 1) {
            const y0 = py * 2 + oy
            const x0 = px * 2 + ox
            let sum = bias
            for (let ky = 0; ky < KERNEL; ky += 1) {
              const row = (y0 + ky) * INPUT + x0
              const wrow = filterBase + ky * KERNEL
              for (let kx = 0; kx < KERNEL; kx += 1) {
                sum += input[row + kx]! * weights.conv1[wrow + kx]!
              }
            }
            if (sum > best) best = sum
          }
        }
        pooled1[f * POOL1 * POOL1 + py * POOL1 + px] = best > 0 ? best : 0
      }
    }
  }

  // ---- conv 2 + relu + max pool ----
  const pooled2 = new Float32Array(FLAT)
  for (let f = 0; f < CONV2; f += 1) {
    const bias = weights.conv2Bias[f]!
    for (let py = 0; py < POOL2; py += 1) {
      for (let px = 0; px < POOL2; px += 1) {
        let best = -Infinity
        for (let oy = 0; oy < 2; oy += 1) {
          for (let ox = 0; ox < 2; ox += 1) {
            const y0 = py * 2 + oy
            const x0 = px * 2 + ox
            let sum = bias
            for (let c = 0; c < CONV1; c += 1) {
              const channel = c * POOL1 * POOL1
              const filter = (f * CONV1 + c) * KERNEL * KERNEL
              for (let ky = 0; ky < KERNEL; ky += 1) {
                const row = channel + (y0 + ky) * POOL1 + x0
                const wrow = filter + ky * KERNEL
                for (let kx = 0; kx < KERNEL; kx += 1) {
                  sum += pooled1[row + kx]! * weights.conv2[wrow + kx]!
                }
              }
            }
            if (sum > best) best = sum
          }
        }
        pooled2[f * POOL2 * POOL2 + py * POOL2 + px] = best > 0 ? best : 0
      }
    }
  }

  // ---- dense ----
  const logits = new Float32Array(CLASSES)
  for (let c = 0; c < CLASSES; c += 1) {
    let sum = weights.denseBias[c]!
    for (let i = 0; i < FLAT; i += 1) sum += pooled2[i]! * weights.dense[i * CLASSES + c]!
    logits[c] = sum
  }

  let max = -Infinity
  for (let c = 0; c < CLASSES; c += 1) if (logits[c]! > max) max = logits[c]!
  let total = 0
  const probabilities = new Float32Array(CLASSES)
  for (let c = 0; c < CLASSES; c += 1) {
    const value = Math.exp(logits[c]! - max)
    probabilities[c] = value
    total += value
  }

  let best = 0
  let second = 0
  for (let c = 1; c < CLASSES; c += 1) {
    if (probabilities[c]! > probabilities[best]!) {
      second = best
      best = c
    } else if (probabilities[c]! > probabilities[second]! || second === best) {
      second = c
    }
  }

  return {
    value: best,
    confidence: probabilities[best]! / total,
    second,
    secondConfidence: probabilities[second]! / total,
  }
}

/** Decodes the shipped weights and checks they are the shape this file
 *  expects, so a mismatched pair fails loudly instead of guessing. */
export function decodeWeights(base64: string): DigitWeights {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  const floats = new Float32Array(bytes.buffer)

  const sizes = [
    CONV1 * 1 * KERNEL * KERNEL,
    CONV1,
    CONV2 * CONV1 * KERNEL * KERNEL,
    CONV2,
    FLAT * CLASSES,
    CLASSES,
  ]
  const expected = sizes.reduce((a, b) => a + b, 0)
  if (floats.length !== expected) {
    throw new Error(`digit weights: expected ${expected} floats, got ${floats.length}`)
  }

  let offset = 0
  const take = (length: number) => {
    const slice = floats.subarray(offset, offset + length)
    offset += length
    return slice
  }

  return {
    conv1: take(sizes[0]!),
    conv1Bias: take(sizes[1]!),
    conv2: take(sizes[2]!),
    conv2Bias: take(sizes[3]!),
    dense: take(sizes[4]!),
    denseBias: take(sizes[5]!),
  }
}
