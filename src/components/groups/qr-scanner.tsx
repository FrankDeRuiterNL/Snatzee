'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraOff, Loader2 } from 'lucide-react'

/**
 * Scans a QR code from the rear camera.
 *
 * Decoding goes through the browser's own BarcodeDetector where there is
 * one — it is hardware accelerated and costs nothing — and falls back to
 * jsQR otherwise, which is what iOS needs: Safari still ships no
 * BarcodeDetector at the time of writing.
 *
 * jsQR is a few hundred kilobytes, so it is imported dynamically: nobody
 * pays for it until they actually open the scanner.
 */

type Status = 'starting' | 'scanning' | 'denied' | 'unavailable' | 'insecure'

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (value: string) => void
  onError?: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<Status>('starting')

  // Held in a ref so the scan loop can stop itself without being restarted
  // by a state change.
  const doneRef = useRef(false)
  const onResultRef = useRef(onResult)

  // Kept current in an effect rather than during render, so the scan loop
  // always calls the latest handler without being torn down and restarted
  // (which would drop the camera stream) every time the parent re-renders.
  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const report = useCallback(
    (next: Status, message?: string) => {
      setStatus(next)
      if (message) onError?.(message)
    },
    [onError],
  )

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    doneRef.current = false

    async function start() {
      // getUserMedia only exists on a secure origin. Saying so beats a
      // generic "camera failed".
      if (typeof window === 'undefined' || !window.isSecureContext) {
        report('insecure', 'De camera werkt alleen via https.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        report('unavailable', 'Deze browser geeft geen toegang tot de camera.')
        return
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (error) {
        const name = (error as DOMException)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          report('denied', 'Geef Snatzee toegang tot de camera om te kunnen scannen.')
        } else {
          report('unavailable', 'Er is geen camera beschikbaar.')
        }
        return
      }

      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      // Without playsInline iOS takes the video fullscreen instead.
      video.setAttribute('playsinline', 'true')
      await video.play().catch(() => {})
      setStatus('scanning')

      let detector: BarcodeDetectorLike | null = null
      const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike })
        .BarcodeDetector
      if (Detector) {
        try {
          detector = new Detector({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }

      let decodeFallback: typeof import('jsqr').default | null = null
      if (!detector) {
        decodeFallback = (await import('jsqr')).default
      }

      const tick = async () => {
        if (doneRef.current) return

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            let value: string | null = null

            if (detector) {
              const found = await detector.detect(video)
              value = found[0]?.rawValue ?? null
            } else if (decodeFallback && canvasRef.current) {
              const canvas = canvasRef.current
              // Downscaled: jsQR runs over every pixel, and a full 1080p
              // frame at 30fps is more work than a phone should be doing.
              const width = 480
              const height = Math.round((video.videoHeight / video.videoWidth) * width) || 480
              canvas.width = width
              canvas.height = height
              const context = canvas.getContext('2d', { willReadFrequently: true })
              if (context) {
                context.drawImage(video, 0, 0, width, height)
                const image = context.getImageData(0, 0, width, height)
                value = decodeFallback(image.data, width, height)?.data ?? null
              }
            }

            if (value) {
              doneRef.current = true
              onResultRef.current(value)
              return
            }
          } catch {
            // A frame that cannot be decoded is normal; try the next one.
          }
        }

        frame = requestAnimationFrame(() => void tick())
      }

      frame = requestAnimationFrame(() => void tick())
    }

    void start()

    return () => {
      doneRef.current = true
      cancelAnimationFrame(frame)
      // Releases the camera: without this the indicator light stays on.
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [report])

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-canvas ring-1 ring-hairline">
        <video
          ref={videoRef}
          muted
          playsInline
          className="size-full object-cover"
          aria-label="Camerabeeld om een QR-code te scannen"
        />
        <canvas ref={canvasRef} className="hidden" />

        {status === 'scanning' && (
          <>
            {/* Aiming frame, so it is obvious where to hold the code. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-[18%] rounded-2xl ring-2 ring-mint-400/80"
            />
            <span className="sr-only" role="status">
              Camera actief, richt op de QR-code
            </span>
          </>
        )}

        {status === 'starting' && (
          <span className="absolute inset-0 grid place-items-center text-ink-muted">
            <Loader2 className="size-7 animate-spin" aria-hidden />
          </span>
        )}

        {(status === 'denied' || status === 'unavailable' || status === 'insecure') && (
          <span className="absolute inset-0 grid place-items-center gap-2 p-6 text-center">
            <CameraOff className="mx-auto size-7 text-ink-muted" aria-hidden />
            <span className="text-sm text-ink-soft">
              {status === 'denied'
                ? 'Geen toegang tot de camera. Sta dit toe in je browser- of systeeminstellingen.'
                : status === 'insecure'
                  ? 'De camera werkt alleen op een https-adres.'
                  : 'Er is geen camera beschikbaar op dit apparaat.'}
            </span>
          </span>
        )}
      </div>

      <p className="text-center text-sm text-ink-muted">
        Richt op de QR-code op het scherm van de ander.
      </p>
    </div>
  )
}
