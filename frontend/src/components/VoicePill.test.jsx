// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({ S: { active: { cur: 0, entries: [] } }, ui: { timer: null, work: null, countIn: null } }))
vi.mock('../store/useStore.js', () => ({ useStore: sel => sel({ S: h.S }) }))
vi.mock('../store/useUI.js', () => ({ useUI: sel => sel(h.ui) }))
vi.mock('../lib/speech.js', () => ({ hush: vi.fn() }))
vi.mock('../lib/nav.js', () => ({ nav: vi.fn() }))
vi.mock('../lib/spoken-cues.js', () => ({
  cues: {
    replay: vi.fn(),
    mute: vi.fn(on => { h.S.active.voiceMuted = on ? true : undefined }),
  },
}))

const { hush } = await import('../lib/speech.js')
const { nav } = await import('../lib/nav.js')
const { cues } = await import('../lib/spoken-cues.js')
const { useCaption, caption } = await import('../lib/voice-caption.js')
const { default: VoicePill } = await import('./VoicePill.jsx')

const SHORT = 'Next: Barbell Full Squat. 8 reps at 92.5 kilos.'
const LONG = 'Your last two sets were identical. Stay at 92.5 and aim for a clean ninth rep next time.'

let host, root
const mount = async () => { await act(async () => { root.render(<VoicePill />) }) }
const run = async ms => { await act(async () => { vi.advanceTimersByTime(ms) }) }
const q = sel => host.querySelector(sel)
const byLabel = l => q(`[aria-label="${l}"]`)
const click = async el => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
const show = async (text, o) => { await act(async () => { caption.show(text, o) }) }

beforeEach(() => {
  vi.useFakeTimers()
  h.S = { active: { cur: 0, entries: [] } }
  h.ui = { timer: null, work: null, countIn: null }
  host = document.createElement('div'); document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  host.remove()
  useCaption.setState({ text: '', kind: null, silent: false, muted: false, speaking: false, expanded: false, last: '' })
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('the voice pill', () => {
  it('shows nothing without a workout', async () => {
    h.S = { active: null }
    await mount()
    await show(SHORT)
    expect(host.textContent).toBe('')
  })

  it('shows a short line and hides it 1.2 s after the speech ends', async () => {
    await mount()
    await show(SHORT)
    expect(host.textContent).toContain(SHORT)
    expect(byLabel('Voice, speaking. Open voice actions.')).toBeTruthy()
    expect(q('.vcap-line').getAttribute('aria-hidden')).toBe('true')
    await run(3900 + 1100) // speech estimate, then 1.1 s of the 1.2 s hold
    expect(host.textContent).toContain(SHORT)
    await run(100) // hold over
    await run(300) // fade out
    expect(host.textContent).toBe('')
  })

  it('opens the actions on the first tap and does not stop the voice', async () => {
    await mount()
    await show(SHORT)
    await click(byLabel('Voice, speaking. Open voice actions.'))
    expect(hush).not.toHaveBeenCalled()
    const top = byLabel('Voice actions')
    expect(top.getAttribute('aria-expanded')).toBe('true')
    for (const l of ['Stop speaking', 'Mute spoken cues', 'Open voice settings']) expect(byLabel(l)).toBeTruthy()
  })

  it('stays while open, then goes when closed after its time', async () => {
    await mount()
    await show(SHORT)
    await click(byLabel('Voice, speaking. Open voice actions.'))
    await run(20000)
    expect(host.textContent).toContain(SHORT)
    await click(byLabel('Voice actions'))
    await run(300)
    expect(host.textContent).toBe('')
  })

  it('Stop hushes the voice and the slot becomes Replay, which replays', async () => {
    await mount()
    await show(SHORT)
    await click(byLabel('Voice, speaking. Open voice actions.'))
    await click(byLabel('Stop speaking'))
    expect(hush).toHaveBeenCalledTimes(1)
    expect(byLabel('Stop speaking')).toBeNull()
    await click(byLabel('Replay the last line'))
    expect(cues.replay).toHaveBeenCalledTimes(1)
  })

  it('Mute mutes the workout and says so, with Unmute and Settings', async () => {
    await mount()
    await show(SHORT)
    await click(byLabel('Voice, speaking. Open voice actions.'))
    await click(byLabel('Mute spoken cues'))
    expect(cues.mute).toHaveBeenCalledWith(true)
    expect(h.S.active.voiceMuted).toBe(true)
    expect(host.textContent).toContain('Voice is muted for this workout')
    expect(byLabel('Unmute spoken cues')).toBeTruthy()
    expect(byLabel('Open voice settings')).toBeTruthy()
    await run(60000)
    expect(host.textContent).toContain('Voice is muted for this workout')
    await click(byLabel('Unmute spoken cues'))
    expect(cues.mute).toHaveBeenLastCalledWith(false)
    await run(300)
    expect(host.textContent).toBe('')
  })

  it('Settings opens the voice settings', async () => {
    await mount()
    await show(SHORT)
    await click(byLabel('Voice, speaking. Open voice actions.'))
    await click(byLabel('Open voice settings'))
    expect(nav).toHaveBeenCalledWith('/settings/voice')
  })

  it('a silent line says it was not spoken, and offers only Settings', async () => {
    await mount()
    // set directly: a real silent short line is gone after 3 s, long before the age matters
    await act(async () => { useCaption.setState({ text: SHORT, kind: 'pill', silent: true, shownAt: Date.now() - 20000 }) })
    await run(10000) // a tick re-reads the age
    expect(host.textContent).toContain('Not spoken, 30 seconds ago')
    expect(host.textContent).toContain(SHORT)
    expect(q('[role="group"]').getAttribute('aria-label')).toBe('Not spoken, 30 seconds ago')
    expect(host.querySelectorAll('button')).toHaveLength(1)
    expect(byLabel('Open voice settings')).toBeTruthy()
  })

  it('a silent line reads "20 seconds ago" at 20 s', async () => {
    await mount()
    await act(async () => { useCaption.setState({ text: SHORT, kind: 'pill', silent: true, shownAt: Date.now() - 20000 }) })
    expect(host.textContent).toContain('Not spoken, 20 seconds ago')
  })

  it('a 13-word line is a card that stays until Dismiss', async () => {
    await mount()
    await show(LONG)
    expect(q('[role="group"]')).toBeNull() // no source given: no group name
    expect(q('.vcap-card')).toBeTruthy()
    for (const l of ['Stop speaking', 'Mute spoken cues', 'Open voice settings']) expect(byLabel(l)).toBeTruthy()
    await run(60000)
    expect(host.textContent).toContain(LONG)
    const dismiss = [...host.querySelectorAll('button')].find(b => b.textContent === 'Dismiss')
    await click(dismiss)
    await run(300)
    expect(host.textContent).toBe('')
  })

  it('a card with a source is a group with that name', async () => {
    await mount()
    await show(LONG, { source: 'Coach' })
    expect(byLabel('Coach').getAttribute('role')).toBe('group')
    expect(host.textContent).toContain('Coach')
  })

  it('a card goes when the rest ends', async () => {
    h.ui = { timer: { left: 30 }, work: null, countIn: null }
    await mount()
    await show(LONG)
    expect(host.textContent).toContain(LONG)
    h.ui = { timer: null, work: null, countIn: null }
    await mount()
    await run(300)
    expect(host.textContent).toBe('')
  })

  it('keeps the page clear of itself while it shows', async () => {
    await mount()
    expect(document.body.classList.contains('vpill')).toBe(false)
    await show(SHORT)
    expect(document.body.classList.contains('vpill')).toBe(true)
    await run(6000)
    await run(300)
    expect(document.body.classList.contains('vpill')).toBe(false)
  })

  it('is gone with the workout, even a muted line', async () => {
    await mount()
    await show(SHORT, { muted: true })
    expect(host.textContent).toContain('Voice is muted for this workout')
    await act(async () => { root.unmount() })
    expect(useCaption.getState().text).toBe('')
    root = createRoot(host)
  })

  it('sits on the rest bar as measured', async () => {
    const bar = document.createElement('div'); bar.id = 'timer'
    Object.defineProperty(bar, 'offsetHeight', { value: 140 })
    document.body.append(bar)
    h.ui = { timer: { left: 30 }, work: null, countIn: null }
    await mount()
    expect(document.body.style.getPropertyValue('--vp-rb')).toBe('140px')
    h.ui = { timer: null, work: null, countIn: null }
    await mount()
    expect(document.body.style.getPropertyValue('--vp-rb')).toBe('')
    bar.remove()
  })

  it('allows four lines and drops the bars at large text', () => {
    const css = readFileSync('src/components/VoicePill.css', 'utf8')
    expect(css).toMatch(/\.text-big \.vcap-line\{-webkit-line-clamp:4\}/)
    expect(css).toMatch(/\.text-big \.vcap-wave\{display:none\}/)
  })
})
