import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REQUIRED, voicePackManifest, buildVoicePack } from './make-voice-pack.mjs'

// A fake model folder holding every required entry (folders get a nested file).
function fakeModel(skip) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voicepack-'))
  for (const name of REQUIRED) {
    if (name === skip) continue
    const p = path.join(dir, name)
    if (name.endsWith('.mlmodelc')) {
      fs.mkdirSync(path.join(p, 'weights'), { recursive: true })
      fs.writeFileSync(path.join(p, 'weights', 'weight.bin'), 'w'.repeat(name.length))
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, 'x'.repeat(name.length))
    }
  }
  fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk')
  return dir
}

test('manifest lists every file once under voice-natural-en/, plus files.json', () => {
  const model = fakeModel()
  const { manifest, sizes } = buildVoicePack(model)
  const dests = manifest.fileSelectors.map(s => s.fileDestination)
  assert.equal(new Set(dests).size, dests.length)
  assert.ok(dests.every(d => d.startsWith('voice-natural-en/')))
  assert.ok(dests.includes('voice-natural-en/files.json'))
  assert.ok(dests.includes('voice-natural-en/voices/bf_emma.json'))
  assert.ok(!dests.some(d => d.includes('.DS_Store')))
  assert.equal(dests.length, Object.keys(sizes).length + 1)
  assert.equal(manifest.assetPackID, 'voice-natural-en')
  assert.deepEqual(manifest.platforms, ['iOS'])
})

test('files.json holds every leaf file with its real size, not itself', () => {
  const model = fakeModel()
  const { sizes } = buildVoicePack(model)
  assert.equal(sizes['voices/af_heart.json'], 'voices/af_heart.json'.length)
  assert.equal(sizes['kokoro_5s.mlmodelc/weights/weight.bin'], 'kokoro_5s.mlmodelc'.length)
  assert.ok(!('files.json' in sizes))
})

test('a missing voices/bf_emma.json throws', () => {
  assert.throws(() => buildVoicePack(fakeModel('voices/bf_emma.json')), /bf_emma/)
})

test('voicePackManifest is pure', () => {
  assert.equal(voicePackManifest(['a']).fileSelectors[0].fileSource, 'a')
})
