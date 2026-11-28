// @vitest-environment happy-dom
// When the Apple voice covers a Natural line the phone sends a voiceLine with cover: true; the orb and caption ignore it.
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ line: null }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true }))
vi.mock('../lib/rest-alert.js', () => ({ armRestAlert: vi.fn(), holdRestAlert: vi.fn(), disarmRestAlert: vi.fn(), bindNativeRest: vi.fn(), onVoiceLine: cb => { mocks.line = cb; return () => {} }, onVoiceLoading: () => () => {} }))
vi.mock('../lib/sound.js', () => ({ prepareAudio: vi.fn(), beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ ok: true })) }))

describe('voiceLine in the store', () => {
  it('follows a real line and ignores a cover', async () => {
    await import('./useUI.js')
    const { useVoiceLevel } = await import('../lib/voice-level.js')
    const { useCaption } = await import('../lib/voice-caption.js')
    const fromNative = vi.spyOn(useVoiceLevel.getState(), 'fromNative')
    const heard = vi.spyOn(useCaption.getState(), 'heard')
    mocks.line({ text: 'a', levels: [], ms: 0, cover: true })
    expect(fromNative).not.toHaveBeenCalled()
    expect(heard).not.toHaveBeenCalled()
    mocks.line({ text: 'a', levels: [], ms: 0, dropped: true })
    expect(fromNative).not.toHaveBeenCalled()
    mocks.line({ text: 'a', levels: [1], ms: 900 })
    expect(fromNative).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith('a', 900)
  })
})
