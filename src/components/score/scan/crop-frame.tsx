'use client'

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Rectangular crop over a photo, in fractions of the image.
 *
 * Rectangular rather than four free corners: a sheet photographed from
 * above is close enough to square that the deskew step handles what is
 * left, and dragging four independent corners on a phone is fiddly in a
 * way dragging a box is not. If perspective turns out to matter, this is
 * the component that grows a fourth degree of freedom.
 */

export interface CropRect {
  /** All four in 0..1 of the image's own width and height. */
  x: number
  y: number
  width: number
  height: number
}

/** Below this the crop stops being a sheet and starts being a smudge. */
const MIN_SIZE = 0.1

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function CropFrame({
  src,
  aspectRatio,
  value,
  onChange,
}: {
  src: string
  aspectRatio: number
  value: CropRect
  onChange: (next: CropRect) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  // The crop as it was when the drag started, plus where the finger was:
  // every move is applied to that, not to the previous frame, so rounding
  // cannot accumulate over a long drag.
  const drag = useRef<{ start: CropRect; originX: number; originY: number } | null>(null)

  const toFraction = useCallback((event: ReactPointerEvent) => {
    const box = frameRef.current?.getBoundingClientRect()
    if (!box) return null
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }, [])

  const begin = useCallback(
    (event: ReactPointerEvent) => {
      const point = toFraction(event)
      if (!point) return
      event.currentTarget.setPointerCapture(event.pointerId)
      // Stops the drag from also scrolling the sheet behind it.
      event.preventDefault()
      event.stopPropagation()
      drag.current = { start: value, originX: point.x, originY: point.y }
    },
    [toFraction, value],
  )

  const moveBox = useCallback(
    (event: ReactPointerEvent) => {
      const state = drag.current
      const point = toFraction(event)
      if (!state || !point) return
      event.preventDefault()

      const dx = clamp(point.x - state.originX, -state.start.x, 1 - state.start.x - state.start.width)
      const dy = clamp(point.y - state.originY, -state.start.y, 1 - state.start.y - state.start.height)
      onChange({ ...state.start, x: state.start.x + dx, y: state.start.y + dy })
    },
    [onChange, toFraction],
  )

  const moveCorner = useCallback(
    (event: ReactPointerEvent, corner: Corner) => {
      const state = drag.current
      const point = toFraction(event)
      if (!state || !point) return
      event.preventDefault()

      const { start } = state
      const right = start.x + start.width
      const bottom = start.y + start.height

      // Each corner moves its own two edges; the opposite two stay put,
      // and the minimum size is enforced against them.
      let left = start.x
      let top = start.y
      let edgeRight = right
      let edgeBottom = bottom

      if (corner === 'nw' || corner === 'sw') left = clamp(point.x, 0, right - MIN_SIZE)
      else edgeRight = clamp(point.x, left + MIN_SIZE, 1)

      if (corner === 'nw' || corner === 'ne') top = clamp(point.y, 0, bottom - MIN_SIZE)
      else edgeBottom = clamp(point.y, top + MIN_SIZE, 1)

      onChange({ x: left, y: top, width: edgeRight - left, height: edgeBottom - top })
    },
    [onChange, toFraction],
  )

  const end = useCallback((event: ReactPointerEvent) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const percent = (n: number) => `${n * 100}%`

  return (
    <div
      ref={frameRef}
      // The wrapper carries the photo's own aspect ratio, so the image
      // fills it exactly and a fraction of the box is a fraction of the
      // image — no letterbox arithmetic anywhere else in this file.
      style={{ aspectRatio, touchAction: 'none' }}
      className="relative w-full select-none overflow-hidden rounded-2xl bg-black"
    >
      {/* Not next/image: this is an object URL for a photo that has just
          been taken, with no known size at build time. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Foto van het scoreblad" className="size-full object-fill" draggable={false} />

      {/* Everything outside the crop, dimmed. Four strips rather than a
          box-shadow so it stays crisp on every browser. */}
      <Shade style={{ left: 0, top: 0, right: 0, height: percent(value.y) }} />
      <Shade style={{ left: 0, top: percent(value.y + value.height), right: 0, bottom: 0 }} />
      <Shade style={{ left: 0, top: percent(value.y), width: percent(value.x), height: percent(value.height) }} />
      <Shade
        style={{
          left: percent(value.x + value.width),
          top: percent(value.y),
          right: 0,
          height: percent(value.height),
        }}
      />

      <div
        onPointerDown={begin}
        onPointerMove={moveBox}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          left: percent(value.x),
          top: percent(value.y),
          width: percent(value.width),
          height: percent(value.height),
        }}
        className="absolute cursor-move ring-2 ring-mint-400"
      />

      {CORNERS.map((corner) => (
        <button
          key={corner}
          type="button"
          aria-label={`Hoek ${corner}`}
          onPointerDown={begin}
          onPointerMove={(event) => moveCorner(event, corner)}
          onPointerUp={end}
          onPointerCancel={end}
          style={{
            left: percent(corner === 'nw' || corner === 'sw' ? value.x : value.x + value.width),
            top: percent(corner === 'nw' || corner === 'ne' ? value.y : value.y + value.height),
          }}
          // A 44px target centred on the corner, with a smaller visible
          // dot inside it: the thing you can hit is bigger than the thing
          // you can see, which is the whole trick on a phone.
          className={cn(
            'absolute size-11 -translate-x-1/2 -translate-y-1/2 rounded-full',
            'before:absolute before:inset-[0.6rem] before:rounded-full before:bg-mint-400 before:shadow-lift',
          )}
        />
      ))}
    </div>
  )
}

function Shade({ style }: { style: React.CSSProperties }) {
  return <div aria-hidden style={style} className="absolute bg-black/55" />
}
