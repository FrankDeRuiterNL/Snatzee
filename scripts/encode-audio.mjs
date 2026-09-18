/**
 * Encodes the brand audio into web-friendly files.
 *
 *   npm run audio
 *
 * Sources live in brand/audio as the original stereo WAVs. Those are ~1.2 MB
 * together, which is a lot to ship to a phone for three short cues, so they
 * are re-encoded to mono mp3 and ogg (~90 KB total). Mono is inaudible for
 * cues this short and halves the payload again.
 *
 * Requires ffmpeg on PATH. The encoded files are committed, so this only
 * needs running when the source audio changes.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'brand', 'audio')
const OUT = join(ROOT, 'public', 'audio')

const TRACKS = [
  { source: 'Snatzee Audio Logo.wav', name: 'logo' },
  { source: 'Snatzee Achievement.wav', name: 'achievement' },
  { source: 'Snatzee New Score.wav', name: 'score' },
]

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('ffmpeg is required: https://ffmpeg.org/download.html')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })

for (const track of TRACKS) {
  const input = join(SRC, track.source)
  if (!existsSync(input)) {
    console.error(`Missing source audio: brand/audio/${track.source}`)
    process.exit(1)
  }

  const mp3 = join(OUT, `${track.name}.mp3`)
  const ogg = join(OUT, `${track.name}.ogg`)

  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', input,
    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', mp3,
  ])
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', input,
    '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', ogg,
  ])

  const kb = (file) => `${(statSync(file).size / 1024).toFixed(1)} KB`
  console.log(`✓ ${track.name}: ${kb(mp3)} mp3, ${kb(ogg)} ogg`)
}

console.log('\nDone.')
