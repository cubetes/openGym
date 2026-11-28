// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, sheets: [], opts: [], mobile: false, voices: { voices: [], auto: null, ios: false }, subs: [], refresh: () => Promise.resolve(), nat: null, natCalls: [], natSubs: [], loc: 'en-GB' }
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
const idleNat = { available: false, debugModel: false, state: 'none', fraction: null, bytes: 0, total: null, error: null }
// The model's state is natural-voice.js's business (its own tests); here it is whatever the test says.
vi.mock('../lib/natural-voice.js', async importOriginal => ({
  ...(await importOriginal()),
  naturalState: () => mocks.nat,
  onNatural: cb => { mocks.natSubs.push(cb); return () => {} },
  refreshNatural: () => { mocks.natCalls.push(['refresh']); return Promise.resolve(mocks.nat) },
  downloadNatural: o => { mocks.natCalls.push(['download', o]); return Promise.resolve('ready') },
  cancelNatural: () => { mocks.natCalls.push(['cancel']); return Promise.resolve() },
  removeNatural: () => { mocks.natCalls.push(['remove']); return Promise.resolve(true) },
}))
vi.mock('../lib/i18n-core.js', async importOriginal => ({ ...(await importOriginal()), dateLocale: () => mocks.loc }))
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

const { cues } = await import('../lib/spoken-cues.js')
const { default: VoiceSettings, VoiceList, voiceRowValue, momentSummary, micErrorText, recordType } = await import('./VoiceSettings.jsx')

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
  mocks.nat = idleNat
  mocks.natCalls = []
  mocks.natSubs = []
  mocks.loc = 'en-GB'
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
    expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).toEqual(['English (UK)', 'English (US)'])
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
    mocks.nat = { ...idleNat, available: true, state: 'ready', bytes: 90e6 }
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
      expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses Anna, your phone’s standard voice.')
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
    it('Automatic names the standard voice; a row reads as one labelled element', async () => {
      phone([{ ...anna, lang: 'en-US' }], null)
      await render(<VoiceList />)
      expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses Anna, your phone’s standard voice.')
      expect(rowTitled('Anna').getAttribute('aria-label')).toBe('Anna, Standard')
      expect(rowTitled('Anna').querySelector('.lrow-i').getAttribute('aria-hidden')).toBe('true')
      expect(rowTitled('Automatic').getAttribute('aria-label')).toBe('Automatic, selected')
      expect([...host.querySelectorAll('.sect-t')].map(e => e.textContent)).toEqual(['English (US)'])
      localStorage.setItem('og_speech_voice', 'anna')
      await render(<VoiceList key="again" />)
      expect(rowTitled('Anna').getAttribute('aria-label')).toBe('Anna, Standard, selected')
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
  describe('Natural voice in the picker', () => {
    afterEach(() => vi.restoreAllMocks())
    const phone = nat => { mocks.mobile = true; mocks.voices = { voices: [{ id: 'anna', name: 'Anna', lang: 'en-GB', online: false }], auto: null, ios: true }; mocks.nat = { ...idleNat, available: true, ...nat } }
    const ready = { state: 'ready', bytes: 88.6e6 }
    const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)
    const headers = () => [...host.querySelectorAll('.sect-t')].map(e => e.textContent)
    const tap = async el => { await act(async () => { el.click() }) }
    it('the offer: size, Download with Wi-Fi only on, and the switch is kept', async () => {
      phone({})
      await render(<VoiceList />)
      expect(headers()).toContain('Natural voice')
      expect(host.textContent).toContain('One download, about 90 MB.')
      expect(host.textContent).toContain('Made on your phone. Nothing leaves it.')
      expect(host.querySelector('[role="switch"]').getAttribute('aria-checked')).toBe('true')
      await tap(button('Download'))
      expect(mocks.natCalls).toContainEqual(['download', { wifiOnly: true }])
      await tap(host.querySelector('[role="switch"]'))
      expect(JSON.parse(localStorage.getItem('gym_natural_v1')).wifiOnly).toBe(false)
      await tap(button('Download'))
      expect(mocks.natCalls.at(-1)).toEqual(['download', { wifiOnly: false }])
    })
    it('Apple’s figure replaces the 90 MB', async () => {
      phone({ total: 120e6 })
      await render(<VoiceList />)
      expect(host.textContent).toContain('One download, about 120 MB.')
    })
    it('the picker asks the model for its state and lets go on leaving', async () => {
      phone({})
      await render(<VoiceList />)
      expect(mocks.natCalls).toContainEqual(['refresh'])
    })
    it('downloading: progress text, a labelled bar, Cancel', async () => {
      phone({ state: 'downloading', fraction: 0.42 })
      await render(<VoiceList />)
      expect(host.textContent).toContain('Downloading')
      expect(host.textContent).toContain('38 of 90 MB · Wi-Fi only')
      const bar = host.querySelector('[role="progressbar"]')
      expect(bar.getAttribute('aria-label')).toBe('Natural voice download, 42 percent')
      expect(bar.getAttribute('aria-valuenow')).toBe('42')
      expect(host.textContent).toContain('The download keeps going while the app is open.')
      await tap(button('Cancel'))
      expect(mocks.natCalls).toContainEqual(['cancel'])
      await tap(host.querySelector('[role="switch"]'))
      await render(<VoiceList key="off" />)
      expect(host.textContent).toContain('38 of 90 MB')
      expect(host.textContent).not.toContain('Wi-Fi only ')
    })
    it('a failed download says so, where it dropped, and Try again downloads', async () => {
      phone({ state: 'downloading', fraction: 0.44 })
      await render(<VoiceList />)
      phone({ state: 'none', error: 'failed' })
      await act(async () => { mocks.natSubs.forEach(cb => cb()) })
      expect(host.textContent).toContain('Download stopped. Try again.')
      expect(host.textContent).toContain('The connection dropped at 40 MB.')
      await tap(button('Try again'))
      expect(mocks.natCalls).toContainEqual(['download', { wifiOnly: true }])
    })
    it('a failure with nothing downloaded or for Wi-Fi leaves the "dropped" line out', async () => {
      phone({ state: 'none', error: 'needs-wifi' })
      await render(<VoiceList />)
      expect(host.textContent).toContain('Download stopped. Try again.')
      expect(host.textContent).not.toContain('The connection dropped')
    })
    it('installed: the header, the badge and three voices; Heart picked shows its check and says it', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceList />)
      expect(headers()[0]).toBe('Natural voice · EnglishInstalled')
      expect(host.querySelector('.vp-pill').textContent).toBe('Installed')
      expect(titles()).toEqual(['Automatic', 'Heart', 'Michael', 'Emma', 'Remove download', 'Anna'])
      expect(rowTitled('Heart').getAttribute('aria-label')).toBe('Heart, Natural voice, US, selected')
      expect(rowTitled('Emma').getAttribute('aria-label')).toBe('Emma, Natural voice, UK')
      expect(rowTitled('Heart').querySelector('.lrow-k')).not.toBeNull()
      expect(rowTitled('Automatic').querySelector('.lrow-k')).toBeNull()
      expect(host.textContent).toContain('Where it has no voice for your language, the Apple voice speaks.')
    })
    it('tapping Heart picks it, loads the model and plays the sample in that voice', async () => {
      phone(ready)
      const prepare = vi.spyOn(cues, 'prepareFixed').mockImplementation(() => {})
      await render(<VoiceList />)
      expect(prepare).not.toHaveBeenCalled()
      await tap(rowTitled('Heart'))
      expect(localStorage.getItem('og_speech_voice')).toBe('natural:af_heart')
      expect(prepare).toHaveBeenCalledTimes(1)
      expect(mocks.opts.at(-1).voice).toBe('natural:af_heart')
      expect(rowTitled('Heart').querySelector('.lrow-k')).not.toBeNull()
      prepare.mockRestore()
    })
    it('opening the page with a usable Natural pick loads the model once', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:am_michael')
      const prepare = vi.spyOn(cues, 'prepareFixed').mockImplementation(() => {})
      await render(<VoiceList />)
      await render(<VoiceList />)
      expect(prepare).toHaveBeenCalledTimes(1)
      prepare.mockRestore()
    })
    it('Remove asks first and removes only after Remove', async () => {
      phone(ready)
      await render(<VoiceList />)
      expect(rowTitled('Remove download').querySelector('.lrow-s').textContent).toBe('Frees 89 MB')
      await tap(rowTitled('Remove download'))
      expect(mocks.natCalls).not.toContainEqual(['remove'])
      expect(mocks.sheets).toHaveLength(1)
      const close = vi.fn()
      await render(mocks.sheets[0](close))
      expect(host.textContent).toContain('Remove Natural voice?')
      expect(host.textContent).toContain('Frees 89 MB. You can download it again.')
      await tap(button('Cancel'))
      expect(mocks.natCalls).not.toContainEqual(['remove'])
      await tap(button('Remove'))
      expect(mocks.natCalls).toContainEqual(['remove'])
    })
    it('a debug model has no Remove row', async () => {
      phone({ ...ready, available: false, debugModel: true })
      await render(<VoiceList />)
      expect(titles()).toContain('Heart')
      expect(titles()).not.toContain('Remove download')
    })
    it('the Apple voices fold into one row while Natural is installed, and open on a tap', async () => {
      phone(ready)
      await render(<VoiceList />)
      expect(headers()).toContain('Apple voices')
      expect(headers()).not.toContain('English (UK)')
      await tap(rowTitled('Anna'))
      expect(headers()).toContain('English (UK)')
    })
    it('the Apple voices row names the voices for a screen reader', async () => {
      phone(ready)
      await render(<VoiceList />)
      expect(host.querySelector('[aria-label="Apple voices, Anna"]')).not.toBeNull()
    })
    it('no Apple voices row at all with no voices listed', async () => {
      phone(ready)
      mocks.voices = { voices: [], auto: null, ios: false }
      await render(<VoiceList />)
      expect(headers()).not.toContain('Apple voices')
    })
    it('picking a voice announces Playing in a polite live region', async () => {
      phone(ready)
      await render(<VoiceList />)
      const live = host.querySelector('#vp-live')
      expect(live.getAttribute('aria-live')).toBe('polite')
      await tap(rowTitled('Heart'))
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })
      expect(live.textContent).toBe('Playing')
    })
    it('a stored Heart pick with no model reads as Automatic, checked, and keeps what is stored', async () => {
      phone({ state: 'none' })
      mocks.voices.auto = { id: 'anna', name: 'Anna', lang: 'en-GB', quality: 'enhanced' }
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceList />)
      expect(rowTitled('Automatic').querySelector('.lrow-k')).not.toBeNull()
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Automatic · Anna')
      expect(titles()).toContain('Pitch')
      expect(localStorage.getItem('og_speech_voice')).toBe('natural:af_heart')
    })
    it('the Voice row reads Natural voice · Heart with the model ready, and Pitch is gone', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceSettings />)
      expect(rowTitled('Voice').querySelector('.lrow-v').textContent).toBe('Natural voice · Heart')
      expect(titles()).not.toContain('Pitch')
    })
    it('a German app gets the note, no Download and no Natural voices', async () => {
      mocks.loc = 'de-DE'
      phone(ready)
      await render(<VoiceList />)
      expect(host.textContent).toMatch(/Not in .+ yet/)
      expect(host.textContent).toContain('Your Apple voice keeps speaking.')
      expect(host.textContent).toContain('Natural voice speaks English for now. Other languages keep the Apple voice.')
      expect(button('Download')).toBeUndefined()
      expect(titles()).not.toContain('Heart')
    })
    it('an iPhone without the downloader and no debug model shows nothing', async () => {
      phone({ available: false })
      await render(<VoiceList />)
      expect(host.textContent).not.toContain('Natural voice')
    })
    it('Android says Natural voice is on iPhone first; no Download', async () => {
      mocks.mobile = true
      mocks.voices = { voices: [{ id: 'g', name: 'Google US English', lang: 'en-US' }], auto: null, ios: false }
      await render(<VoiceList />)
      expect(host.textContent).toContain('Natural voice is on iPhone first. Android uses your phone’s voices for now.')
      expect(button('Download')).toBeUndefined()
    })
    it('the web shows nothing about Natural voice', async () => {
      await render(<VoiceList />)
      expect(host.textContent).not.toContain('Natural voice')
    })
  })
  it('the Timer alerts row names the voice the same way the Voice page does', () => {
    mocks.nat = { ...idleNat, available: true, state: 'ready' }
    expect(voiceRowValue({ voices: [], auto: null, stuck: false }, 'natural:af_heart')).toBe('Natural voice · Heart')
    expect(voiceRowValue({ voices: [], auto: null, stuck: true }, '')).toBe('Standard voice')
    expect(voiceRowValue({ voices: [], auto: { id: 'a', name: 'Ava', lang: 'en-US' }, stuck: false }, '')).toBe('Automatic · Ava')
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
