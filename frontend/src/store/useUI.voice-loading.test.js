// @vitest-environment happy-dom
// A Natural model load past 1.5 s is the slow first one: the toast says so, once per load; a quick load says nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loading: null }))
vi.mock('../lib/mobile.js', async importOriginal => ({ ...(await importOriginal()), MOBILE: true }))
vi.mock('../lib/rest-alert.js', () => ({ armRestAlert: vi.fn(), holdRestAlert: vi.fn(), disarmRestAlert: vi.fn(), bindNativeRest: vi.fn(), onVoiceLine: () => () => {}, onVoiceLoading: cb => { mocks.loading = cb; return () => {} } }))
vi.mock('../lib/sound.js', () => ({ prepareAudio: vi.fn(), beep: vi.fn(), chime: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ ok: true })) }))

const MSG = 'Getting the Natural voice ready. The first time after an update or a restart takes a little longer.'
let useUI
beforeEach(async () => {
  vi.useFakeTimers()
  ;({ useUI } = await import('./useUI.js'))
  useUI.setState({ toastMsg: '', toastAction: null })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('voiceLoading in the store', () => {
  it('a quick load shows nothing', () => {
    mocks.loading({ on: true })
    vi.advanceTimersByTime(1400)
    mocks.loading({ on: false })
    vi.advanceTimersByTime(5000)
    expect(useUI.getState().toastMsg).toBe('')
  })

  it('a load past 1.5 s shows the toast once', () => {
    mocks.loading({ on: true })
    vi.advanceTimersByTime(1500)
    expect(useUI.getState().toastMsg).toBe(MSG)
    useUI.setState({ toastMsg: '' })
    vi.advanceTimersByTime(10000)
    expect(useUI.getState().toastMsg).toBe('')
    mocks.loading({ on: false })
  })
})
