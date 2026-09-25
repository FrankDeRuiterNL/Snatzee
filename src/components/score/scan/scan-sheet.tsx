'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Images, Loader2, RotateCcw, ScanLine } from 'lucide-react'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CropFrame, type CropRect } from '@/components/score/scan/crop-frame'
import { prepareSheet, toImageData, type PreparedSheet } from '@/lib/scoresheet/preprocess'
import { haptic } from '@/lib/haptics'

/**
 * Photograph a paper scoresheet, crop it, and hand the result to the
 * reader.
 *
 * This is step one of that: the photo is taken, cropped and cleaned up,
 * and the cleaned-up version is shown. Nothing is read yet and nothing
 * leaves the phone — the whole pipeline is local, so a scoresheet photo is
 * never uploaded anywhere.
 *
 * Showing the processed image is not decoration. Every later step — the
 * grid, the cells, the digits — reads this image and nothing else, so when
 * a sheet does not scan, this view is the difference between "it did not
 * work" and a screenshot that says which step lost it.
 */

/** Starting crop: a margin in from the edges, since people frame loosely. */
const INITIAL_CROP: CropRect = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }

type Step = 'pick' | 'crop' | 'working' | 'result'

interface Photo {
  url: string
  bitmap: ImageBitmap | HTMLImageElement
  width: number
  height: number
}

export function ScanSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [crop, setCrop] = useState<CropRect>(INITIAL_CROP)
  const [prepared, setPrepared] = useState<PreparedSheet | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const reset = useCallback(() => {
    setStep('pick')
    setPrepared(null)
    setError(null)
    setCrop(INITIAL_CROP)
    setPhoto((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return null
    })
  }, [])

  // The object URL outlives the component unless it is handed back.
  useEffect(() => () => setPhoto((p) => (p && URL.revokeObjectURL(p.url), null)), [])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)

    let bitmap: ImageBitmap | HTMLImageElement
    try {
      bitmap = await decode(file)
    } catch {
      setError('Deze foto kan niet worden gelezen. Probeer een JPG of PNG.')
      return
    }

    const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
    const height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height
    if (!width || !height) {
      setError('Deze foto kan niet worden gelezen. Probeer een JPG of PNG.')
      return
    }

    setPhoto((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return { url: URL.createObjectURL(file), bitmap, width, height }
    })
    setCrop(INITIAL_CROP)
    setStep('crop')
  }

  async function process() {
    if (!photo) return
    setStep('working')
    setError(null)

    // One frame for the spinner to paint: the pipeline is a few hundred
    // milliseconds of straight-line arithmetic on the main thread, and
    // without this the screen would sit on the crop until it finished.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

    try {
      const started = performance.now()
      const source = cropToImageData(photo, crop)
      const result = prepareSheet(source)
      setElapsed(Math.round(performance.now() - started))
      setPrepared(result)
      setStep('result')
      haptic('success')
    } catch {
      setError('Verwerken is niet gelukt. Probeer een nieuwe foto.')
      setStep('crop')
    }
  }

  // Drawing in an effect rather than during the render: the canvas only
  // exists once the result step has rendered it.
  useEffect(() => {
    if (step !== 'result' || !prepared) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const image = toImageData(prepared.mask)
    canvas.width = image.width
    canvas.height = image.height
    context.putImageData(image, 0, 0)
  }, [step, prepared])

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      // The crop frame is dragged with the same finger that would
      // otherwise swipe the sheet away.
      swipeToClose={step !== 'crop'}
      title="Scoreblad scannen"
      description="Maak een foto van je scoreblad en snijd hem bij tot alleen het blad."
      footer={
        step === 'crop' ? (
          <Button full size="lg" onClick={() => void process()}>
            <ScanLine className="size-5" aria-hidden />
            Scoreblad lezen
          </Button>
        ) : step === 'result' ? (
          <Button full size="lg" variant="soft" onClick={reset}>
            <RotateCcw className="size-5" aria-hidden />
            Nieuwe foto
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 pb-2">
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-ember-500/15 px-4 py-3 text-sm text-rose-ember-300">
            {error}
          </p>
        )}

        {step === 'pick' && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Leg het blad plat neer, zorg voor gelijkmatig licht en houd de camera er recht
              boven. De foto blijft op je telefoon — er wordt niets geüpload.
            </p>
            <Button full size="lg" onClick={() => cameraRef.current?.click()}>
              <Camera className="size-5" aria-hidden />
              Foto maken
            </Button>
            <Button full size="lg" variant="soft" onClick={() => libraryRef.current?.click()}>
              <Images className="size-5" aria-hidden />
              Kies uit je foto&apos;s
            </Button>
          </div>
        )}

        {step === 'crop' && photo && (
          <>
            <CropFrame
              src={photo.url}
              aspectRatio={photo.width / photo.height}
              value={crop}
              onChange={setCrop}
            />
            <p className="text-center text-xs text-ink-muted">
              Sleep de hoeken tot alleen het scoreblad binnen het kader valt.
            </p>
          </>
        )}

        {step === 'working' && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-ink-muted">
            <Loader2 className="size-7 animate-spin text-mint-400" aria-hidden />
            <p className="text-sm">Bezig met verwerken…</p>
          </div>
        )}

        {step === 'result' && prepared && (
          <div className="space-y-3">
            <canvas
              ref={canvasRef}
              className="w-full rounded-2xl bg-white"
              aria-label="Verwerkt scoreblad"
            />
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Scheefstand" value={`${prepared.skew.toFixed(2)}°`} />
              <Stat label="Drempel" value={String(prepared.threshold)} />
              <Stat label="Verwerkt in" value={`${elapsed} ms`} />
            </dl>
            <p className="text-xs text-ink-muted">
              Zo ziet het blad eruit voordat de vakjes worden gelezen. Staan de lijnen recht en
              zijn de cijfers leesbaar, dan kan de volgende stap ermee verder. Zo niet, maak dan
              een screenshot hiervan.
            </p>
          </div>
        )}

        {/*
          Two inputs rather than one: `capture` opens the camera straight
          away on a phone, which is wrong when the photo was taken earlier
          and is sitting in the library.
        */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void handleFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            void handleFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
    </BottomSheet>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3 ring-1 ring-hairline">
      <dt className="text-[0.7rem] uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-bold text-white">{value}</dd>
    </div>
  )
}

/** Same two-path decode as the avatar upload: EXIF-corrected where the
 *  browser can, an <img> where it cannot. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Falls through.
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
    URL.revokeObjectURL(url)
  }
}

/** The cropped region, at its own pixel size — the pipeline does its own
 *  downscaling, and doing it twice would blur the ruling for nothing. */
function cropToImageData(photo: Photo, crop: CropRect): ImageData {
  const sx = Math.round(crop.x * photo.width)
  const sy = Math.round(crop.y * photo.height)
  const sw = Math.max(1, Math.round(crop.width * photo.width))
  const sh = Math.max(1, Math.round(crop.height * photo.height))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no-canvas')

  context.drawImage(photo.bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  return context.getImageData(0, 0, sw, sh)
}
