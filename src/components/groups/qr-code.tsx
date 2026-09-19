'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Renders an invite link as a QR code.
 *
 * Drawn light-on-dark-modules on a white card rather than in the app's own
 * palette: a dark QR on a dark background is not reliably scannable, and a
 * code that looks right but will not scan is worse than no code at all.
 */
export function InviteQrCode({ value, size = 232 }: { value: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      // Medium recovery: survives a fingerprint or a glare spot on the
      // screen it is being scanned from.
      errorCorrectionLevel: 'M',
      color: { dark: '#07131fff', light: '#ffffffff' },
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })

    return () => {
      cancelled = true
    }
  }, [value, size])

  if (failed) {
    return (
      <p className="rounded-2xl bg-canvas p-4 text-center text-sm text-ink-muted">
        QR-code maken is niet gelukt. Gebruik de code hierboven.
      </p>
    )
  }

  return (
    <div className="mx-auto w-fit rounded-3xl bg-white p-3 shadow-float">
      <canvas ref={canvasRef} aria-label="QR-code met uitnodigingslink" role="img" />
    </div>
  )
}
