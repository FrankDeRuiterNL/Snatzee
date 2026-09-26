'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Images, Loader2, Maximize2, RotateCcw, ScanLine } from 'lucide-react'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CropFrame, type CropRect } from '@/components/score/scan/crop-frame'
import { toImageData, type PreparedSheet } from '@/lib/scoresheet/preprocess'
import { inferredRows, matchesExpectedShape, type SheetGrid } from '@/lib/scoresheet/grid'
import type { SheetReading } from '@/lib/scoresheet/cells'
import type { ColumnReading } from '@/lib/scoresheet/read'
import { runScan } from '@/lib/scoresheet/worker/client'
import { SheetForm } from '@/components/score/sheet-form'
import { sheetTotals, TOPSCORE_ROW } from '@/lib/scoresheet/sheet'

/** A checked game, on its way to the form that saves it. */
export interface ReviewResult {
  total: number
  yahtzee: boolean
  entries: number[]
}
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
  // The reading of one column, worked out in the worker. Tagged with the
  // column it belongs to, and cleared whenever a new scan starts.
  const [solvedFor, setSolvedFor] = useState<{
    key: string
    reading: ColumnReading | null
  } | null>(null)
  // The photo that is currently held, for releasing it. Kept outside the
  // state updater: updaters must stay pure, and one scheduled while
  // unmounting is never run at all.
  const heldPhoto = useRef<Photo | null>(null)
  const replacePhoto = useCallback((next: Photo | null) => {
    if (heldPhoto.current && heldPhoto.current !== next) releasePhoto(heldPhoto.current)
    heldPhoto.current = next
    setPhoto(next)
  }, [])
  const [crop, setCrop] = useState<CropRect>(INITIAL_CROP)
  const [autoCropped, setAutoCropped] = useState(false)
  const [prepared, setPrepared] = useState<PreparedSheet | null>(null)
  const [grid, setGrid] = useState<SheetGrid | null>(null)
  const [reading, setReading] = useState<SheetReading | null>(null)
  const [column, setColumn] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  /*
   * Corrections, kept beside the reading rather than replacing it.
   *
   * They belong to the game they were made on, so they carry their
   * column with them: picking another game shows that game's reading,
   * and coming back shows these corrections again.
   */
  const [edited, setEdited] = useState<{
    column: number
    entries: number[]
    unsure: number[]
  } | null>(null)

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
    setZoomed(false)
    setEdited(null)
    setSolvedFor(null)
    replacePhoto(null)
  }, [replacePhoto])

  // The object URL and the decoded bitmap outlive the component unless
  // they are handed back — and a decoded camera photo is tens of MB.
  useEffect(
    () => () => {
      if (heldPhoto.current) releasePhoto(heldPhoto.current)
      heldPhoto.current = null
    },
    [],
  )

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
    replacePhoto(photo)
    setCrop(INITIAL_CROP)
    setAutoCropped(false)
    setStep('locating')

    // Let the step render before the locator takes the thread.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

    let proposal: CropRect | null = null
    try {
      // Copied rather than transferred, so the main-thread fallback can
      // still use it if the worker falls over.
      proposal = await runScan('locate', photoToImageData(photo, LOCATE_SOURCE_SIZE))
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

    // One frame for the spinner to paint. The pipeline itself runs in a
    // worker, but cutting the photo out of its canvas does not.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

    try {

      /*
       * Tightened to the table before anything is read, however the photo
       * was cropped.
       *
       * The pipeline works at a fixed size, so every pixel of that budget
       * spent on the sheet's heading, its printed labels or the table it
       * was lying on is a pixel not spent on the boxes. On a photo framed
       * around the whole sheet that costs about a third of the width the
       * digits get, and the difference is visible in what comes out.
       *
       * Only the table is read, so nothing is lost by this, and a crop
       * that is already tight is left alone.
       */
      const framed = cropToImageData(photo, crop)
      const table = await runScan('locate', framed)
      const source =
        table && table.width * table.height < 0.85
          ? cropToImageData(photo, {
              x: crop.x + table.x * crop.width,
              y: crop.y + table.y * crop.height,
              width: table.width * crop.width,
              height: table.height * crop.height,
            })
          : framed

      const { prepared: result, grid: lattice, cells } = await runScan('read', source)
      setSolvedFor(null)
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
  const solveKey = step === 'result' && prepared && reading ? `${column}` : null

  useEffect(() => {
    if (solveKey === null || !prepared || !reading) return
    const upper = reading.blocks[0]?.map((row) => row[column]!)
    const lower = reading.blocks[1]?.map((row) => row[column]!)
    // Nothing to read: `solved` stays null, which is the answer.
    if (!upper || !lower) return
    let cancelled = false
    runScan('column', { mask: prepared.mask, cells: [upper, lower] })
      .then((result) => {
        if (!cancelled) setSolvedFor({ key: solveKey, reading: result })
      })
      .catch(() => {
        if (!cancelled) setSolvedFor({ key: solveKey, reading: null })
      })
    return () => {
      cancelled = true
    }
  }, [solveKey, prepared, reading, column])

  // Only the answer for the column on screen counts; a stale one from the
  // previously chosen column is not shown while the new one is computed.
  const solved = solvedFor && solvedFor.key === solveKey ? solvedFor.reading : null

  /**
   * What the checking screen shows: the reading, with any corrections
   * made to this game laid over it.
   */
  const checked = useMemo(() => {
    if (!solved) return null
    if (edited && edited.column === column) return edited
    return { column, entries: solved.entries, unsure: solved.unsure }
  }, [solved, edited, column])

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
      // Never swiped away: the crop frame is dragged with the same
      // finger that would otherwise dismiss it, and the checking step is
      // long enough to scroll.
      swipeToClose={false}
      title="Scoreblad scannen"
      description="Maak een foto van je scoreblad en snijd hem bij tot alleen het blad."
      footer={
        step === 'crop' ? (
          <Button full size="lg" onClick={() => void process()}>
            <ScanLine className="size-5" aria-hidden />
            Scoreblad lezen
          </Button>
        ) : step === 'result' && checked ? (
          <Button
            full
            size="lg"
            onClick={() => {
              onResult?.({
                total: sheetTotals(checked.entries).total,
                yahtzee: (checked.entries[TOPSCORE_ROW] ?? 0) > 0,
                entries: checked.entries,
              })
              reset()
              onOpenChange(false)
            }}
          >
            <Check className="size-5" aria-hidden />
            Deze score overnemen
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
            {/*
              Small by default: it is what the app saw, not what the
              player came for, and the values below it are. One tap makes
              it full width for when a number needs checking against the
              paper.
            */}
            <button
              type="button"
              onClick={() => setZoomed((previous) => !previous)}
              aria-expanded={zoomed}
              className="press flex w-full items-center gap-3 rounded-2xl bg-surface p-2 text-left ring-1 ring-hairline"
            >
              <canvas
                ref={canvasRef}
                className={cn(
                  'rounded-xl bg-white transition-[width]',
                  zoomed ? 'w-full' : 'h-20 w-16 object-cover',
                )}
                aria-label="Verwerkt scoreblad"
              />
              {!zoomed && (
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">Gelezen scoreblad</span>
                  <span className="block text-xs text-ink-muted">
                    Tik om groot te bekijken
                  </span>
                </span>
              )}
              {!zoomed && <Maximize2 className="size-4 shrink-0 text-ink-muted" aria-hidden />}
            </button>

            {!grid ? (
              <p role="alert" className="rounded-2xl bg-rose-ember-500/15 px-4 py-3 text-sm text-rose-ember-300">
                Geen raster gevonden. Snijd de foto strakker bij tot alleen het blad, of maak een
                nieuwe foto met gelijkmatiger licht.
              </p>
            ) : !matchesExpectedShape(grid) ? (
              <p role="alert" className="rounded-2xl bg-tangerine-500/15 px-4 py-3 text-sm text-tangerine-300">
                {inferredRows(grid) === 1
                  ? 'Eén rij was niet te vinden op de foto en is aangevuld. Controleer of het hele blad binnen het kader viel.'
                  : `${inferredRows(grid)} rijen waren niet te vinden op de foto en zijn aangevuld. Controleer of het hele blad binnen het kader viel.`}
              </p>
            ) : null}

            {reading && grid && (
              <ColumnPicker reading={reading} columns={grid.columns} value={column} onChange={setColumn} />
            )}

            {checked && (
              <>
                {checked.unsure.length > 0 && (
                  <p className="flex items-start gap-2 rounded-2xl bg-tangerine-500/15 px-4 py-3 text-sm text-tangerine-300">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {checked.unsure.length === 1
                        ? 'Eén vakje is lastig te lezen — controleer het even.'
                        : `${checked.unsure.length} vakjes zijn lastig te lezen — controleer ze even.`}
                    </span>
                  </p>
                )}

                <SheetForm
                  value={checked.entries}
                  flagged={checked.unsure}
                  onChange={(entries, row) =>
                    setEdited({
                      column,
                      entries,
                      // A box the player has just set is no longer one to
                      // check.
                      unsure: checked.unsure.filter((index) => index !== row),
                    })
                  }
                />
              </>
            )}

            {/* Outside the reading: a photo that produced nothing
                readable is exactly when this is needed. */}
            <Button full variant="soft" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden />
              Nieuwe foto
            </Button>

            {zoomed && (
              <p className="text-xs text-ink-muted">
                Groen is een ingevuld getal, oranje een streep (telt als 0), grijs een leeg hokje.
                Een stippellijn betekent dat de app het niet zeker weet.
              </p>
            )}
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

/** Hands back what a photo holds: its object URL and, for an
 *  ImageBitmap, the decoded pixels. */
function releasePhoto(photo: Photo) {
  URL.revokeObjectURL(photo.url)
  if (typeof ImageBitmap !== 'undefined' && photo.bitmap instanceof ImageBitmap) {
    photo.bitmap.close()
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
