#!/usr/bin/env node
/**
 * Scanner bundle audit (BC-13 / NP-11).
 *
 * `html5-qrcode` (plus its bundled ZXing decoder) is the largest script in the
 * portal. This script inspects a production Nuxt build and fails if the library
 * has leaked into a chunk that is imported **statically** — i.e. if the scanner
 * page's manual search and event picker can no longer render before the camera
 * bundle arrives.
 *
 * Usage (after `npm run build`):
 *   node tools/a11y/check-scanner-bundle.mjs
 *   A11Y_OUTPUT_DIR=.output/public node tools/a11y/check-scanner-bundle.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../..')
const outputDir = process.env.A11Y_OUTPUT_DIR
  ? path.resolve(process.env.A11Y_OUTPUT_DIR)
  : path.join(repoRoot, '.output/public')
const nuxtDir = path.join(outputDir, '_nuxt')

const MARKER = /BarcodeFormat|ZXing|html5-qrcode/
const USAGE_MARKER = /Html5Qrcode/
const PAGE_MARKER = /Scan a student QR or ID/
const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`
const gz = bytes => `${(gzipSync(bytes).length / 1024).toFixed(1)} KB gzip`

let files
try {
  files = (await readdir(nuxtDir)).filter(name => name.endsWith('.js'))
} catch {
  console.error(`[scanner-bundle] No build found at ${nuxtDir}. Run \`npm run build\` first.`)
  process.exit(2)
}

if (files.length === 0) {
  console.error(`[scanner-bundle] ${nuxtDir} contains no JavaScript chunks.`)
  process.exit(2)
}

const chunks = new Map()
for (const file of files) {
  const bytes = await readFile(path.join(nuxtDir, file))
  chunks.set(file, {
    file,
    bytes,
    source: bytes.toString('utf8'),
    staticImports: new Set(),
    dynamicImports: new Set()
  })
}

for (const chunk of chunks.values()) {
  // Static edges: `from"./X.js"` and side-effect `import"./X.js"`.
  for (const match of chunk.source.matchAll(/\bfrom\s*["']\.\/([\w.-]+\.js)["']/g)) {
    if (match[1]) chunk.staticImports.add(match[1])
  }
  for (const match of chunk.source.matchAll(/\bimport\s*["']\.\/([\w.-]+\.js)["']/g)) {
    if (match[1]) chunk.staticImports.add(match[1])
  }
  for (const match of chunk.source.matchAll(/\bimport\s*\(\s*[`"']\.\/([\w.-]+\.js)[`"']/g)) {
    if (match[1]) chunk.dynamicImports.add(match[1])
  }
  // Vite's dependency list (`__vite__mapDeps`) names async chunks too; it is
  // already covered by the import() match above, so ignore it as an edge.
}

const scannerChunks = [...chunks.values()].filter(chunk => MARKER.test(chunk.source))
const usageChunks = [...chunks.values()].filter(chunk => USAGE_MARKER.test(chunk.source) && !MARKER.test(chunk.source))

if (scannerChunks.length === 0) {
  console.error('[scanner-bundle] Could not find the html5-qrcode chunk in this build.')
  console.error('  The scanner may have been tree-shaken away, or the build layout changed.')
  process.exit(1)
}

const failures = []
const rows = []

for (const chunk of scannerChunks) {
  const staticImporters = [...chunks.values()]
    .filter(other => other.staticImports.has(chunk.file))
    .map(other => other.file)
  const dynamicImporters = [...chunks.values()]
    .filter(other => other.dynamicImports.has(chunk.file))
    .map(other => other.file)

  if (PAGE_MARKER.test(chunk.source)) {
    failures.push(`${chunk.file} mixes the scanner library with the scanner page UI.`)
  }
  if (staticImporters.length > 0) {
    failures.push(
      `${chunk.file} is imported STATICALLY by ${staticImporters.join(', ')} — it is in a shared/entry chunk.`
    )
  }
  if (staticImporters.length === 0 && dynamicImporters.length === 0) {
    failures.push(
      `${chunk.file} contains the scanner library but nothing imports it — it looks like an entry/shared root.`
    )
  }

  rows.push({
    chunk: chunk.file,
    size: chunk.bytes.length,
    gzipSize: gzipSync(chunk.bytes).length,
    staticImporters: staticImporters.length > 0 ? staticImporters.join(', ') : '—',
    dynamicImporters: dynamicImporters.length > 0 ? dynamicImporters.join(', ') : '—'
  })
}

const totalJs = [...chunks.values()].reduce((sum, chunk) => sum + chunk.bytes.length, 0)
const largest = [...chunks.values()]
  .sort((a, b) => b.bytes.length - a.bytes.length)
  .slice(0, 5)

console.log(`[scanner-bundle] ${files.length} JS chunks, ${kb(totalJs)} raw total in ${nuxtDir}`)
console.log('')
console.log('Scanner library chunk(s):')
for (const row of rows) {
  console.log(`  ${row.chunk}  ${kb(row.size)}  (${kb(row.gzipSize)} gzip)`)
  console.log(`    static importers : ${row.staticImporters}`)
  console.log(`    dynamic importers: ${row.dynamicImporters}`)
}
if (usageChunks.length > 0) {
  console.log('')
  console.log('Chunk(s) that call the scanner (the library itself must not live here):')
  for (const chunk of usageChunks) {
    console.log(`  ${chunk.file}  ${kb(chunk.bytes.length)}  (${gz(chunk.bytes)})`)
  }
}
console.log('')
console.log('Largest chunks (for the low-end Android budget):')
for (const chunk of largest) {
  console.log(`  ${chunk.file}  ${kb(chunk.bytes.length)}  (${gz(chunk.bytes)})`)
}

const scannerBytes = scannerChunks.reduce((sum, chunk) => sum + chunk.bytes.length, 0)
const scannerGzip = scannerChunks.reduce((sum, chunk) => sum + gzipSync(chunk.bytes).length, 0)
console.log('')
console.log(`Scanner budget: ${kb(scannerBytes)} raw / ${kb(scannerGzip)} gzip across ${scannerChunks.length} lazy chunk(s).`)
console.log('Target from NP-11: the scanner route bundle stays under 150 KB of JavaScript (compressed) excluding the camera library.')

if (failures.length > 0) {
  console.error('')
  for (const failure of failures) console.error(`[scanner-bundle] FAIL: ${failure}`)
  process.exit(1)
}

console.log('[scanner-bundle] OK — html5-qrcode is only reachable through a dynamic import.')
