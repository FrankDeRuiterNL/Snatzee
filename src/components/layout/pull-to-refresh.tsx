'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { haptic } from '@/lib/haptics'

/**
 * Drag down at the top of the page to reload the data.
 *
 * The app needs its own, because `overscroll-behavior-y: none` on the body
 * turns off the browser's — that rule is there to stop the whole document
 * rubber-banding behind the app shell, and an installed app has no reload
 * button to fall back on.
 *
 * Refreshing means router.refresh(): every page here is a server component
 * reading from Supabase, so re-rendering on the server is exactly the
 * "fetch it again" the gesture promises. useTransition tells us when that
 * has actually finished, so the spinner reflects real work rather than a
 * guessed duration.
 */

/** How far to drag before it will fire. */
const THRESHOLD = 72
/** Beyond this the indicator stops following the finger. */
const MAX_PULL = 110
/** Drag feels weighted rather than 1:1 with the finger. */
const RESISTANCE = 0.5

export function PullToRefresh() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [pull, setPull] = useState(0)
  const [armed, setArmed] = useState(false)

  // The listeners are attached once and must not be rebuilt on every
  // render, so the live values they read live in refs.
  const pullRef = useRef(0)
  const activeRef = useRef(false)
  const armedRef = useRef(false)

  const refresh = useCallback(() => {
    haptic('medium')
    startTransition(() => router.refresh())
  }, [router])

  useEffect(() => {
    // Pointer-coarse only: a mouse has no pull gesture, and a trackpad
    // would fire this by accident.
    if (!window.matchMedia('(pointer: coarse)').matches) return

    let startY = 0
    let startX = 0

    const reset = () => {
      activeRef.current = false
      armedRef.current = false
      pullRef.current = 0
      setPull(0)
      setArmed(false)
    }

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return reset()
      // Only from the very top, and never out of a sheet or dialog, which
      // scrolls its own content.
      if (window.scrollY > 0) return
      const target = event.target as HTMLElement | null
      if (target?.closest('[role="dialog"], [data-sonner-toaster]')) return

      const touch = event.touches[0]
      if (!touch) return
      startY = touch.clientY
      startX = touch.clientX
      activeRef.current = true
    }

    const onMove = (event: TouchEvent) => {
      if (!activeRef.current) return

      const touch = event.touches[0]
      if (!touch) return
      const delta = touch.clientY - startY
      const sideways = Math.abs(touch.clientX - startX)

      // A mostly-sideways swipe belongs to a horizontal scroller — the
      // ranking chips and the emoji row sit at the top of the page, where
      // this gesture also starts. Claiming it would break them.
      if (sideways > Math.abs(delta)) {
        if (pullRef.current > 0) reset()
        else activeRef.current = false
        return
      }

      // Scrolling up, or the page has scrolled away from the top: this is
      // an ordinary scroll, so let go of it entirely.
      if (delta <= 0 || window.scrollY > 0) {
        if (pullRef.current > 0) reset()
        else activeRef.current = false
        return
      }

      // Only now take the gesture over, so normal scrolling is untouched.
      if (event.cancelable) event.preventDefault()

      const next = Math.min(delta * RESISTANCE, MAX_PULL)
      pullRef.current = next
      setPull(next)

      const nowArmed = next >= THRESHOLD
      if (nowArmed !== armedRef.current) {
        armedRef.current = nowArmed
        setArmed(nowArmed)
        // A tick at the point it would fire, the way the OS gesture does.
        if (nowArmed) haptic('light')
      }
    }

    const onEnd = () => {
      if (!activeRef.current) return
      const shouldRefresh = pullRef.current >= THRESHOLD
      reset()
      if (shouldRefresh) refresh()
    }

    // touchmove must be non-passive: preventDefault is what stops the page
    // from scrolling underneath the gesture.
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [refresh])

  const visible = pull > 0 || pending
  if (!visible) return null

  // While refreshing the indicator sits at a fixed height instead of
  // following a finger that has already been lifted.
  const offset = pending ? THRESHOLD : pull

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${offset}px)`,
        paddingTop: 'env(safe-area-inset-top, 0px)',
        transition: pending ? 'transform 160ms ease-out' : undefined,
      }}
    >
      <span
        className={`grid size-10 place-items-center rounded-full bg-surface-elevated shadow-float ring-1 ring-hairline-strong ${
          armed || pending ? 'text-mint-400' : 'text-ink-muted'
        }`}
      >
        <RefreshCw
          className={`size-5 ${pending ? 'animate-spin' : ''}`}
          style={pending ? undefined : { transform: `rotate(${pull * 3}deg)` }}
        />
      </span>
      <span className="sr-only" role="status">
        {pending ? 'Bezig met verversen' : armed ? 'Laat los om te verversen' : ''}
      </span>
    </div>
  )
}
