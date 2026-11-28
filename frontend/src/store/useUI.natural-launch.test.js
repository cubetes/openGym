// @vitest-environment happy-dom
// The Natural voice is picked on one run and spoken on the next: the model's state is read when
// the app starts and each time it comes back, not only when Settings > Voice is open.
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ active: null }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true, onAppActive: cb => { mocks.active = cb } }))
vi.mock('../lib/rest-alert.js', () => ({ armRestAlert: vi.fn(), holdRestAlert: vi.fn(), disarmRestAlert: vi.fn(), bindNativeRest: vi.fn(), onVoiceLine: () => () => {} }))
vi.mock('../lib/sound.js', () => ({ prepareAudio: vi.fn(), beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ ok: true })) }))
// A stand-in for the NaturalVoice plugin with the model on the phone; natural-voice.js itself is real.
vi.mock('@capacitor/core', () => {
  const impl = { available: async () => ({ available: true }), status: async () => ({ state: 'ready', bytes: 5 }), info: async () => ({}) }
  return {
    registerPlugin: () => new Proxy({}, { get: (_, k) => impl[k] || (() => new Promise(() => {})) }),
    Capacitor: { getPlatform: () => 'ios' },
  }
})

describe('the Natural voice after a launch', () => {
  it('speaks as the picked voice with no Settings page opened, and again when the app returns', async () => {
    localStorage.setItem('og_speech_voice', 'natural:af_heart')
    await import('./useUI.js')
    const { pickedVoice } = await import('../lib/speech.js')
    const nv = await import('../lib/natural-voice.js')
    await vi.waitFor(() => expect(pickedVoice()).toBe('natural:af_heart'))
    nv._resetNatural()
    expect(pickedVoice()).toBe('')
    mocks.active()
    await vi.waitFor(() => expect(pickedVoice()).toBe('natural:af_heart'))
  })

  it('Better voices off in the store: the Natural voice is not allowed', async () => {
    await import('./useUI.js')
    const nv = await import('../lib/natural-voice.js')
    const { useStore } = await import('./useStore.js')
    expect(nv.naturalAllowed()).toBe(true)
    useStore.getState().update(S => { S.modules = { voices: false } }, false)
    expect(nv.naturalAllowed()).toBe(false)
    useStore.getState().update(S => { S.modules = { voices: true } }, false)
    expect(nv.naturalAllowed()).toBe(true)
  })
})
