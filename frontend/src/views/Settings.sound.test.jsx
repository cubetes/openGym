// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings, { RestSoundSheet } from './Settings.jsx'
import { chime, unlock } from '../lib/sound.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, openSheet: null }
  state.snapshot = () => ({
    S: state.S,
    user: null,
    update: mut => {
      const next = structuredClone(state.S)
      mut(next)
      state.S = next
    },
    replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    signOut: vi.fn(), signOutAll: vi.fn(), resetDemo: vi.fn(), disconnectServer: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: (...a) => mocks.openSheet?.(...a) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn() }))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(),
}))
// The real module decides "supported" from navigator.audioSession, which each test sets up;
// unlock is spied on so the Sounds switch can be checked for its tap-time side effect.
vi.mock('../lib/sound.js', async importOriginal => {
  const real = await importOriginal()
  return { ...real, unlock: vi.fn(), chime: vi.fn() }
})

globalThis.__APP_VERSION__ ??= 'test'

let host, root
const setAudioSession = value => Object.defineProperty(navigator, 'audioSession', { value, configurable: true, writable: true })
beforeEach(() => {
  mocks.S = {
    unit: 'kg', restSec: 90, restPauseSec: 15, sound: true, soundOnSilent: false, effort: 'none',
    gifSize: 'full', workouts: [], routines: [], exWeights: {},
  }
  setAudioSession({ type: 'auto' })
  Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', configurable: true })
  // A browser that can speak (the tiles show Spoken cues only then).
  window.speechSynthesis = { getVoices: () => [], addEventListener() {}, removeEventListener() {}, cancel() {}, speak() {} }
  window.SpeechSynthesisUtterance = function () {}
  unlock.mockClear()
  chime.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  setAudioSession(undefined)
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
})

const mount = (page = 'alerts') => act(() => root.render(<Settings page={page} />))
const rowTitled = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)
const tileNamed = name => [...host.querySelectorAll('.at')].find(a => a.querySelector('.nm')?.textContent === name)
const topOf = name => tileNamed(name)?.querySelector('[role="switch"]')
const stripOf = name => tileNamed(name)?.querySelector('.at-op')
// The Sound sheet, as the strip opens it.
const mountSheet = () => act(() => root.render(<RestSoundSheet close={() => {}} />))
const switchIn = row => row.querySelector('[role="switch"]') || row.querySelector('input[type="checkbox"]') || row.querySelector('button')

describe('Settings — play sounds when the phone is on silent', () => {
  it('is offered in the Sound sheet on a browser with an audio session (iOS), under the sound list, with the music trade-off spelled out', () => {
    mountSheet()
    const row = rowTitled('Play even on silent')
    expect(row).toBeTruthy()
    expect(row.querySelector('.lrow-s').textContent).toBe('Music playing on this phone stops during a workout and does not resume by itself.iPhone only')
    const rows = [...host.querySelectorAll('.lrow')]
    expect(rows.indexOf(row)).toBe(rows.indexOf(rowTitled('Soft')) + 1)
  })

  it('is not on the page any more: the Sound strip is its way in', () => {
    mount()
    expect(rowTitled('Play even on silent')).toBeUndefined()
    expect(stripOf('Sound').dataset.find).toBe('Sound|Play even on silent')
  })

  it('is not offered where the browser has no audio session API', () => {
    setAudioSession(undefined)
    mountSheet()
    expect(rowTitled('Play even on silent')).toBeUndefined()
  })

  it('is not offered on macOS Safari, which has the API but no ring/silent switch', () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', configurable: true })
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
    mountSheet()
    expect(rowTitled('Play even on silent')).toBeUndefined()
  })

  it('is only for the rest slot, not the hold', () => {
    mountSheet()
    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'End of a hold').click() })
    expect(rowTitled('Play even on silent')).toBeUndefined()
  })

  it('writes soundOnSilent to the store', () => {
    mountSheet()
    const sw = switchIn(rowTitled('Play even on silent'))
    expect(sw).toBeTruthy()
    act(() => { sw.click() })
    expect(mocks.S.soundOnSilent).toBe(true)
  })
})

describe('Settings — the Sound tile unlocks audio from the tap', () => {
  it('turning Sound on unlocks; turning it off does not', () => {
    mocks.S.sound = false
    mount()
    act(() => { topOf('Sound').click() })
    expect(mocks.S.sound).toBe(true)
    expect(unlock).toHaveBeenCalledWith(true)
    unlock.mockClear()
    mount()
    act(() => { topOf('Sound').click() })
    expect(mocks.S.sound).toBe(false)
    expect(unlock).not.toHaveBeenCalled()
  })

  it('has no old rows: no "Play a sound" row, no section title', () => {
    mount()
    expect(rowTitled('Play a sound')).toBeUndefined()
    expect(host.textContent).not.toContain('When a rest ends')
  })
})

describe('Settings — optional timed-set overtime', () => {
  it('offers the opt-in in Fine-tuning and writes the preference', () => {
    mount('advanced')
    const row = rowTitled('Keep timing after target')
    expect(row).toBeTruthy()
    expect(row.querySelector('.lrow-s').textContent).toBe('Timed sets continue up to 15 extra minutes. Tap Done to log the actual duration.')
    const sw = switchIn(row)
    expect(sw.getAttribute('aria-label')).toBe('Keep timing after target')
    act(() => { sw.click() })
    expect(mocks.S.timedSetOvertime).toBe(true)
  })
})

// Discord (asierlama): the buzz on or off on its own, the way the sound is.
describe('Settings — vibrate', () => {
  const setVibrateApi = value => Object.defineProperty(navigator, 'vibrate', { value, configurable: true, writable: true })
  afterEach(() => { delete navigator.vibrate })
  const names = () => [...host.querySelectorAll('.at .nm')].map(e => e.textContent)

  it('is a tile where the browser can vibrate, on by default, between Sound and Flash', () => {
    setVibrateApi(() => true)
    mount()
    expect(names()).toEqual(['Sound', 'Vibrate', 'Flash the screen', 'Spoken cues'])
    expect(topOf('Vibrate').getAttribute('aria-checked')).toBe('true')
    expect(topOf('Vibrate').getAttribute('aria-label')).toBe('Vibrate, Buzzes at the end')
    expect(stripOf('Vibrate').tagName).toBe('DIV') // the web has no options: plain text
  })

  it('stays on offer with Sound off: the buzz does not depend on the sound', () => {
    setVibrateApi(() => true)
    mocks.S.sound = false
    mount()
    expect(tileNamed('Vibrate')).toBeTruthy()
  })

  it('writes vibrate to the store, off and back on', () => {
    setVibrateApi(() => true)
    mount()
    act(() => { topOf('Vibrate').click() })
    expect(mocks.S.vibrate).toBe(false)
    mount()
    expect(topOf('Vibrate').getAttribute('aria-checked')).toBe('false')
    expect(stripOf('Vibrate')).toBeFalsy()
    act(() => { topOf('Vibrate').click() })
    expect(mocks.S.vibrate).toBe(true)
  })

  // An iPhone has no vibration: no tile, and the footer says why (it is the Vibrate search landing).
  it('on an iPhone (no navigator.vibrate) there is no tile and a footer explains', () => {
    setVibrateApi(undefined)
    mount()
    expect(tileNamed('Vibrate')).toBeUndefined()
    const foot = [...host.querySelectorAll('.sect-f')].find(p => p.textContent.startsWith('iPhone doesn’t let openGym vibrate'))
    expect(foot.dataset.find).toBe('Vibrate')
  })

  it('a desktop browser without vibration shows no tile and no iPhone footer', () => {
    setVibrateApi(undefined)
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0', configurable: true })
    mount()
    expect(tileNamed('Vibrate')).toBeUndefined()
    expect(host.textContent).not.toContain('iPhone doesn’t let openGym vibrate')
  })
})

describe('Settings — which sound', () => {
  it('shows the chime by default and Classic beeps for classicChime, only while sound is on', () => {
    mount()
    expect(stripOf('Sound').textContent).toBe('Chime (louder)')
    mocks.S.classicChime = true
    mount()
    expect(stripOf('Sound').textContent).toBe('Classic beeps')
    mocks.S.sound = false
    mount()
    expect(stripOf('Sound')).toBeFalsy()
  })

  // #306: a few sounds to pick from, each heard as it is picked.
  it('names the picked sound on the strip; an older app\'s classic switch still reads as Classic', () => {
    mocks.S.restSound = 'whistle'
    mount()
    expect(stripOf('Sound').textContent).toBe('Whistle')
    expect(topOf('Sound').getAttribute('aria-label')).toBe('Sound, Whistle')
    mocks.S.classicChime = true
    mount()
    expect(stripOf('Sound').textContent).toBe('Classic beeps')
  })

  it('the Sound strip opens the sheet', () => {
    mocks.openSheet = vi.fn()
    mount()
    act(() => { stripOf('Sound').click() })
    expect(stripOf('Sound').getAttribute('aria-label')).toBe('Sound options')
    expect(mocks.openSheet).toHaveBeenCalledTimes(1)
  })

  it('the sheet lists every sound, ticks the current one, and plays and stores each one tapped', () => {
    const close = vi.fn()
    // the mocked store does not re-render on its own: render again to read the new tick
    const render = () => act(() => root.render(<RestSoundSheet close={close} />))
    render()
    expect([...host.querySelectorAll('.lrow-t')].map(e => e.textContent)).toEqual(['Chime (louder)', 'Classic beeps', 'Bell', 'Beep-beep', 'Whistle', 'Soft', 'Play even on silent', 'Add a sound',   // and a sound of your own (v1.4.5)
      // and one for each kind of rest (#165)
      'After a warm-up set', 'Between working sets', 'Between superset rounds', 'Before the next exercise'])
    expect(rowTitled('Chime (louder)').querySelector('.lrow-k')).toBeTruthy()

    act(() => { rowTitled('Bell').click() })
    expect(mocks.S).toMatchObject({ restSound: 'bell', classicChime: false })
    expect(chime).toHaveBeenLastCalledWith(true, 'bell')
    expect(unlock).toHaveBeenCalled()
    render()
    expect(rowTitled('Bell').querySelector('.lrow-k')).toBeTruthy()
    expect(rowTitled('Chime (louder)').querySelector('.lrow-k')).toBeNull()
    expect(close).not.toHaveBeenCalled()

    // Classic keeps the old switch in step, so an app from before #306 plays it too
    act(() => { rowTitled('Classic beeps').click() })
    expect(mocks.S).toMatchObject({ restSound: 'classic', classicChime: true })
    expect(chime).toHaveBeenLastCalledWith(true, 'classic')
    act(() => { rowTitled('Soft').click() })
    expect(mocks.S).toMatchObject({ restSound: 'soft', classicChime: false })

    act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Done').click() })
    expect(close).toHaveBeenCalled()
  })

  it('each kind of rest follows the rest until it gets a sound of its own (#165)', async () => {
    const { RestKindSheet } = await import('./Settings.jsx')
    const close = vi.fn()
    const render = () => act(() => root.render(<RestKindSheet kind="exercise" close={close} />))
    render()
    expect(rowTitled('Same as the rest (Chime (louder))').querySelector('.lrow-k')).toBeTruthy()
    act(() => { rowTitled('Whistle').click() })
    expect(mocks.S.restSoundByKind).toEqual({ exercise: 'whistle' })
    expect(chime).toHaveBeenLastCalledWith(true, 'whistle')
    render()
    expect(rowTitled('Whistle').querySelector('.lrow-k')).toBeTruthy()
    act(() => { rowTitled('Same as the rest (Chime (louder))').click() })
    expect('restSoundByKind' in mocks.S).toBe(false)
  })
})
