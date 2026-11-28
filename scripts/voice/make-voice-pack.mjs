#!/usr/bin/env node
// The manifest of the Natural voice asset pack (Background Assets), for `xcrun ba-package`.
//
//   node scripts/voice/make-voice-pack.mjs <model-dir> <out-dir>
//
// <model-dir> is the Kokoro model folder (docs/APP_STORES.md "Natural voice pack"). This writes
//   <model-dir>/files.json  { "<path inside the pack>": <bytes> } for every other file: the phone
//                           cannot list a pack's files, so the pack carries its own list
//   <out-dir>/manifest.json the manifest; fileSource is relative to <model-dir>, the sourceRoot
// and refuses a folder missing any entry the app needs.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PACK = 'voice-natural-en'

// Plan Ruling 4: what the pack holds, by top-level name (.mlmodelc are folders).
export const REQUIRED = [
  'kokoro_5s.mlmodelc', 'G2PEncoder.mlmodelc', 'G2PDecoder.mlmodelc',
  'us_gold.json', 'us_silver.json', 'gb_gold.json', 'gb_silver.json',
  'vocab_index.json', 'g2p_vocab.json',
  'voices/af_heart.json', 'voices/am_michael.json', 'voices/bf_emma.json',
]

/** The manifest ba-package takes; `files` are paths inside the pack. */
export function voicePackManifest(files) {
  return {
    assetPackID: PACK,
    downloadPolicy: { onDemand: {} },
    fileSelectors: files.map(f => ({ fileSource: f, fileDestination: `${PACK}/${f}` })),
    platforms: ['iOS'],
  }
}

function walk(root, rel = '') {
  const sizes = {}
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) Object.assign(sizes, walk(root, r))
    else if (r !== 'files.json') sizes[r] = fs.statSync(path.join(root, r)).size
  }
  return sizes
}

/** { sizes, manifest } for a model folder; throws when a required entry is missing. */
export function buildVoicePack(modelDir) {
  const missing = REQUIRED.filter(n => !fs.existsSync(path.join(modelDir, n)))
  if (missing.length) throw new Error(`model folder is missing: ${missing.join(', ')}`)
  const sizes = walk(modelDir)
  return { sizes, manifest: voicePackManifest([...Object.keys(sizes), 'files.json']) }
}

function main([modelDir, outDir]) {
  if (!modelDir || !outDir) {
    console.error('usage: make-voice-pack.mjs <model-dir> <out-dir>')
    process.exit(2)
  }
  const { sizes, manifest } = buildVoicePack(modelDir)
  fs.writeFileSync(path.join(modelDir, 'files.json'), JSON.stringify(sizes, null, 2) + '\n')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`${manifest.fileSelectors.length} files in ${PACK}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2))
