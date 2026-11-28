// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, sheets: [], opts: [], mobile: false, voices: { voices: [], auto: null, ios: false }, subs: [], refresh: () => Promise.resolve() }
  state.snapshot = () => ({ S: state.S, update: mut => { const next = structuredClone(state.S); mut(next); state.S = next } })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => (selector ? selector(mocks.snapshot()) : mocks.snapshot())
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: render => { mocks.sheets.push(render) } })
  const useUI = selector => (selector ? selector(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/mobile.js', () => ({ get MOBILE() { return mocks.mobile }, nativePlatform: () => Promise.resolve(null) }))
// The phone's voice list is the lib's business (speech.test.js); here it is whatever the test says.
vi.mock('../lib/speech.js', async importOriginal => {
  const o = await importOriginal()
  return {
    ...o,
    speak: (text, opts) => { mocks.opts.push(opts); return o.speak(text, opts) },
    voiceState: () => mocks.voices,
    onVoices: cb => { mocks.subs.push(cb); return () => {} },
    refreshVoices: () => mocks.refresh(),
  }
})

const { default: VoiceSettings, VoiceList, momentSummary, micErrorText, recordType } = await import('./VoiceSettings.jsx')

let host, root, spoken
beforeEach(() => {
  spoken = []
  window.SpeechSynthesisUtterance = function (text) { this.text = text }
  window.speechSynthesis = { speak: u => spoken.push(u), cancel: () => {}, getVoices: () => [{ voiceURI: 'anna', name: 'Anna', lang: 'en-GB', localService: true }, { voiceURI: 'hans', name: 'Hans', lang: 'de-DE' }] }
  mocks.S = { unit: 'kg', spokenCues: true }
  mocks.sheets = []
  mocks.opts = []
  mocks.subs = []
  mocks.refresh = () => Promise.resolve()
  mocks.mobile = false
  mocks.voices = { voices: [{ id: 'anna', name: 'Anna', lang: 'en-GB', online: false }], auto: null, ios: false }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
  try { localStorage.clear() } catch { /* */ }
})

const render = async el => { await act(async () => { root.render(el) }); await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const titles = () => [...host.querySelectorAll('.lrow .lrow-t')].map(e => e.textContent)
const rowTitled = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)

describe('Settings → Timer alerts → Voice', () => {
  it('shows the voice, speed, pitch, the styles and the moments', async () => {
    await render(<VoiceSettings />)
    expect(titles()).toEqual(['Voice', 'Speed', 'Pitch', 'Try it', 'Just the facts', 'Calm coach', 'Drill sergeant', 'Hype man', 'Deadpan', 'Your own lines',
      'When a rest starts', '10 seconds left', 'When the rest is over', 'Before the last set', 'New record'])
    expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic')
    expect(rowTitled('Just the facts').querySelector('.lrow-k')).not.toBeNull()
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(2)
    expect(host.querySelector('[role="slider"]').getAttribute('aria-valuetext')).toBe('1×')
  })
  it('picking a style says one of its lines and keeps it', async () => {
    await render(<VoiceSettings />)
    await act(async () => { rowTitled('Hype man').click() })
    expect(mocks.S.cueStyle).toBe('hype')
    expect(spoken.at(-1).text).toBe('LET’S GO! ONE MORE, CHAMP!')
  })
  it('the Voice row opens the picker page', async () => {
    const openList = vi.fn()
    await render(<VoiceSettings openList={openList} />)
    await act(async () => { rowTitled('Voice').click() })
    expect(openList).toHaveBeenCalledTimes(1)
  })
  it('the picker lists this language’s voices; a pick is kept on this device', async () => {
    await render(<VoiceList />)
    expect(titles()).toEqual(['Automatic', 'Anna'])
    expect(rowTitled('Automatic').querySelector('.lrow-k')).not.toBeNull()
    await act(async () => { rowTitled('Anna').click() })
    expect(localStorage.getItem('og_speech_voice')).toBe('anna')
    expect(spoken.at(-1).voice.name).toBe('Anna')
    expect(rowTitled('Anna').querySelector('.lrow-k')).not.toBeNull()
    expect(rowTitled('Automatic').querySelector('.lrow-k')).toBeNull()
  })
  it('a voice picked before shows the check when the page opens', async () => {
    localStorage.setItem('og_speech_voice', 'anna')
    await render(<VoiceList />)
    expect(rowTitled('Anna').querySelector('.lrow-k')).not.toBeNull()
    expect(rowTitled('Automatic').querySelector('.lrow-k')).toBeNull()
  })
  it('the picker groups voices by language', async () => {
    mocks.voices = { voices: [{ id: 'anna', name: 'Anna', lang: 'en-GB' }, { id: 'tom', name: 'Tom', lang: 'en-US' }, { id: 'bob', name: 'Bob', lang: 'en-GB' }], auto: null, ios: false }
    await render(<VoiceList />)
    expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).toEqual(['British English', 'American English'])
  })
  it('cues off: a notice with Turn on, which switches them on', async () => {
    mocks.S.spokenCues = false
    await render(<VoiceSettings />)
    expect(host.textContent).toContain('Spoken cues are off')
    const turnOn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Turn on')
    await act(async () => { turnOn.click() })
    expect(mocks.S.spokenCues).toBe(true)
    await render(<VoiceSettings />)
    expect(host.textContent).not.toContain('Spoken cues are off')
  })
  it('a Natural pick hides Pitch', async () => {
    localStorage.setItem('og_speech_voice', 'natural:af_heart')
    await render(<VoiceSettings />)
    expect(titles()).not.toContain('Pitch')
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(1)
  })
  describe('the picker and the iPhone hint', () => {
    const phone = (voices, auto, ios = true) => { mocks.mobile = true; mocks.voices = { voices, auto, ios } }
    const anna = { id: 'anna', name: 'Anna', lang: 'en-GB', online: false }
    const serena = { id: 'serena', name: 'Serena', lang: 'en-GB', online: false, quality: 'premium' }
    const nicky = { id: 'nicky', name: 'Nicky', lang: 'en-GB', online: false, quality: 'enhanced' }
    const hint = 'Better voices are free'
    const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)
    it('a stuck iPhone says Standard voice and the picker says how to get better ones', async () => {
      phone([anna], null)
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Standard voice')
      await render(<VoiceList />)
      expect(host.textContent).toContain(hint)
      expect(host.textContent).toContain('Settings > Accessibility > Read & Speak > Voices')
      expect(host.textContent).not.toContain('Nothing to add')
      expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses your phone’s standard voice.')
      expect(rowTitled('Anna').querySelector('.lrow-v').textContent).toBe('Standard')
    })
    it('Show me how opens the steps and Done closes them', async () => {
      phone([anna], null)
      await render(<VoiceList />)
      await act(async () => { button('Show me how').click() })
      expect(mocks.sheets).toHaveLength(1)
      const close = vi.fn()
      await render(mocks.sheets[0](close))
      expect(host.textContent).toContain('Tap Accessibility, then Read & Speak.')
      expect(host.querySelectorAll('li')).toHaveLength(4)
      await act(async () => { button('Done').click() })
      expect(close).toHaveBeenCalledTimes(1)
    })
    it('an Enhanced voice still gets the hint, and Automatic names it', async () => {
      phone([nicky, anna], nicky)
      await render(<VoiceList />)
      expect(host.textContent).toContain(hint)
      expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses Nicky (Enhanced), the best voice for your accent.')
      expect(rowTitled('Nicky').querySelector('.lrow-v').textContent).toBe('Enhanced')
    })
    it('a Premium voice: nothing to add, no hint, and the Voice row names it', async () => {
      phone([serena, anna], serena)
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic · Serena')
      await render(<VoiceList />)
      expect(host.textContent).toContain('You already have a Premium voice. Nothing to add.')
      expect(host.textContent).not.toContain(hint)
      expect(titles()).toEqual(['Automatic', 'Serena', 'Anna'])
      expect(rowTitled('Serena').querySelector('.lrow-v').textContent).toBe('Premium')
      await act(async () => { rowTitled('Automatic').click() })
      expect(mocks.opts.at(-1).voice).toBe('serena')
      expect(localStorage.getItem('og_speech_voice')).toBeNull()
    })
    it('a voice downloaded while away shows in the Voice row when the refresh lands', async () => {
      phone([anna], null)
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Standard voice')
      mocks.voices = { voices: [serena, anna], auto: serena, ios: true }
      await act(async () => { mocks.subs.forEach(cb => cb()) })
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic · Serena')
    })
    it('before the first listing the Voice row shows no value', async () => {
      phone(null, null, false)
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v')).toBeNull()
    })
    it('a listing that fails still lets the picker open, with nothing to pick', async () => {
      phone(null, null, false)
      mocks.refresh = () => Promise.reject(new Error('no list'))
      await render(<VoiceList />)
      expect(host.textContent).toContain('No other voices')
    })
    it('Android and the web get no subtitle, no tier and no hint', async () => {
      for (const mobile of [true, false]) {
        phone([anna], null, false)
        mocks.mobile = mobile
        await render(<VoiceSettings />)
        expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic')
        await render(<VoiceList />)
        expect(rowTitled('Automatic').querySelector('.lrow-s')).toBeNull()
        expect(rowTitled('Anna').querySelector('.lrow-v')).toBeNull()
        expect(host.textContent).not.toContain('Read & Speak')
        expect(host.textContent).not.toContain(hint)
      }
    })
    it('a picked voice shows its name in the Voice row', async () => {
      phone([anna], null)
      localStorage.setItem('og_speech_voice', 'anna')
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Anna')
    })
  })
  it('a moment says what it holds', () => {
    const m = { kind: 'audio', hash: 'a'.repeat(64), mime: 'audio/wav', size: 10, width: 1, height: 1, dur: 1 }
    expect(momentSummary({}, 'restOver')).toBe('Rest is over')
    expect(momentSummary({}, 'record')).toBe('Quiet')
    expect(momentSummary({ sounds: [{ id: 'v', name: 'x', m, voice: 'record' }] }, 'record')).toBe('Your clip')
  })
  it('editing a pack’s lines makes them your own', async () => {
    mocks.S.cueStyle = 'drill'
    await render(<VoiceSettings />)
    await act(async () => { rowTitled('New record').click() })
    await render(mocks.sheets[0](() => {}))
    expect(titles()).toContain('New record. I am almost impressed.')
    await act(async () => { rowTitled('Edit these lines').click() })
    expect(mocks.S.cueStyle).toBe('own')
    expect(mocks.S.cueLines.record).toEqual(['New record. I am almost impressed.', 'Personal best! Don’t let it go to your head.'])
    expect(mocks.S.cueLines.restOver).toEqual(['Break’s over. Move it!', 'Back on the bar. That was not a request.'])
  })
  it('the microphone and the recorder', () => {
    expect(micErrorText({ name: 'NotAllowedError' })).toMatch(/microphone is off/)
    expect(micErrorText(new Error('x'))).toMatch(/No microphone/)
    expect(recordType({ isTypeSupported: x => x === 'audio/webm' })).toBe('audio/webm')
    expect(recordType(undefined)).toBe('')
  })
})
