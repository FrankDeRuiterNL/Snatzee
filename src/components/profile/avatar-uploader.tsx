'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { publicStorageUrl } from '@/lib/supabase/env'
import { AVATAR_MAX_BYTES } from '@/lib/constants'
import { prepareAvatar } from '@/lib/image'
import { haptic } from '@/lib/haptics'

/**
 * What the picker offers.
 *
 * HEIC and HEIF are listed because that is what an iPhone actually stores.
 * Safari usually hands over a converted JPEG, but not always, and a file
 * the picker refuses to show is worse than one we can explain.
 * `image/*` is the catch-all for pickers that ignore the specific types.
 */
const ACCEPTED = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/*',
]

export function AvatarUploader({
  userId,
  value,
  name,
  onChange,
  size = 'xl',
}: {
  userId: string
  value: string | null
  name: string | null
  onChange: (url: string | null) => void
  size?: 'lg' | 'xl'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Kies een afbeelding')
      return
    }

    setUploading(true)

    // Downscaled before anything is measured. A phone photo is several
    // megabytes and the avatar is drawn at 96px, so checking the original
    // size would reject photos for no reason — see src/lib/image.ts.
    const prepared = await prepareAvatar(file)

    if (!prepared) {
      setUploading(false)
      toast.error('Deze afbeelding kan niet worden gelezen', {
        description: 'Probeer een JPG, PNG of WEBP.',
      })
      return
    }

    // Only reachable if the re-encode somehow grew the file, which a
    // huge animated GIF could manage.
    if (prepared.blob.size > AVATAR_MAX_BYTES) {
      setUploading(false)
      toast.error('Afbeelding is te groot', { description: 'Maximaal 2 MB.' })
      return
    }

    const supabase = getSupabaseBrowserClient()
    const path = `${userId}/avatar-${Date.now()}.${prepared.extension}`

    const { error } = await supabase.storage.from('avatars').upload(path, prepared.blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: prepared.contentType,
    })

    if (error) {
      setUploading(false)
      toast.error('Uploaden is niet gelukt', { description: error.message })
      return
    }

    // Built from the canonical URL rather than the client's (which follows
    // the current domain), so the value stored on the profile is the same
    // whichever domain the upload was made from.
    setUploading(false)
    haptic('success')
    onChange(publicStorageUrl('avatars', path))
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar src={value} name={name} size={size} className="ring-4 ring-white/10 shadow-lift" />

        <button
          type="button"
          onClick={() => {
            haptic('light')
            inputRef.current?.click()
          }}
          disabled={uploading}
          aria-label={value ? 'Profielfoto vervangen' : 'Profielfoto uploaden'}
          className="press absolute -bottom-1 -right-1 grid size-11 place-items-center rounded-full bg-mint-500 text-navy-950 shadow-soft ring-4 ring-canvas-soft disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-5" aria-hidden strokeWidth={2.4} />
          )}
        </button>
      </div>

      {value && (
        <button
          type="button"
          onClick={() => {
            haptic('light')
            onChange(null)
          }}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted"
        >
          <Trash2 className="size-4" aria-hidden />
          Foto verwijderen
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}
