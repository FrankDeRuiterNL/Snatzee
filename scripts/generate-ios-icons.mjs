/**
 * Exports the Lucide icons the web app uses into the iOS asset catalog.
 *
 * The iOS app draws the exact same glyphs as the website rather than the
 * nearest SF Symbol, so both platforms look alike. Each icon becomes a
 * vector SVG image set marked as a template, which SwiftUI tints
 * with `.foregroundStyle` like any symbol.
 *
 * The list is every icon imported from lucide-react anywhere in src/, so
 * running this after adding an icon on the web makes it available on iOS:
 *
 *   node scripts/generate-ios-icons.mjs
 *
 * Asset names are "lucide.<kebab-name>", e.g. Image("lucide.house").
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LUCIDE = join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm')
const OUT = join(ROOT, 'ios', 'Snatzee', 'Resources', 'Icons.xcassets')

// Component name -> icon file, from the package's own export list.
const exportsFile = readFileSync(join(LUCIDE, 'lucide-react.mjs'), 'utf8')
const fileFor = new Map()
for (const match of exportsFile.matchAll(/export \{([^}]+)\} from '\.\/icons\/([^']+)\.mjs'/g)) {
  for (const part of match[1].split(',')) {
    const name = part.trim().replace(/^default as /, '')
    fileFor.set(name, match[2])
  }
}

// Every icon the web app imports.
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : []
  })
}
const used = new Set()
for (const file of walk(join(ROOT, 'src'))) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]
      if (name && !name.startsWith('type ')) used.add(name)
    }
  }
}
// Used by the iOS app without an equivalent web import.
for (const extra of ['X', 'ChevronDown', 'Mail', 'KeyRound', 'WifiOff']) used.add(extra)

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

function toSvg(node) {
  const children = node
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key}="${escape(value)}"`)
        .join(' ')
      return `  <${tag} ${attributes}/>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${children}\n</svg>\n`
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'Contents.json'), `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`)

const written = new Set()
for (const name of [...used].sort()) {
  const file = fileFor.get(name)
  if (!file) {
    console.warn(`! ${name} is not a lucide-react icon, skipped`)
    continue
  }
  if (written.has(file)) continue
  const { __iconData } = await import(pathToFileURL(join(LUCIDE, 'icons', `${file}.mjs`)).href)
  const dir = join(OUT, `lucide.${file}.imageset`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${file}.svg`), toSvg(__iconData.node))
  writeFileSync(
    join(dir, 'Contents.json'),
    `${JSON.stringify(
      {
        images: [{ filename: `${file}.svg`, idiom: 'universal' }],
        info: { author: 'xcode', version: 1 },
        properties: { 'preserves-vector-representation': true, 'template-rendering-intent': 'template' },
      },
      null,
      2,
    )}\n`,
  )
  written.add(file)
}

console.log(`✓ ${written.size} Lucide icons in ios/Snatzee/Resources/Icons.xcassets`)
