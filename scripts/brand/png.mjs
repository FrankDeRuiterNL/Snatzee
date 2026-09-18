/**
 * Minimal PNG reader — just enough to find where the artwork actually sits
 * inside its canvas, so generated icons are not padded with dead space.
 *
 * Handles 8-bit non-interlaced RGB and RGBA, which is what design exports
 * from Figma/Illustrator/Photoshop produce. Anything else returns null and
 * the caller falls back to using the full canvas.
 */
import { inflateSync } from 'node:zlib'

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null

  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let interlace = 0
  const idat = []

  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const body = buffer.subarray(pos + 8, pos + 8 + length)

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      colorType = body[9]
      interlace = body[12]
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  const channels = CHANNELS[colorType]
  if (!channels || depth !== 8 || interlace !== 0) return null

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  let prev = Buffer.alloc(stride)
  let p = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[p]
    p += 1
    const line = Buffer.from(raw.subarray(p, p + stride))
    p += stride

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0

      switch (filter) {
        case 1:
          line[i] = (line[i] + a) & 0xff
          break
        case 2:
          line[i] = (line[i] + b) & 0xff
          break
        case 3:
          line[i] = (line[i] + ((a + b) >> 1)) & 0xff
          break
        case 4: {
          const pp = a + b - c
          const pa = Math.abs(pp - a)
          const pb = Math.abs(pp - b)
          const pc = Math.abs(pp - c)
          line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
          break
        }
        default:
          break
      }
    }

    line.copy(out, y * stride)
    prev = line
  }

  return { width, height, channels, data: out }
}

/**
 * Bounding box of everything that is not fully transparent. Images without an
 * alpha channel fall back to their full extent.
 */
export function contentBounds(buffer, alphaThreshold = 8) {
  const image = decodePng(buffer)
  if (!image) return null

  const { width, height, channels, data } = image
  if (channels !== 4 && channels !== 2) {
    return { x: 0, y: 0, width, height }
  }

  const alphaOffset = channels - 1
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const row = y * width * channels
    for (let x = 0; x < width; x++) {
      if (data[row + x * channels + alphaOffset] > alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return { x: 0, y: 0, width, height }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
