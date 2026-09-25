'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Images, Loader2, RotateCcw, ScanLine } from 'lucide-react'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CropFrame, type CropRect } from '@/components/score/scan/crop-frame'
import { prepareSheet, toImageData, type PreparedSheet } from '@/lib/scoresheet/preprocess'
import { detectGrid, matchesExpectedShape, type SheetGrid } from '@/lib/scoresheet/grid'
import { suggestSheetCrop } from '@/lib/scoresheet/locate'
import { readCells, type SheetReading } from '@/lib/scoresheet/cells'
import { readColumn, type ColumnReading } from '@/lib/scoresheet/read'
import { ScanReview, type ReviewResult } from '@/components/score/scan/review'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

/**
 * Photograph a paper scoresheet, crop it, and hand the result to the
 * reader.
 *
 * So far: the photo is taken, cropped, cleaned up, the grid of boxes is
 * found on it, and every box is sorted into empty, crossed out or
 * written. The numbers themselves are not read yet. Nothing leaves the
 * phone — the whole pipeline is local, so a scoresheet photo is never
 * uploaded anywhere.
 *
 * Showing the result is not decoration. Every later step reads this image
 * and this grid and nothing else, so when a sheet does not scan, this view
 * is the difference between "it did not work" and a screenshot that says
 * which step lost it.
 */

/** What each kind of cell is outlined in. Mint for a number, tangerine
 *  for a stroke, slate for a box nobody wrote in. */
const CELL_COLOURS = {
  written: '#24c79a',
  scratched: '#ff7a3d',
  empty: '#7d93a8',
} as const

/** Fallback crop, for a photo whose table could not be located: a margin
 *  in from the edges, since people frame loosely. */
const INITIAL_CROP: CropRect = { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }

/**
 * Resolution the photo is handed to the locator at.
 *
 * The locator works at 900px internally, so anything much above this is
 * decoded and thrown away — and a full 12-megapixel frame is 48MB of
 * canvas that some phones simply refuse to give back.
 */
const LOCATE_SOURCE_SIZE = 1400

type Step = 'pick' | 'locating' | 'crop' | 'working' | 'result'

interface Photo {
  url: string
  bitmap: ImageBitmap | HTMLImageElement
  width: number
  height: number
}

export function ScanSheet({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Hands the checked score to the form that saves it. */
  onResult?: (result: ReviewResult) => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [crop, setCrop] = useState<CropRect>(INITIAL_CROP)
  const [autoCropped, setAutoCropped] = useState(false)
  const [prepared, setPrepared] = useState<PreparedSheet | null>(null)
  const [grid, setGrid] = useState<SheetGrid | null>(null)
  const [reading, setReading] = useState<SheetReading | null>(null)
  const [column, setColumn] = useState(0)

  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const reset = useCallback(() => {
    setStep('pick')
    setPrepared(null)
    setGrid(null)
    setReading(null)
    setColumn(0)
    setError(null)
    setCrop(INITIAL_CROP)
    setAutoCropped(false)
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

    const photo: Photo = { url: URL.createObjectURL(file), bitmap, width, height }
    setPhoto((previous) => {
      if (previous) URL.revokeObjectURL(previous.url)
      return photo
    })
    setCrop(INITIAL_CROP)
    setAutoCropped(false)
    setStep('locating')

    // Let the step render before the locator takes the thread.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

    let proposal: CropRect | null = null
    try {
      proposal = suggestSheetCrop(photoToImageData(photo, LOCATE_SOURCE_SIZE))
    } catch {
      // A canvas that would not give its pixels back is not worth an
      // error message: the crop simply starts where it always did.
    }

    if (proposal) setCrop(proposal)
    setAutoCropped(proposal !== null)
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
      const lattice = detectGrid(result.mask)
      const cells = lattice ? readCells(result.mask, lattice) : null
      setElapsed(Math.round(performance.now() - started))
      setPrepared(result)
      setGrid(lattice)
      setReading(cells)
      // The game people just played is the one they filled in, so the
      // first column with anything in it is the one to offer.
      setColumn(cells ? Math.max(0, cells.filledPerColumn.findIndex((count) => count > 0)) : 0)
      setStep('result')
      haptic('success')
    } catch {
      setError('Verwerken is niet gelukt. Probeer een nieuwe foto.')
      setStep('crop')
    }
  }

  // Reading the chosen game is a derivation of the mask and the column,
  // so it is memoised rather than stored: picking another game recomputes
  // it, and picking the same one again costs nothing. A fifth of a second
  // of arithmetic, which is why it is not redone on every render.
  const solved = useMemo<ColumnReading | null>(() => {
    if (step !== 'result' || !prepared || !reading) return null
    const upper = reading.blocks[0]?.map((row) => row[column]!)
    const lower = reading.blocks[1]?.map((row) => row[column]!)
    if (!upper || !lower) return null
    return readColumn(prepared.mask, [upper, lower])
  }, [step, prepared, reading, column])

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

    if (!grid || !reading) return
    // Scaled with the image so the outline stays a hairline on a small
    // photo and does not disappear on a large one.
    const weight = Math.max(2, Math.round(image.width / 400))

    for (const block of reading.blocks) {
      for (const row of block) {
        row.forEach((cell, index) => {
          // The chosen column is drawn solid and the rest faded, so which
          // game is about to be imported is visible at a glance.
          context.globalAlpha = index === column ? 1 : 0.3
          context.lineWidth = index === column ? weight * 1.5 : weight
          context.strokeStyle = CELL_COLOURS[cell.kind]
          // A dashed outline is the cell saying it is not sure of itself.
          context.setLineDash(cell.uncertain ? [weight * 3, weight * 2] : [])
          context.strokeRect(cell.box.x0, cell.box.y0, cell.box.x1 - cell.box.x0, cell.box.y1 - cell.box.y0)
        })
      }
    }
    context.globalAlpha = 1
    context.setLineDash([])
  }, [step, prepared, grid, reading, column])

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
              boven. Het kader wordt daarna vanzelf om de scoretabel gelegd. De foto blijft op je
              telefoon — er wordt niets geüpload.
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
              {autoCropped
                ? 'Het kader ligt om de scoretabel. Klopt het niet, sleep dan de hoeken bij.'
                : 'De tabel is niet gevonden — sleep de hoeken tot alleen de scoretabel binnen het kader valt, zonder de omschrijvingen links.'}
            </p>
          </>
        )}

        {step === 'locating' && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-ink-muted">
            <Loader2 className="size-7 animate-spin text-mint-400" aria-hidden />
            <p className="text-sm">Scoretabel zoeken…</p>
          </div>
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
              <Stat label="Kolommen" value={grid ? String(grid.columns) : '—'} />
              <Stat
                label="Rijen"
                value={grid ? grid.blocks.map((block) => block.rows.length).join(' + ') : '—'}
              />
              <Stat label="Verwerkt in" value={`${elapsed} ms`} />
            </dl>

            {!grid ? (
              <p role="alert" className="rounded-2xl bg-rose-ember-500/15 px-4 py-3 text-sm text-rose-ember-300">
                Geen raster gevonden. Snijd de foto strakker bij tot alleen het blad, of maak een
                nieuwe foto met gelijkmatiger licht.
              </p>
            ) : !matchesExpectedShape(grid) ? (
              <p role="alert" className="rounded-2xl bg-tangerine-500/15 px-4 py-3 text-sm text-tangerine-300">
                Het raster wijkt af van een normaal scoreblad (9 rijen boven, 10 onder). Controleer
                of het hele blad binnen het kader viel.
              </p>
            ) : null}

            {reading && grid && (
              <ColumnPicker reading={reading} columns={grid.columns} value={column} onChange={setColumn} />
            )}

            {solved && (
              <ScanReview
                // Remounted per game, so the edits belong to the game on
                // screen rather than being carried over to the next.
                key={column}
                reading={solved}
                onConfirm={(result) => {
                  onResult?.(result)
                  reset()
                  onOpenChange(false)
                }}
              />
            )}

            <p className="text-xs text-ink-muted">
              De waarden hierboven zijn gelezen van het blad — controleer ze en pas aan waar nodig.
              Groen is een ingevuld getal, oranje een streep (telt als 0), grijs een leeg hokje.
              Een stippellijn betekent dat de app het niet zeker weet. Scheefstand{' '}
              {prepared.skew.toFixed(2)}°, drempel {prepared.threshold}.
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

/**
 * Which game on the sheet to import.
 *
 * A sheet holds up to six games side by side and a score belongs to one
 * of them, so the choice cannot be skipped. Columns nobody wrote in are
 * shown but not selectable: seeing all six makes it obvious which one is
 * being picked, and an empty one has nothing to import.
 */
function ColumnPicker({
  reading,
  columns,
  value,
  onChange,
}: {
  reading: SheetReading
  columns: number
  value: number
  onChange: (column: number) => void
}) {
  const filled = reading.filledPerColumn[value] ?? 0
  const unsure = reading.uncertainPerColumn[value] ?? 0

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink-soft">Welk spel wil je overnemen?</p>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: columns }, (_, index) => {
          const count = reading.filledPerColumn[index] ?? 0
          const selected = index === value
          return (
            <button
              key={index}
              type="button"
              disabled={count === 0}
              aria-pressed={selected}
              onClick={() => onChange(index)}
              className={cn(
                'press flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-semibold ring-1',
                selected
                  ? 'bg-mint-500 text-navy-950 ring-mint-500'
                  : count === 0
                    ? 'bg-canvas text-ink-muted ring-hairline opacity-50'
                    : 'bg-surface text-ink ring-hairline',
              )}
            >
              <span>{index + 1}e</span>
              <span className="tabular text-[0.65rem] font-normal opacity-80">
                {count === 0 ? 'leeg' : count}
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {filled === 0
          ? 'Er is nog geen ingevuld spel gevonden op dit blad.'
          : `${filled} ingevulde hokjes${unsure > 0 ? `, waarvan ${unsure} om te controleren` : ''}.`}
      </p>
    </div>
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

/** The whole photo, no larger than `maxSide`, for the locator. */
function photoToImageData(photo: Photo, maxSide: number): ImageData {
  const scale = Math.min(1, maxSide / Math.max(photo.width, photo.height))
  const width = Math.max(1, Math.round(photo.width * scale))
  const height = Math.max(1, Math.round(photo.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no-canvas')

  context.drawImage(photo.bitmap, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
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
