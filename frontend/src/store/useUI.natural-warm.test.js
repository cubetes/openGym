// @vitest-environment happy-dom
// The first Natural model load after a restart or an update is slow: the app starts it at launch, once.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ natural: null, state: 'none' }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true }))
vi.mock('../lib/rest-alert.js', () => ({ armRestAlert: vi.fn(), holdRestAlert: vi.fn(), disarmRestAlert: vi.fn(), bindNativeRest: vi.fn(), onVoiceLine: () => () => {} }))
vi.mock('../lib/natural-voice.js', async importOriginal => ({
  ...(await importOriginal()),
  refreshNatural: vi.fn(),
  naturalState: () => ({ state: mocks.state }),
  onNatural: fn => { mocks.natural = fn; return () => { mocks.natural = null } },
}))
vi.mock('../lib/sound.js', () => ({ prepareAudio: vi.fn(), beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ ok: true })) }))

beforeEach(() => { vi.resetModules(); mocks.natural = null; mocks.state = 'none' })

async function launch(spokenCues) {
  const { useStore } = await import('./useStore.js')
  useStore.setState(s => ({ S: { ...s.S, spokenCues } }))
  await import('./useUI.js')
  const { cues } = await import('../lib/spoken-cues.js')
  return vi.spyOn(cues, 'prepareFixed').mockImplementation(() => {})
}

describe('Natural model warm-up at launch', () => {
  it('makes the fixed lines once the model is ready, and only once', async () => {
    const prep = await launch(true)
    mocks.natural() // still checking
    expect(prep).not.toHaveBeenCalled()
    mocks.state = 'ready'
    const fire = mocks.natural
    fire()
    expect(prep).toHaveBeenCalledTimes(1)
    expect(mocks.natural).toBe(null) // stopped listening
  })

  it('does nothing with Spoken cues off', async () => {
    const prep = await launch(false)
    mocks.state = 'ready'
    mocks.natural()
    expect(prep).not.toHaveBeenCalled()
  })
})
