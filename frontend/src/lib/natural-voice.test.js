// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* The Natural voice state (lib/natural-voice.js) against a stand-in for the NaturalVoice plugin,
   shaped like Capacitor's: a Proxy whose `then` is a native call that never answers (#42). */
const mocks = vi.hoisted(() => ({ MOBILE: true, platform: 'ios', available: true, ready: false, fail: null, info: {}, listeners: {}, calls: [] }))
vi.mock('./mobile.js', () => ({ get MOBILE() { return mocks.MOBILE } }))
vi.mock('@capacitor/core', () => {
  const impl = {
    available: async () => ({ available: mocks.available, debugModel: false }),
    status: async () => (mocks.ready ? { state: 'ready', bytes: 5 } : { state: 'none' }),
    info: async () => mocks.info,
    download: async ({ wifiOnly }) => {
      mocks.calls.push(['download', wifiOnly])
      mocks.listeners.progress?.({ fraction: 0.5 })
      if (mocks.fail) throw Object.assign(new Error(mocks.fail), { code: mocks.fail })
      mocks.ready = true
    },
    cancel: async () => { mocks.calls.push(['cancel']) },
    remove: async () => { mocks.calls.push(['remove']); mocks.ready = false },
    addListener: (ev, fn) => { mocks.listeners[ev] = fn; return { remove() {} } },
  }
  return {
    registerPlugin: name => {
      expect(name).toBe('NaturalVoice')
      return new Proxy({}, { get: (_, k) => impl[k] || (() => new Promise(() => {})) })
    },
    Capacitor: { getPlatform: () => mocks.platform },
  }
})

import * as nv from './natural-voice.js'

beforeEach(() => {
  localStorage.clear()
  Object.assign(mocks, { MOBILE: true, platform: 'ios', available: true, ready: false, fail: null, info: {}, listeners: {}, calls: [] })
  nv._resetNatural()
})

describe('naturalUsable', () => {
  const ready = { state: 'ready' }
  it('needs a natural id, English and the model', () => {
    expect(nv.naturalUsable('natural:af_heart', 'de-DE', ready)).toBe(false)
    expect(nv.naturalUsable('natural:af_heart', 'en-GB', ready)).toBe(true)
    expect(nv.naturalUsable('natural:af_heart', 'en-GB', { state: 'none' })).toBe(false)
    expect(nv.naturalUsable('Samantha', 'en-US', ready)).toBe(false)
    expect(nv.isNatural('natural:bf_emma')).toBe(true)
    expect(nv.isNatural('')).toBe(false)
  })
})

describe('autoNatural', () => {
  const ready = { state: 'ready' }
  it('is Emma for UK-like English, Heart for other English, nothing otherwise', () => {
    for (const l of ['en-GB', 'en-IE', 'en-AU', 'en-NZ']) expect(nv.autoNatural(l, ready)).toBe('natural:bf_emma')
    for (const l of ['en-US', 'en-CA', 'en']) expect(nv.autoNatural(l, ready)).toBe('natural:af_heart')
    expect(nv.autoNatural('de-DE', ready)).toBe('')
    expect(nv.autoNatural('en-GB', { state: 'none' })).toBe('')
    nv.setNaturalAllowed(false)
    expect(nv.autoNatural('en-GB', ready)).toBe('')
    nv.setNaturalAllowed(true)
  })
})

describe('the native side', () => {
  it('reads the model state and Apple\'s size', async () => {
    mocks.ready = true; mocks.info = { downloadSize: 123 }
    await nv.refreshNatural()
    expect(nv.naturalState()).toMatchObject({ available: true, state: 'ready', bytes: 5, total: 123, error: null })
  })
  it('web and Android have no plugin: not available, nothing throws', async () => {
    mocks.MOBILE = false
    expect(await nv.refreshNatural()).toMatchObject({ available: false, state: 'none' })
    expect(await nv.downloadNatural()).toBe('unavailable')
    nv._resetNatural(); mocks.MOBILE = true; mocks.platform = 'android'
    expect(await nv.refreshNatural()).toMatchObject({ available: false })
  })
  it('download shows progress, then ready', async () => {
    await nv.refreshNatural()
    const seen = []
    nv.onNatural(() => seen.push({ ...nv.naturalState() }))
    expect(await nv.downloadNatural({ wifiOnly: false })).toBe('ready')
    expect(mocks.calls[0]).toEqual(['download', false])
    expect(seen.some(s => s.state === 'downloading' && s.fraction === 0.5)).toBe(true)
    expect(nv.naturalState()).toMatchObject({ state: 'ready', fraction: null, error: null })
    expect(typeof nv.naturalState().installedAt).toBe('number')
  })
  it('a failed download sets the code and goes back to none; the next one clears it', async () => {
    await nv.refreshNatural()
    mocks.fail = 'failed'
    expect(await nv.downloadNatural()).toBe('failed')
    expect(nv.naturalState()).toMatchObject({ state: 'none', error: 'failed', fraction: null })
    expect(nv.naturalState().installedAt).toBeUndefined()
    mocks.fail = null
    await nv.downloadNatural()
    expect(nv.naturalState().error).toBeNull()
  })
  it('wifi-only comes from the prefs (on by default) and a cancel is not an error', async () => {
    expect(nv.readPrefs()).toEqual({ wifiOnly: true })
    await nv.refreshNatural()
    mocks.fail = 'cancelled'
    expect(await nv.downloadNatural()).toBe('cancelled')
    expect(mocks.calls[0]).toEqual(['download', true])
    expect(nv.naturalState()).toMatchObject({ state: 'none', error: null })
  })
  it('remove goes back to none', async () => {
    mocks.ready = true
    await nv.refreshNatural()
    expect(await nv.removeNatural()).toBe(true)
    expect(nv.naturalState().state).toBe('none')
  })
})

describe('Better voices off', () => {
  it('a Natural pick falls back to Automatic and comes back, nothing cleared', async () => {
    mocks.ready = true
    await nv.refreshNatural()
    const { pickedVoice, storedVoice, setPickedVoice } = await import('./speech.js')
    setPickedVoice('natural:af_heart')
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(pickedVoice()).toBe('natural:af_heart')
    let n = 0
    const off = nv.onNatural(() => n++)
    nv.setNaturalAllowed(false)
    expect(nv.naturalAllowed()).toBe(false)
    expect(pickedVoice()).toBe('')
    expect(storedVoice()).toBe('natural:af_heart')
    expect(n).toBe(1)
    nv.setNaturalAllowed(true)
    expect(pickedVoice()).toBe('natural:af_heart')
    off(); vi.unstubAllGlobals()
  })
})
