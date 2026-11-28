// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { SEARCH } from './settings-pages.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, MOBILE: false }
  state.snapshot = () => ({
    S: state.S, user: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
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
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(), webauthnOK: () => false, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false }))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({
  get MOBILE() { return mocks.MOBILE },
  isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), syncReminder: vi.fn(),
}))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: () => null }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(), importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(), menuSheet: vi.fn(),
}))
globalThis.__APP_VERSION__ ??= 'test'

let host, root
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const speak = on => {
  if (on) { window.speechSynthesis = { getVoices: () => [], addEventListener() {}, removeEventListener() {}, cancel() {}, speak() {} }; window.SpeechSynthesisUtterance = function () {} }
  else { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance }
}
beforeEach(() => {
  mocks.MOBILE = false
  mocks.S = { unit: 'kg', restSec: 90, restPauseSec: 15, sound: true, effort: 'none', gifSize: 'full', workouts: [], routines: [], exWeights: {} }
  Object.defineProperty(navigator, 'userAgent', { value: IPHONE, configurable: true })
  Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true, writable: true })
  delete navigator.vibrate
  speak(true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); speak(false); Object.defineProperty(navigator, 'audioSession', { value: undefined, configurable: true, writable: true }) })
const mount = (find = null) => act(() => root.render(<Settings page="alerts" find={find} />))
const names = () => [...host.querySelectorAll('.at .nm')].map(e => e.textContent)

describe('Timer alerts page', () => {
  it('iPhone: Sound, Flash the screen and a full-width Spoken cues, and the iPhone footer', () => {
    mount()
    expect(names()).toEqual(['Sound', 'Flash the screen', 'Spoken cues'])
    expect([...host.querySelectorAll('.at.wide .nm')].map(e => e.textContent)).toEqual(['Spoken cues'])
    expect([...host.querySelectorAll('.sect-f')].map(p => p.textContent)).toEqual([
      'Says your next set, “10 seconds” and “Rest is over”, and counts holds down.',
      'Only while the app is on screen. Music turns down for a moment, it never stops.',
      'iPhone doesn’t let openGym vibrate. A sound or a flash does the job.',
    ])
    expect([...host.querySelectorAll('.lrow-t')].map(e => e.textContent)).not.toContain('Play a sound')
  })

  it('a browser that cannot speak: two tiles and only the cannot-speak footer', () => {
    speak(false)
    mount()
    expect(names()).toEqual(['Sound', 'Flash the screen'])
    expect([...host.querySelectorAll('.sect-f')].map(p => p.textContent)).toEqual(['This browser can’t speak. Try another one.'])
  })

  it('Spoken cues: the strip is the Voice button and shows only while cues are on', () => {
    mount()
    expect(host.querySelectorAll('.at')[2].querySelector('.at-op')).toBeNull()
    mocks.S.spokenCues = true
    mount()
    const strip = host.querySelectorAll('.at')[2].querySelector('button.at-op')
    expect(strip.getAttribute('aria-label')).toBe('Voice')
    expect(strip.dataset.find).toBe('Voice')
  })
})

describe('Search landing on the tiles', () => {
  const flashed = () => [...host.querySelectorAll('.sp-flash')]
  it('an option in the Sound sheet flashes the Sound strip', () => {
    mount('Play even on silent')
    expect(flashed().map(e => e.className)).toEqual(['at-op sp-flash'])
    expect(flashed()[0].dataset.find).toBe('Sound|Play even on silent')
  })
  it('a tile name flashes its top, and the iPhone Vibrate entry flashes the footer', () => {
    mount('Play a sound')
    expect(flashed()[0].getAttribute('aria-label')).toMatch(/^Sound,/)
    act(() => root.unmount()); root = createRoot(host)
    mount('Vibrate')
    expect(flashed()[0].tagName).toBe('P')
  })
  it('Vibrate is listed only where it can land', () => {
    const e = SEARCH.find(x => x.page === 'alerts' && x.title === 'Vibrate')
    expect(e.when({ canVibrate: false, iPhone: false })).toBe(false)
    expect(e.when({ canVibrate: false, iPhone: true })).toBe(true)
    expect(e.when({ canVibrate: true, iPhone: false })).toBe(true)
  })
})
