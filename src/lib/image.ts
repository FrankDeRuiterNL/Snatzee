'use client'

/**
 * Prepares a photo for use as an avatar.
 *
 * The reason this exists: an iPhone stores photos as HEIC, and Photos
 * reports that file's size. Safari converts to JPEG when handing the file
 * to a web upload, and JPEG is far less efficient — a 1.7 MB HEIC commonly
 * arrives as a 4–6 MB JPEG. Checking the incoming size therefore rejects
 * photos the user was told are well under the limit.
 *
 * Uploading the original is pointless anyway: the avatar is drawn at 96px
 * at most. Downscaling to a square and re-encoding turns any phone photo
 * into tens of kilobytes, so the size limit stops being something a normal
 * photo can ever hit.
 *
 * Re-encoding also drops the EXIF block, which carries the GPS coordinates
 * of wherever the photo was taken — not something to publish on a profile.
 */

/** 4× the largest on-screen avatar (96px), so it stays sharp when zoomed. */
const TARGET_SIZE = 384

/** Below this, a photo is already small enough to leave alone. */
const PASSTHROUGH_BYTES = 256 * 1024

export interface PreparedImage {
  blob: Blob
  contentType: string
  extension: string
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

async function decode(file: File) {
  // `from-image` applies the EXIF rotation, without which photos taken in
  // portrait arrive on their side.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Falls through to the <img> path below, which older Safari needs.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('decode-failed'))
      image.src = url
    })
  } finally {
    // Safari needs the URL alive until the image has loaded, which it has
    // by the time this runs.
    URL.revokeObjectURL(url)
  }
}

/**
 * Downscales and centre-crops to a square, then re-encodes.
 *
 * Returns null when the browser cannot decode the file at all — a HEIC on
 * a browser other than Safari, for instance — so the caller can say
 * something useful instead of uploading something broken.
 */
export async function prepareAvatar(file: File): Promise<PreparedImage | null> {
  // An animated GIF would lose its animation on the canvas, so a small one
  // is passed through untouched.
  if (file.type === 'image/gif' && file.size <= PASSTHROUGH_BYTES) {
    return { blob: file, contentType: 'image/gif', extension: 'gif' }
  }

  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    return null
  }

  const width = 'naturalWidth' in source ? source.naturalWidth : source.width
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height
  if (!width || !height) return null

  // Centre-crop to a square before scaling, so a portrait photo keeps its
  // subject instead of being squashed into the circle.
  const side = Math.min(width, height)
  const sx = (width - side) / 2
  const sy = (height - side) / 2
  // Never upscale: a small photo stays its own size.
  const target = Math.min(TARGET_SIZE, side)

  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target

  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, sx, sy, side, side, 0, 0, target, target)

  if ('close' in source) source.close()

  // WebP first for the smaller file; Safari below 14 has no WebP encoder
  // and returns a PNG, which toBlob reports through the blob's own type.
  let blob = await canvasToBlob(canvas, 'image/webp', 0.85)
  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.85)
  }
  if (!blob) return null

  const contentType = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  return {
    blob,
    contentType,
    extension: contentType === 'image/webp' ? 'webp' : 'jpg',
  }
}
