/**
 * Converts the original Snatzee artwork into every icon and iOS splash size.
 *
 *   npm run brand
 *
 * Sources (the only artwork used — nothing is redrawn or recreated):
 *   brand/icon-source.png    the app icon / logo
 *   brand/splash-source.png  the launch screen
 *
 * Replace either file and re-run to regenerate the whole set.
 */
import { Resvg } from '@resvg/resvg-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentBounds, decodePng } from './brand/png.mjs'
import { ICON_TARGETS, MASKABLE_TARGETS, splashTargets } from './brand/devices.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICON_DIR = join(ROOT, 'public', 'icons')
const SPLASH_DIR = join(ROOT, 'public', 'splash')
const BRAND_DIR = join(ROOT, 'public', 'brand')

const ICON_SOURCE = join(ROOT, 'brand', 'icon-source.png')
const SPLASH_SOURCE = join(ROOT, 'brand', 'splash-source.png')

/** Canvas colour behind the icon artwork — matches the logo tile. */
const ICON_BACKGROUND = '#F7F6F3'
/** The launch artwork ships on an opaque white field; match it exactly. */
const SPLASH_BACKGROUND = '#FFFFFF'

for (const [label, path] of [
  ['brand/icon-source.png', ICON_SOURCE],
  ['brand/splash-source.png', SPLASH_SOURCE],
]) {
  if (!existsSync(path)) {
    console.error(`Missing source artwork: ${label}`)
    process.exit(1)
  }
}

const iconBuffer = readFileSync(ICON_SOURCE)
const splashBuffer = readFileSync(SPLASH_SOURCE)

const iconUri = `data:image/png;base64,${iconBuffer.toString('base64')}`
const splashUri = `data:image/png;base64,${splashBuffer.toString('base64')}`

/**
 * Trim the transparent margin around the logo so icons are filled edge to
 * edge instead of floating in dead space.
 */
const iconImage = decodePng(iconBuffer)
const imageWidth = iconImage?.width ?? 1024
const imageHeight = iconImage?.height ?? 1024

const bounds = contentBounds(iconBuffer) ?? { x: 0, y: 0, width: imageWidth, height: imageHeight }

// Crop to a square around the artwork so non-square exports never distort it.
const side = Math.max(bounds.width, bounds.height)
const cropX = bounds.x - (side - bounds.width) / 2
const cropY = bounds.y - (side - bounds.height) / 2

console.log(
  `→ icon artwork trimmed to ${bounds.width}×${bounds.height} at (${bounds.x}, ${bounds.y})`,
)

function render(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return resvg.render().asPng()
}

/**
 * `scale` shrinks the artwork inside the canvas. Maskable icons need their
 * content inside the inner 80% safe zone, because launchers crop to a circle.
 */
function iconSvg(size, scale = 1) {
  const inset = ((1 - scale) / 2) * side

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${side} ${side}">
  <rect width="${side}" height="${side}" fill="${ICON_BACKGROUND}"/>
  <svg x="${inset}" y="${inset}" width="${side * scale}" height="${side * scale}" viewBox="${cropX} ${cropY} ${side} ${side}">
    <image href="${iconUri}" x="0" y="0" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none"/>
  </svg>
</svg>`
}

function splashSvg(width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${SPLASH_BACKGROUND}"/>
  <image href="${splashUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
</svg>`
}

mkdirSync(ICON_DIR, { recursive: true })
mkdirSync(SPLASH_DIR, { recursive: true })
mkdirSync(BRAND_DIR, { recursive: true })

let count = 0

for (const target of ICON_TARGETS) {
  writeFileSync(join(ICON_DIR, target.file), render(iconSvg(target.size), target.size))
  count += 1
}
console.log(`✓ ${ICON_TARGETS.length} app icons`)

for (const target of MASKABLE_TARGETS) {
  writeFileSync(join(ICON_DIR, target.file), render(iconSvg(target.size, 0.8), target.size))
  count += 1
}
console.log(`✓ ${MASKABLE_TARGETS.length} maskable icons`)

const splashes = splashTargets()
for (const target of splashes) {
  const svg = splashSvg(target.width, target.height)
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } })
  writeFileSync(join(SPLASH_DIR, target.file), resvg.render().asPng())
  count += 1
}
console.log(`✓ ${splashes.length} iOS splash screens`)

/**
 * A dice-only crop of the same artwork. The full logo already contains the
 * wordmark, which turns to mush next to a text logo at header sizes, so
 * compact placements use just the dice.
 */
function markSvg(size) {
  /*
   * Compact placements pair the dice with live text, because the logo's own
   * wordmark turns to mush at header sizes. These fractions describe where the
   * dice band sits inside the artwork's content box, so the crop survives the
   * artwork being re-exported with different padding.
   */
  const FRACTION = { x: 0.067, y: 0.073, width: 0.87, height: 0.583 }

  const src = {
    x: bounds.x + bounds.width * FRACTION.x,
    y: bounds.y + bounds.height * FRACTION.y,
    width: bounds.width * FRACTION.width,
    height: bounds.height * FRACTION.height,
  }

  const canvas = 840
  const margin = 45
  const scale = (canvas - margin * 2) / src.width
  const destHeight = src.height * scale
  const destY = (canvas - destHeight) / 2

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${canvas} ${canvas}">
  <defs>
    <clipPath id="tile">
      <rect width="${canvas}" height="${canvas}" rx="${canvas * 0.24}"/>
    </clipPath>
    <clipPath id="band">
      <rect x="${margin}" y="${destY}" width="${canvas - margin * 2}" height="${destHeight}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="${canvas}" height="${canvas}" fill="${ICON_BACKGROUND}"/>
    <g clip-path="url(#band)">
      <g transform="translate(${margin} ${destY}) scale(${scale}) translate(${-src.x} ${-src.y})">
        <image href="${iconUri}" x="0" y="0" width="${imageWidth}" height="${imageHeight}"/>
      </g>
    </g>
  </g>
</svg>`
}

// In-app logo assets, straight from the original artwork.
writeFileSync(join(BRAND_DIR, 'logo.png'), render(iconSvg(512), 512))
writeFileSync(join(BRAND_DIR, 'mark.png'), render(markSvg(256), 256))
writeFileSync(join(BRAND_DIR, 'logo-source.png'), iconBuffer)
count += 3
console.log('✓ 3 in-app logo assets')

/* --------------------------------------------------------------------- */
/* Generated <link> tags for the iOS launch images                        */
/* --------------------------------------------------------------------- */

const links = splashes
  .map(
    (target) =>
      `      <link\n        rel="apple-touch-startup-image"\n        media="${target.media}"\n        href="/splash/${target.file}"\n      />`,
  )
  .join('\n')

writeFileSync(
  join(ROOT, 'src', 'components', 'layout', 'apple-splash-links.tsx'),
  `/**
 * GENERATED FILE — run \`npm run brand\` to regenerate.
 *
 * iOS only shows a launch image when a link tag matches the device screen
 * exactly, so each supported size and orientation is listed explicitly.
 */
export function AppleSplashLinks() {
  return (
    <>
${links}
    </>
  )
}
`,
)
console.log('✓ src/components/layout/apple-splash-links.tsx')
console.log(`\nDone — ${count} files written from the original artwork.`)
