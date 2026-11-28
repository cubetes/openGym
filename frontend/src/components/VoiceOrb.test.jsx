// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({ ui: { timer: null, work: null, countIn: null }, picked: 'natural:af_heart', speech: true }))
vi.mock('../store/useStore.js', async () => {
  const { create } = await import('zustand')
  const useStore = create(set => ({
    S: { active: { cur: 0, entries: [] } },
    update: fn => set(st => { const S = JSON.parse(JSON.stringify(st.S)); fn(S); return { S } }),
  }))
  return { useStore }
})
vi.mock('../store/useUI.js', () => ({ useUI: sel => sel(h.ui) }))
vi.mock('../lib/speech.js', () => ({
  hush: vi.fn(), speechSupported: () => h.speech, onVoices: () => () => {}, pickedVoice: () => h.picked,
  voiceLabel: v => v.name, voiceState: () => ({ voices: [], auto: null }),
}))
vi.mock('../lib/rest-alert.js', () => ({ tickNative: vi.fn() }))
vi.mock('../lib/nav.js', () => ({ nav: vi.fn() }))
vi.mock('../lib/spoken-cues.js', async () => {
  const { useStore } = await import('../store/useStore.js')
  return { cues: { replay: vi.fn(), mute: vi.fn(on => useStore.getState().update(S => { if (S.active) S.active.voiceMuted = on ? true : undefined })) } }
})

const { useStore } = await import('../store/useStore.js')
const { hush } = await import('../lib/speech.js')
const { tickNative } = await import('../lib/rest-alert.js')
const { nav } = await import('../lib/nav.js')
const { cues } = await import('../lib/spoken-cues.js')
const { useCaption, caption } = await import('../lib/voice-caption.js')
const { useVoiceLevel } = await import('../lib/voice-level.js')
const { default: VoiceOrb } = await import('./VoiceOrb.jsx')

const SHORT = 'Next: Barbell Full Squat. 8 reps at 92.5 kilos.'
const LONG = 'Your last two sets were identical. Stay at 92.5 and aim for a clean ninth rep next time.'
const S0 = { spokenCues: true, active: { cur: 0, entries: [] } }

let host, root
const setS = S => act(async () => { useStore.setState({ S }) })
const S = () => useStore.getState().S
const mount = async () => { await act(async () => { root.render(<VoiceOrb />) }) }
const run = async ms => { await act(async () => { vi.advanceTimersByTime(ms) }) }
const q = sel => host.querySelector(sel)
const byLabel = l => q(`[aria-label="${l}"]`)
const orb = () => q('.vo-orb')
const bar = () => q('.vo-bar')
const ev = (el, type, init = {}) => act(async () => { el.dispatchEvent(new (globalThis.PointerEvent || Event)(type, { bubbles: true, pointerId: 1, ...init })) })
const click = el => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const show = (text, o) => act(async () => { caption.show(text, o) })
// A press: down, wait, up (and the click a browser sends after it).
const press = async (ms, { leave = false } = {}) => {
  await ev(orb(), 'pointerdown')
  await run(ms)
  await ev(orb(), leave ? 'pointerout' : 'pointerup')
  if (!leave) await click(orb())
}

beforeEach(async () => {
  vi.useFakeTimers()
  h.ui = { timer: null, work: null, countIn: null }
  h.picked = 'natural:af_heart'
  h.speech = true
  useStore.setState({ S: JSON.parse(JSON.stringify(S0)) })
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  useCaption.setState({ text: '', kind: null, source: null, silent: false, muted: false, speaking: false, expanded: false, last: '', lastAt: 0, shownAt: 0 })
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('the voice orb', () => {
  it('shows nothing without a workout, and an orb with one', async () => {
    await setS({ spokenCues: true, active: null })
    await mount()
    expect(host.textContent).toBe('')
    await setS(S0)
    expect(orb()).toBeTruthy()
    expect(orb().getAttribute('aria-expanded')).toBe('false')
  })

  it('takes the tier colour of the voice, and the plain one with Better voices off', async () => {
    await mount()
    expect(q('.vo').className).toContain('tier-natural')
    await setS({ ...S0, modules: { voices: false } })
    expect(q('.vo').className).toContain('tier-plain')
  })

  it('a Natural voice gives the orb and its glow its own shade', async () => {
    h.picked = 'natural:am_michael'
    await mount()
    for (const sel of ['.vo', '.vo-glow', '.vo-fx']) expect(q(sel).className).toContain('tier-natural nv-michael')
  })

  it('a tap toggles the bar and saves S.voiceBar', async () => {
    await mount()
    expect(bar().hasAttribute('inert')).toBe(true)
    await press(100)
    expect(S().voiceBar).toBe(true)
    expect(bar().hasAttribute('inert')).toBe(false)
    expect(orb().getAttribute('aria-expanded')).toBe('true')
    await press(100)
    expect(S().voiceBar).toBe(false)
    expect(bar().hasAttribute('inert')).toBe(true)
  })

  it('Enter or Space (a click with no press) toggles the bar too', async () => {
    await mount()
    await click(orb())
    expect(S().voiceBar).toBe(true)
  })

  it('a 300 ms press does not mute and toggles the bar once', async () => {
    await mount()
    await press(300)
    expect(cues.mute).not.toHaveBeenCalled()
    expect(S().voiceBar).toBe(true)
    await run(600)
    expect(cues.mute).not.toHaveBeenCalled()
  })

  it('a finger that slides off at 200 ms does not mute', async () => {
    await mount()
    await press(200, { leave: true })
    await run(600)
    expect(cues.mute).not.toHaveBeenCalled()
    expect(tickNative).not.toHaveBeenCalled()
    expect(orb().className).not.toContain('held')
  })

  it('a cancelled touch does not mute', async () => {
    await mount()
    await ev(orb(), 'pointerdown')
    expect(orb().className).toContain('held')
    await run(200)
    await ev(orb(), 'pointercancel')
    await run(600)
    expect(cues.mute).not.toHaveBeenCalled()
  })

  it('a 500 ms hold mutes, ticks once, stops the voice, and the click after it does not toggle the bar', async () => {
    await mount()
    await show(SHORT)
    await ev(orb(), 'pointerdown')
    expect(orb().className).toContain('held')
    await run(500)
    expect(S().active.voiceMuted).toBe(true)
    expect(tickNative).toHaveBeenCalledTimes(1)
    expect(useCaption.getState().speaking).toBe(false)
    expect(orb().className).toContain('held') // still held until the muted look lands, so it never grows back toward 1
    // the grey wash plays first, then the orb settles to the muted look
    expect(orb().className).not.toContain('muted')
    expect(q('.vo-wash').className).toContain('go')
    await run(100)
    expect(orb().className).toContain('muted')
    expect(orb().className).not.toContain('held')
    await ev(orb(), 'pointerup')
    await click(orb())
    expect(S().voiceBar).toBeUndefined()
    // and the next plain tap works again
    await press(100)
    expect(S().voiceBar).toBe(true)
  })

  it('lifting the finger between 500 and 600 ms keeps the orb held until it settles', async () => {
    await mount()
    await ev(orb(), 'pointerdown')
    await run(520)
    await ev(orb(), 'pointerup')
    expect(orb().className).toContain('held')
    expect(orb().className).not.toContain('muted')
    await run(100)
    expect(orb().className).toContain('muted')
    expect(orb().className).not.toContain('held')
  })

  it('a second hold unmutes', async () => {
    await mount()
    await press(600)
    expect(S().active.voiceMuted).toBe(true)
    await press(600)
    expect(cues.mute).toHaveBeenLastCalledWith(false)
    expect(S().active.voiceMuted).toBeUndefined()
    expect(tickNative).toHaveBeenCalledTimes(2)
  })

  it('the hold wash plays once per hold', async () => {
    await mount()
    expect(q('.vo-wash').className).not.toContain('go')
    await press(600)
    expect(q('.vo-wash').className).toContain('go')
  })

  it('the hidden Mute button does what the hold does, and says Unmute once muted', async () => {
    await mount()
    const vh = q('.vh')
    expect(vh.textContent).toBe('Mute')
    expect(orb().nextElementSibling).toBe(vh)
    await click(vh)
    expect(S().active.voiceMuted).toBe(true)
    expect(tickNative).toHaveBeenCalledTimes(1)
    expect(hush).not.toHaveBeenCalled() // cues.mute is mocked; it is what hushes
    expect(q('.vh').textContent).toBe('Unmute')
    await click(q('.vh'))
    expect(S().active.voiceMuted).toBeUndefined()
  })

  it('the lines, hint, halo and wash are hidden from screen readers', async () => {
    await mount()
    expect(q('.vo-lines').getAttribute('aria-hidden')).toBe('true')
    expect(q('.vo-hint').getAttribute('aria-hidden')).toBe('true')
    expect(q('.vo-fx').getAttribute('aria-hidden')).toBe('true')
    expect(q('.vo-dot').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('the hint', () => {
  it('with Spoken cues off, or no speech in the browser: no orb, and the hint is not used up', async () => {
    await setS({ active: { cur: 0, entries: [] } })
    await mount()
    await run(1000)
    expect(orb()).toBeNull()
    expect(S().voiceHintSeen).toBeUndefined()
    await setS(S0)
    h.speech = false
    await mount()
    expect(orb()).toBeNull()
  })

  it('shows once, 600 ms in, for 4 s, and is written as seen', async () => {
    await mount()
    expect(q('.vo-hint').className).not.toContain('on')
    await run(599)
    expect(q('.vo-hint').className).not.toContain('on')
    await run(1)
    expect(q('.vo-hint').className).toContain('on')
    expect(q('.vo-hint').textContent).toBe('Hold to mute')
    expect(S().voiceHintSeen).toBe(true)
    await run(3999)
    expect(q('.vo-hint').className).toContain('on')
    await run(1)
    expect(q('.vo-hint').className).not.toContain('on')
  })

  it('goes on the first touch of the orb', async () => {
    await mount()
    await run(700)
    await ev(orb(), 'pointerdown')
    expect(q('.vo-hint').className).not.toContain('on')
  })

  it('goes when the bar opens', async () => {
    await mount()
    await run(700)
    await click(orb())
    expect(q('.vo-hint').className).not.toContain('on')
  })

  it('never shows once seen, nor muted, nor on a silent phone, nor in bar mode', async () => {
    await setS({ ...S0, voiceHintSeen: true })
    await mount()
    await run(700)
    expect(q('.vo-hint').className).not.toContain('on')
    await setS({ spokenCues: true, active: { cur: 0, entries: [], voiceMuted: true } })
    await run(5000)
    expect(q('.vo-hint').className).not.toContain('on')
    expect(S().voiceHintSeen).toBeUndefined()
  })

  it('waits for a later workout on a silent phone', async () => {
    await act(async () => { useCaption.setState({ text: SHORT, kind: 'pill', silent: true, shownAt: Date.now() }) })
    await mount()
    await run(700)
    expect(q('.vo-hint').className).not.toContain('on')
    expect(S().voiceHintSeen).toBeUndefined()
  })

  it('is not shown in bar mode', async () => {
    await setS({ ...S0, voiceBar: true })
    await mount()
    await run(700)
    expect(q('.vo-hint').className).not.toContain('on')
    expect(S().voiceHintSeen).toBeUndefined()
  })
})

describe('the orb label', () => {
  it('names the state and the tier', async () => {
    await mount()
    expect(orb().getAttribute('aria-label')).toBe('Voice, Natural voice. Show the words.')
    await show(SHORT)
    expect(orb().getAttribute('aria-label')).toBe('Voice, speaking, Natural voice. Show the words.')
    await click(orb())
    expect(orb().getAttribute('aria-label')).toBe('Voice, speaking, Natural voice. Hide the words.')
  })

  it('says muted, not spoken, and a new Coach line', async () => {
    await mount()
    await setS({ spokenCues: true, active: { cur: 0, entries: [], voiceMuted: true } })
    expect(orb().getAttribute('aria-label')).toBe('Voice is muted. Show the words.')
    await setS(S0)
    await act(async () => { useCaption.setState({ text: SHORT, kind: 'pill', silent: true, shownAt: Date.now() }) })
    expect(orb().getAttribute('aria-label')).toBe('Voice, not spoken. Show the words.')
    await act(async () => { useCaption.setState({ text: LONG, kind: 'card', silent: false, source: 'Coach', shownAt: Date.now() }) })
    expect(orb().getAttribute('aria-label')).toBe('Voice, new Coach line. Show the words.')
  })

  it('names the voice instead of a tier when Better voices is off', async () => {
    h.picked = ''
    await setS({ ...S0, modules: { voices: false } })
    await mount()
    expect(orb().getAttribute('aria-label')).toBe('Voice, Automatic. Show the words.')
  })
})

describe('the bar and its words', () => {
  const open = async () => { await setS({ ...S0, voiceBar: true }) }

  it('says "Voice on" before the first line, then the last line dimmed with its age', async () => {
    await open()
    await mount()
    expect(q('.vo-cap').textContent).toContain('Voice on')
    expect(byLabel('Voice on. Voice actions')).toBeTruthy()
    await show(SHORT)
    await run(3900 + 1200 + 100) // the speech estimate, the 1.2 s hold
    expect(useCaption.getState().text).toBe('')
    expect(q('.vo-cap').textContent).toContain(SHORT)
    expect(q('.vo-dim')).toBeTruthy()
    expect(q('.vo-cap').textContent).toContain('10 seconds ago')
  })

  it('shows a short line, hidden from a screen reader while it is spoken', async () => {
    await open()
    await mount()
    await show(SHORT)
    expect(q('.vo-cap').textContent).toContain(SHORT)
    expect(q('.vo-words').getAttribute('aria-hidden')).toBe('true')
    expect(byLabel('Voice actions')).toBeTruthy()
  })

  it('swaps a new line in by transition: the old one stays a moment, marked out', async () => {
    await open()
    await mount()
    await show('Three.')
    await show('Two.')
    expect(q('.vo-ln .out').textContent).toBe('Three.')
    expect(q('.vo-ln > span:not(.out)').textContent).toBe('Two.')
    await run(170)
    expect(q('.vo-ln .out')).toBeNull()
  })

  it('the words open the actions panel: Stop, then Replay, Mute, Settings', async () => {
    await open()
    await mount()
    await show(SHORT)
    expect(q('.vo-panel').hasAttribute('inert')).toBe(true)
    await click(byLabel('Voice actions'))
    expect(q('.vo-panel').hasAttribute('inert')).toBe(false)
    expect(byLabel('Voice actions').getAttribute('aria-expanded')).toBe('true')
    expect(hush).not.toHaveBeenCalled()
    for (const l of ['Stop speaking', 'Mute spoken cues', 'Open voice settings']) expect(byLabel(l)).toBeTruthy()
    await click(byLabel('Stop speaking'))
    expect(hush).toHaveBeenCalledTimes(1)
    expect(byLabel('Stop speaking')).toBeNull()
    await click(byLabel('Replay the last line'))
    expect(cues.replay).toHaveBeenCalledTimes(1)
  })

  it('the panel stays while open, and the line goes when it is closed after its time', async () => {
    await open()
    await mount()
    await show(SHORT)
    await click(byLabel('Voice actions'))
    await run(20000)
    expect(useCaption.getState().text).toBe(SHORT)
    await click(q('.vo-cap'))
    expect(useCaption.getState().text).toBe('')
  })

  it('Mute from the panel mutes, and the bar says so with Unmute and Settings', async () => {
    await open()
    await mount()
    await show(SHORT)
    await click(byLabel('Voice actions'))
    await click(byLabel('Mute spoken cues'))
    expect(cues.mute).toHaveBeenCalledWith(true)
    expect(q('.vo-cap').textContent).toContain('Voice is muted for this workout')
    expect(byLabel('Unmute spoken cues')).toBeTruthy()
    expect(byLabel('Open voice settings')).toBeTruthy()
    await run(60000)
    expect(q('.vo-cap').textContent).toContain('Voice is muted for this workout')
    await click(byLabel('Unmute spoken cues'))
    expect(cues.mute).toHaveBeenLastCalledWith(false)
    expect(q('.vo-cap').textContent).not.toContain('muted')
  })

  it('Settings opens the voice settings', async () => {
    await open()
    await mount()
    await show(SHORT)
    await click(byLabel('Voice actions'))
    await click(byLabel('Open voice settings'))
    expect(nav).toHaveBeenCalledWith('/settings/voice')
  })

  it('a silent line says it was not spoken, with its age, and offers only Settings', async () => {
    await open()
    await mount()
    await act(async () => { useCaption.setState({ text: SHORT, kind: 'pill', silent: true, shownAt: Date.now() - 20000 }) })
    await run(10000) // a tick re-reads the age
    expect(q('.vo-cap').textContent).toContain('Not spoken, 30 seconds ago')
    expect(q('.vo-cap').textContent).toContain(SHORT)
    expect(orb().className).toContain('sil')
    await click(byLabel(`${SHORT} Not spoken, 30 seconds ago. Voice actions`))
    expect(q('.vo-panel').querySelectorAll('button')).toHaveLength(1)
    expect(byLabel('Open voice settings')).toBeTruthy()
  })

  it('a 13-word line is a card: the voice row in the bar, the card above it, until Dismiss', async () => {
    await open()
    await mount()
    await show(LONG, { source: 'Coach' })
    expect(q('.vo-cap').textContent).toContain('Coach')
    expect(q('.vo-cap').textContent).toContain('Heart · Natural voice')
    expect(q('.vo-panel').hasAttribute('inert')).toBe(false)
    expect(q('.vo-card').textContent).toBe(LONG)
    for (const l of ['Stop speaking', 'Mute spoken cues', 'Open voice settings']) expect(byLabel(l)).toBeTruthy()
    await run(60000)
    expect(q('.vo-card').textContent).toBe(LONG)
    await click([...host.querySelectorAll('button')].find(b => b.textContent === 'Dismiss'))
    expect(useCaption.getState().text).toBe('')
    expect(q('.vo-panel').hasAttribute('inert')).toBe(true)
  })

  it('a card line with Better voices off names only the voice', async () => {
    h.picked = ''
    await setS({ ...S0, voiceBar: true, modules: { voices: false } })
    await mount()
    await show(LONG)
    expect(q('.vo-cap').textContent).toBe('Automatic')
  })

  it('in orb mode a card adds the dot, and opening the bar opens the card and clears the dot', async () => {
    await mount()
    await show(LONG, { source: 'Coach' })
    await act(async () => { useCaption.setState({ speaking: false }) })
    expect(orb().className).toContain('dot')
    expect(q('.vo-panel').hasAttribute('inert')).toBe(true)
    await click(orb())
    expect(q('.vo-panel').hasAttribute('inert')).toBe(false)
    expect(q('.vo-card')).toBeTruthy()
    expect(orb().className).not.toContain('dot')
    await click(orb()) // closing the bar does not bring the dot back
    expect(orb().className).not.toContain('dot')
  })

  it('a card goes when the rest ends', async () => {
    await open()
    h.ui = { timer: { left: 30 }, work: null, countIn: null }
    await mount()
    await show(LONG)
    expect(q('.vo-card')).toBeTruthy()
    h.ui = { timer: null, work: null, countIn: null }
    await mount()
    expect(useCaption.getState().text).toBe('')
  })

  it('muted: says so and offers Unmute and Settings from the panel', async () => {
    await setS({ spokenCues: true, active: { cur: 0, entries: [], voiceMuted: true }, voiceBar: true })
    await mount()
    expect(q('.vo-cap').textContent).toBe('Voice is muted for this workout')
    await click(q('.vo-cap'))
    expect(byLabel('Unmute spoken cues')).toBeTruthy()
    await click(byLabel('Unmute spoken cues'))
    expect(S().active.voiceMuted).toBeUndefined()
  })

  it('the voice is gone with the workout, even a muted line', async () => {
    await open()
    await mount()
    await show(SHORT, { muted: true })
    await act(async () => { root.unmount() })
    expect(useCaption.getState().text).toBe('')
    expect(useCaption.getState().last).toBe('')
    root = createRoot(host)
  })
})

describe('the place', () => {
  it('keeps the page clear of itself while it shows, with the panel too', async () => {
    await mount()
    expect(document.body.classList.contains('vpill')).toBe(true)
    expect(document.body.style.getPropertyValue('--vp-h')).toBe('56px')
    await act(async () => { root.unmount() })
    expect(document.body.classList.contains('vpill')).toBe(false)
    root = createRoot(host)
  })

  it('measures a bar taller than the orb (large text), and its open panel', async () => {
    const heights = { 'vo-bar': 120, 'vo-panel': 60 }
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return heights[[...this.classList].find(c => heights[c])] || 0 } })
    try {
      await mount()
      expect(document.body.style.getPropertyValue('--vp-h')).toBe('56px')
      await click(orb())
      expect(document.body.style.getPropertyValue('--vp-h')).toBe('120px')
      await click(q('.vo-cap'))
      expect(document.body.style.getPropertyValue('--vp-h')).toBe('188px') // 120 + 8 + 60
    } finally { delete HTMLElement.prototype.offsetHeight }
  })

  it('sits on the rest bar as measured', async () => {
    const el = document.createElement('div'); el.id = 'timer'
    Object.defineProperty(el, 'offsetHeight', { value: 140 })
    document.body.append(el)
    h.ui = { timer: { left: 30 }, work: null, countIn: null }
    await mount()
    expect(document.body.style.getPropertyValue('--vp-rb')).toBe('140px')
    h.ui = { timer: null, work: null, countIn: null }
    await mount()
    expect(document.body.style.getPropertyValue('--vp-rb')).toBe('')
    el.remove()
  })

  it('slides from the old place when it moves (FLIP), never by animating bottom', async () => {
    const animate = vi.fn()
    Element.prototype.animate = animate
    let top = 700
    await mount()
    Object.defineProperty(q('.vo'), 'offsetTop', { get: () => top, configurable: true })
    // the observer's first reading is taken at mount (0 here); read it again at the old place
    window.dispatchEvent(new Event('resize'))
    top = 640
    await act(async () => { document.body.classList.add('resting') })
    await act(async () => { await Promise.resolve() })
    document.body.classList.remove('resting')
    expect(animate).toHaveBeenCalledWith([{ transform: 'translateY(60px)' }, { transform: 'none' }], expect.objectContaining({ duration: 300 }))
    delete Element.prototype.animate
  })

  it("closed, the bar is the orb's width on any phone", async () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return this.classList.contains('vo-bar') ? 398 : 0 } })
    try {
      await mount()
      expect(q('.vo-bar').style.getPropertyValue('--vo-x')).toBe('0.1407')
    } finally { delete HTMLElement.prototype.offsetWidth }
  })

  it('a second move cancels the running slide', async () => {
    const cancel = vi.fn()
    Element.prototype.animate = vi.fn(() => ({ cancel }))
    let top = 700
    await mount()
    Object.defineProperty(q('.vo'), 'offsetTop', { get: () => top, configurable: true })
    window.dispatchEvent(new Event('resize'))
    top = 640
    await act(async () => { document.body.classList.add('resting') })
    await act(async () => { await Promise.resolve() })
    expect(cancel).not.toHaveBeenCalled()
    top = 700
    await act(async () => { document.body.classList.remove('resting') })
    await act(async () => { await Promise.resolve() })
    document.body.classList.remove('resting')
    expect(cancel).toHaveBeenCalled()
    delete Element.prototype.animate
  })

  it('a body change that cannot move the orb reads no layout', async () => {
    await mount()
    let reads = 0
    Object.defineProperty(q('.vo'), 'offsetTop', { get: () => { reads++; return 0 }, configurable: true })
    await act(async () => { document.body.classList.add('totop-on') })
    await act(async () => { await Promise.resolve() })
    document.body.classList.remove('totop-on')
    expect(reads).toBe(0)
  })
})

describe('the motion', () => {
  let rafs, t, anims, reduce
  const frames = async n => { for (let i = 0; i < n; i++) { const cb = rafs.shift(); if (!cb) break; t += 16; await act(async () => { cb(t) }) } }
  beforeEach(() => {
    rafs = []; t = 1000; anims = []; reduce = false
    vi.stubGlobal('requestAnimationFrame', cb => rafs.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => { rafs.length = 0 })
    vi.stubGlobal('matchMedia', q => ({ matches: reduce && /reduce/.test(q), addEventListener() {}, removeEventListener() {} }))
    HTMLElement.prototype.animate = function () { const a = { onfinish: null, el: this }; anims.push(a); return a }
    useVoiceLevel.setState({ now: () => 1, real: false })
  })
  afterEach(() => { vi.unstubAllGlobals(); delete HTMLElement.prototype.animate })
  const lineTf = i => host.querySelectorAll('.vo-lines b')[i].style.transform

  it('at full level the lines, body and halo reach their peaks', async () => {
    await mount()
    await show(SHORT)
    await frames(12)
    expect(lineTf(1)).toMatch(/^scaleY\((1|0\.99\d*)\)$/)
    expect(Number(q('.vo-body').style.transform.match(/scale\(([\d.]+)\)/)[1])).toBeGreaterThan(1.1)
    expect(Number(q('.vo-halo').style.opacity)).toBeGreaterThan(0.9)
    expect(Number(q('.vo-core').style.opacity)).toBeGreaterThan(0.45)
  })

  it('no ripple in bar mode', async () => {
    await setS({ ...S0, voiceBar: true })
    await mount()
    await show(SHORT)
    await frames(6)
    expect(host.querySelectorAll('.vo-rp').length).toBe(0)
  })

  it('runs no loop when quiet, muted or silent', async () => {
    await mount()
    expect(rafs.length).toBe(0)
    await show(SHORT, { silent: true })
    expect(rafs.length).toBe(0)
    await act(async () => { caption.hide() })
    await act(async () => { cues.mute(true) })
    await show(SHORT, { muted: true })
    expect(rafs.length).toBe(0)
  })

  it('muting while it speaks ends the loop and clears the inline look', async () => {
    await mount()
    await show(SHORT)
    await frames(4)
    expect(lineTf(1)).not.toBe('')
    await press(600)
    await run(100)
    await frames(60)
    expect(rafs.length).toBe(0)
    expect(lineTf(1)).toBe('')
    expect(q('.vo-body').style.transform).toBe('')
  })

  it('stops by itself when the line has ended and the level is back to nothing', async () => {
    await mount()
    await show(SHORT)
    await frames(3)
    await act(async () => { useCaption.setState({ speaking: false }) })
    useVoiceLevel.setState({ now: () => 0 })
    await frames(80)
    expect(rafs.length).toBe(0)
    expect(q('.vo-halo').style.opacity).toBe('')
  })

  it('one ripple on a rising edge through .7, the next only after 300 ms', async () => {
    await mount()
    await show(SHORT)
    await frames(3)
    expect(host.querySelectorAll('.vo-rp').length).toBe(1)
    await frames(5)
    expect(host.querySelectorAll('.vo-rp').length).toBe(1) // a loud stretch is one ring
    useVoiceLevel.setState({ now: () => 0 })
    await frames(4) // falls under .7 again
    useVoiceLevel.setState({ now: () => 1 })
    await frames(3)
    expect(host.querySelectorAll('.vo-rp').length).toBe(1) // rose again inside 300 ms
    useVoiceLevel.setState({ now: () => 0 })
    await frames(12)
    useVoiceLevel.setState({ now: () => 1 })
    await frames(3)
    expect(host.querySelectorAll('.vo-rp').length).toBe(2)
    anims[0].onfinish()
    expect(host.querySelectorAll('.vo-rp').length).toBe(1)
  })

  it('reduced motion: no scale, no ripple, lines at 60% with their opacity following', async () => {
    reduce = true
    await mount()
    await show(SHORT)
    await frames(12)
    expect(q('.vo-body').style.transform).toBe('')
    expect(q('.vo-halo').style.transform).toBe('')
    expect(host.querySelectorAll('.vo-rp').length).toBe(0)
    expect(lineTf(1)).toBe('scaleY(0.6)')
    expect(Number(host.querySelectorAll('.vo-lines b')[1].style.opacity)).toBeGreaterThan(0.9)
    expect(Number(q('.vo-halo').style.opacity)).toBeLessThanOrEqual(0.6)
    expect(Number(q('.vo-core').style.opacity)).toBeGreaterThan(0.4)
  })

  it('a real curve that is still playing keeps the loop going after the caption says it is done', async () => {
    await mount()
    await show(SHORT)
    await frames(2)
    useVoiceLevel.setState({ real: true, curve: new Array(100).fill(1), start: performance.now() })
    await act(async () => { useCaption.setState({ speaking: false }) })
    await frames(5)
    expect(rafs.length).toBe(1)
  })

  it('the edge glow is only in bar mode, tinted, hidden from screen readers, and lifts over the rest bar', async () => {
    await mount()
    await show(SHORT)
    expect(q('.vo-glow').className).not.toMatch(/\b(on|sp|mut)\b/)
    await click(orb())
    const g = q('.vo-glow')
    expect(g.getAttribute('aria-hidden')).toBe('true')
    expect(g.className).toContain('tier-natural')
    expect(g.className).toContain('sp')
    expect(g.className).not.toContain('rest')
    h.ui = { timer: { kind: 'rest' }, work: null, countIn: null }
    await mount()
    expect(q('.vo-glow').className).toContain('rest')
    expect(q('.vo-fx').className).toContain('off') // the halo gives way
  })

  it('closing the bar keeps the glow mounted, so it fades out', async () => {
    await mount()
    await show(SHORT)
    await click(orb())
    expect(q('.vo-glow').className).toMatch(/\bon\b/)
    await click(orb())
    expect(q('.vo-glow')).not.toBeNull()
    expect(q('.vo-glow').className).not.toMatch(/\bon\b/)
  })

  it('the bright patch runs once over the estimated length, but not for a 1 or 2 word line', async () => {
    await setS({ spokenCues: true, active: { cur: 0, entries: [] }, voiceBar: true })
    await mount()
    await show('Rest is over')
    expect(q('.vo-gh').style.animationDuration).toBe('1500ms') // 3 words x 400 ms + 300
    await show('Go now')
    expect(q('.vo-gh')).toBeNull()
    expect(q('.vo-ge')).not.toBeNull()
  })

  it('the glow is grey when muted and absent when the phone is silent', async () => {
    await setS({ spokenCues: true, active: { cur: 0, entries: [], voiceMuted: true }, voiceBar: true })
    await mount()
    expect(q('.vo-glow').className).toContain('mut')
    await setS({ spokenCues: true, active: { cur: 0, entries: [] }, voiceBar: true })
    await show(SHORT, { silent: true })
    expect(q('.vo-glow').className).not.toMatch(/\bon\b/)
  })
})

describe('the style', () => {
  const css = readFileSync('src/components/VoiceOrb.css', 'utf8')

  it('has a reduced-motion block, and never animates a layout property', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)/)
    const lists = [...css.matchAll(/transition:([^;}]+)/g)].map(m => m[1])
    expect(lists.length).toBeGreaterThan(5)
    for (const l of lists) expect(l).not.toMatch(/\b(width|height|bottom|left|top|right|all)\b/)
  })

  it('allows four lines at large text, and keeps the color-mix and backdrop-filter stand-ins', () => {
    expect(css).toMatch(/\.text-big \.vo-c1,\.text-big \.vo-c2\{-webkit-line-clamp:4\}/)
    expect(css).toMatch(/@supports not \(color: color-mix/)
    expect(css).toMatch(/@supports not \(\(backdrop-filter/)
  })

  it('uses the shared curves and the hold and press values of the design', () => {
    expect(css).toMatch(/\.vo-bar\.on\{[^}]*260ms var\(--ease\)/)
    expect(css).toMatch(/\.vo-orb\.held\{--s:var\(--press-scale-sm\)/)
    expect(css).toMatch(/\.vo-orb\.muted\.held\{--s:\.79/)
    expect(css).toMatch(/:active\{transform:scale\(var\(--press-scale\)\)\}/)
  })

  it('spins the blobs only while speaking, and keeps the glow still under reduced motion', () => {
    expect(css).toMatch(/\.vo-b1\{[^}]*9s linear infinite paused/)
    expect(css).toMatch(/\.vo-b2\{[^}]*13s linear infinite reverse paused/)
    expect(css).toMatch(/\.vo-orb\.sp \.vo-b1,\.vo-orb\.sp \.vo-b2\{animation-play-state:running\}/)
    expect(css).toMatch(/\.vo-glow\{[^}]*height:230px/)
    const idx = readFileSync('src/index.css', 'utf8')
    expect(idx).toMatch(/body\.vpill #app\{position:relative;z-index:1\}/) // the page paints over the edge glow (z 0), under the status-bar strip (z 30)
    expect(css).toMatch(/\.vo-glow\.sp i\{animation-play-state:running\}/)
    expect(css).toMatch(/\.vo-fx\{z-index:2[;}]/) // the halo lights the cards: over #app (1), under the status strip (30), the tab bar (50) and the orb (65)
    expect(css).toMatch(/\.vo-glow\{[^}]*z-index:0/)
    expect(css).toMatch(/:root\[data-theme="light"\] \.vo-ge\{display:block\}/)
    expect(css).toMatch(/var\(--ease-in-out\) infinite/)
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion:reduce)'))
    expect(rm).toMatch(/\.vo-b1,\.vo-b2\{animation:none\}/)
    expect(rm).toMatch(/\.vo-glow i\{animation:none\}/)
    expect(rm).toMatch(/\.vo-gh\{display:none\}/)
    expect(rm).toMatch(/\.vo-glow\{transition:opacity 150ms linear!important\}/)
    const block = rm.slice(0, rm.indexOf('@media (prefers-reduced-transparency'))
    for (const m of block.matchAll(/(transition|animation):([^;}]+)/g)) if (m[2].trim() !== 'none') expect(m[2]).toMatch(/!important$/)
    expect(block).toMatch(/\.vo-wash\.go\{animation:vo-wash 150ms/)
    expect(block).toMatch(/:active\{transform:none;opacity:\.6\}/)
  })

  it('lifts the toast above the orb and its bar, in every place they sit', () => {
    const idx = readFileSync('src/index.css', 'utf8')
    const lift = idx.match(/(body\.vpill #toast,body\.vpill\.no-tabbar #toast,body\.vpill\.no-tabbar\.resting #toast)\{bottom:calc\(var\(--vp-b\) \+ var\(--vp-h,0px\) \+ 10px\)\}/)
    expect(lift).not.toBeNull()
    expect(idx.indexOf(lift[0])).toBeGreaterThan(idx.indexOf('body.no-tabbar.resting #toast{'))
  })
})
