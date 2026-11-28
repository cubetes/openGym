// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null, sheets: [], opts: [], mobile: false, voices: { voices: [], auto: null, ios: false }, subs: [], refresh: () => Promise.resolve(), nat: null, natCalls: [], natSubs: [], lineCbs: [], loc: 'en-GB' }
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
// The phone tells how long a Natural line really is (rest-alert.js onVoiceLine); here the test says it.
vi.mock('../lib/rest-alert.js', async importOriginal => ({ ...(await importOriginal()), onVoiceLine: cb => { mocks.lineCbs.push(cb); return () => {} } }))
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

const { cues, sampleCue } = await import('../lib/spoken-cues.js')
const { sampleLine, linesFor } = await import('../lib/voice-styles.js')
const { speakMs } = await import('../lib/voice-caption.js')
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
  mocks.lineCbs = []
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
const heroName = () => host.querySelector('.vhero-n')?.textContent
const heroSub = () => host.querySelector('.vhero-s')?.textContent ?? null
const radio = name => [...host.querySelectorAll('[role="radio"]')].find(r => r.getAttribute('aria-label').startsWith(name + ','))
const rowTitled = title => [...host.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)

describe('Settings → Timer alerts → Voice', () => {
  it('shows the hero, the six styles, the moments, then speed and pitch', async () => {
    await render(<VoiceSettings />)
    expect(titles()).toEqual(['Edit these lines', 'When a rest starts', '10 seconds left', 'When the rest is over', 'Before the last set', 'New record', 'Speed', 'Pitch'])
    expect(heroName()).toBe('Automatic')
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(6)
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(2)
    expect(host.querySelector('[role="slider"]').getAttribute('aria-valuetext')).toBe('1×')
    const at = txt => host.textContent.indexOf(txt)
    expect(at('Using now')).toBeLessThan(at('Style'))
    expect(at('Style')).toBeLessThan(at('One rest, in order'))
    expect(at('One rest, in order')).toBeLessThan(at('Fine tune'))
    expect(host.querySelector('.vm-tl').getAttribute('aria-hidden')).toBe('true')
  })
  it('the hero: Using now, the Natural name and tier, one button that opens the picker', async () => {
    localStorage.setItem('og_speech_voice', 'natural:af_heart')
    mocks.nat = { ...idleNat, available: true, state: 'ready', bytes: 90e6 }
    const openList = vi.fn()
    await render(<VoiceSettings openList={openList} />)
    expect(host.textContent).toContain('Using now')
    expect(heroName()).toBe('Heart')
    expect(heroSub()).toBe('Natural voice · US')
    expect(host.querySelector('.vhero .tier-natural.tier-xl')).not.toBeNull()
    const main = host.querySelector('.vhero-main')
    expect(main.getAttribute('aria-label')).toBe('Using now, Heart, Natural voice · US. Change voice')
    expect(main.textContent).toContain('Change')
    await act(async () => { main.click() })
    expect(openList).toHaveBeenCalledTimes(1)
  })
  it('Better voices off: a plain tile and no tier name', async () => {
    localStorage.setItem('og_speech_voice', 'anna')
    mocks.S.modules = { voices: false }
    await render(<VoiceSettings />)
    expect(heroName()).toBe('Anna')
    expect(heroSub()).toBeNull()
    expect(host.querySelector('.vhero .tier-tile').classList.contains('tier-plain')).toBe(true)
    expect(host.querySelector('.vhero-main').getAttribute('aria-label')).toBe('Using now, Anna. Change voice')
  })
  it('Try it is a .btn that reads Playing while the sample plays, then Try it again', async () => {
    await render(<VoiceSettings />) // render waits on a real timer, so fake them after
    vi.useFakeTimers()
    try {
      const btn = () => [...host.querySelectorAll('.btn')].find(b => /^(Try it|Playing)$/.test(b.textContent))
      expect(btn().textContent).toBe('Try it')
      await act(async () => { btn().click() })
      expect(btn().textContent).toBe('Playing')
      expect(host.querySelector('.vhero .tier-tile.playing')).not.toBeNull()
      expect(document.getElementById('vp-live')).not.toBeNull()
      await act(async () => { vi.advanceTimersByTime(speakMs(`${sampleCue('kg')}. ${sampleLine(mocks.S)}`, 1) + 10) })
      expect(btn().textContent).toBe('Try it')
      expect(host.querySelector('.vhero .tier-tile.playing')).toBeNull()
      expect(host.querySelector('.vhero.end')).not.toBeNull()
      await act(async () => { vi.advanceTimersByTime(120) })
      expect(host.querySelector('.vhero.end')).toBeNull()
    } finally { vi.useRealTimers() }
  })
  it('Try it ends on the real length of the line when the Natural voice reports it', async () => {
    await render(<VoiceSettings />)
    vi.useFakeTimers()
    try {
      const btn = () => [...host.querySelectorAll('.btn')].find(b => /^(Try it|Playing)$/.test(b.textContent))
      await act(async () => { btn().click() })
      mocks.lineCbs.at(-1)({ text: sampleLine(mocks.S), ms: 1000 })
      await act(async () => { vi.advanceTimersByTime(1010) })
      expect(btn().textContent).toBe('Try it')
      expect(speakMs(`${sampleCue('kg')}. ${sampleLine(mocks.S)}`, 1)).toBeGreaterThan(1010) // the estimate alone would still be playing
    } finally { vi.useRealTimers() }
  })
  it('anything else that speaks ends Playing', async () => {
    await render(<VoiceSettings />)
    const btn = () => host.querySelector('.vhero-try')
    await act(async () => { btn().click() })
    expect(btn().textContent).toBe('Playing')
    await act(async () => { host.querySelector('.vs-bub').click() })
    expect(btn().textContent).toBe('Try it')
  })
  it('the styles are a radiogroup; a pick keeps the style and says a line', async () => {
    await render(<VoiceSettings />)
    expect(host.querySelector('[role="radiogroup"]').getAttribute('aria-labelledby')).toBe('vp-style-h')
    expect(radio('Just the facts').getAttribute('aria-checked')).toBe('true')
    expect(radio('Calm coach').getAttribute('aria-label')).toBe('Calm coach, 3 of 6')
    expect(host.querySelector('[role="radio"]').getAttribute('aria-label')).toBe('Hype man, 1 of 6')
    expect(radio('Your own lines').classList.contains('own')).toBe(true)
    await act(async () => { radio('Hype man').click() })
    expect(mocks.S.cueStyle).toBe('hype')
    expect(spoken.at(-1).text).toBe('LET’S GO! ONE MORE, CHAMP!')
    await render(<VoiceSettings />)
    expect(radio('Hype man').getAttribute('aria-checked')).toBe('true')
    expect(radio('Hype man').querySelector('.vs-ok')).not.toBeNull()
    expect(radio('Hype man').dataset.find).toBe('Hype man')
  })
  it('the style check pops only on a tap', async () => {
    await render(<VoiceSettings />)
    expect(radio('Just the facts').querySelector('.vs-ok').classList.contains('pop')).toBe(false)
    await act(async () => { radio('Calm coach').click() })
    await render(<VoiceSettings />) // the mocked store does not redraw by itself
    expect(radio('Calm coach').querySelector('.vs-ok').classList.contains('pop')).toBe(true)
  })
  it('the two bubbles play the picked style’s lines', async () => {
    mocks.S.cueStyle = 'hype'
    await render(<VoiceSettings />)
    const bubs = [...host.querySelectorAll('.vs-bub')]
    const [start, over] = [linesFor(mocks.S, 'restStart')[0], linesFor(mocks.S, 'restOver')[0]]
    expect(bubs.map(b => b.getAttribute('aria-label'))).toEqual([`Play: When a rest starts, ${start}`, `Play: When the rest is over, ${over}`])
    await act(async () => { bubs[0].click() })
    expect(spoken.at(-1).text).toBe(start)
    await act(async () => { bubs[1].click() })
    expect(spoken.at(-1).text).toBe(over)
  })
  it('Your own lines has no Edit row; a pack asks twice to replace lines you wrote', async () => {
    mocks.S.cueStyle = 'own'
    await render(<VoiceSettings />)
    expect(titles()).not.toContain('Edit these lines')
    mocks.S = { ...mocks.S, cueStyle: 'calm', cueLines: { restStart: ['mine'] } }
    await render(<VoiceSettings />)
    await act(async () => { rowTitled('Edit these lines').click() })
    expect(mocks.S.cueStyle).toBe('calm')
    expect(host.textContent).toContain('This replaces the lines you wrote before. Tap again to go ahead.')
    await act(async () => { rowTitled('Replace my lines').click() })
    expect(mocks.S.cueStyle).toBe('own')
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
    expect(host.textContent).toContain('Spoken cues are off. Switch them on to hear your next set and the countdown.')
    expect(host.querySelector('.vp-body').hasAttribute('inert')).toBe(true)
    const turnOn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Turn on')
    await act(async () => { turnOn.click() })
    expect(mocks.S.spokenCues).toBe(true)
    await render(<VoiceSettings />)
    expect(host.textContent).not.toContain('Spoken cues are off')
    expect(host.querySelector('.vp-body').hasAttribute('inert')).toBe(false)
  })
  it('a Natural pick hides Pitch', async () => {
    localStorage.setItem('og_speech_voice', 'natural:af_heart')
    mocks.nat = { ...idleNat, available: true, state: 'ready', bytes: 90e6 }
    await render(<VoiceSettings />)
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(1)
    expect(host.textContent).toContain('No pitch for Natural voices.')
    expect(host.querySelector('.vp-nopitch').dataset.find).toBe('Pitch')
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
      expect(heroName()).toBe('Automatic')
      expect(heroSub()).toBe('Standard voice')
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
    it('a Premium voice: nothing to add, no hint, and the hero names it', async () => {
      phone([serena, anna], serena)
      await render(<VoiceSettings />)
      expect(heroName()).toBe('Automatic')
      expect(heroSub()).toBe('Serena · Premium')
      await render(<VoiceList />)
      expect(host.textContent).toContain('You already have a Premium voice. Nothing to add.')
      expect(host.textContent).not.toContain(hint)
      expect(titles()).toEqual(['Automatic', 'Serena', 'Anna'])
      expect(rowTitled('Serena').querySelector('.lrow-v').textContent).toBe('Premium')
      await act(async () => { rowTitled('Automatic').click() })
      expect(mocks.opts.at(-1).voice).toBe('serena')
      expect(localStorage.getItem('og_speech_voice')).toBeNull()
    })
    it('a voice downloaded while away shows in the hero when the refresh lands', async () => {
      phone([anna], null)
      await render(<VoiceSettings />)
      expect(heroSub()).toBe('Standard voice')
      mocks.voices = { voices: [serena, anna], auto: serena, ios: true }
      await act(async () => { mocks.subs.forEach(cb => cb()) })
      expect(heroSub()).toBe('Serena · Premium')
    })
    it('before the first listing the hero shows no voice', async () => {
      phone(null, null, false)
      await render(<VoiceSettings />)
      expect(heroName()).toBe('Automatic')
      expect(heroSub()).toBeNull()
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
        expect(heroName()).toBe('Automatic')
        expect(heroSub()).toBeNull()
        await render(<VoiceList />)
        expect(rowTitled('Automatic').querySelector('.lrow-s')).toBeNull()
        expect(rowTitled('Anna').querySelector('.lrow-v')).toBeNull()
        expect(host.textContent).not.toContain('Read & Speak')
        expect(host.textContent).not.toContain(hint)
      }
    })
    it('a picked voice shows its name in the hero', async () => {
      phone([anna], null)
      localStorage.setItem('og_speech_voice', 'anna')
      await render(<VoiceSettings />)
      expect(heroName()).toBe('Anna')
      expect(heroSub()).toBe('Standard')
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
      expect(prepare).toHaveBeenCalledTimes(1) // Automatic is Natural here: the lines are made ahead
      await tap(rowTitled('Heart'))
      expect(localStorage.getItem('og_speech_voice')).toBe('natural:af_heart')
      expect(prepare).toHaveBeenCalledTimes(2)
      expect(mocks.opts.at(-1).voice).toBe('natural:af_heart')
      expect(rowTitled('Heart').querySelector('.lrow-k')).not.toBeNull()
      prepare.mockRestore()
    })
    it('each Natural row tile and the hero wear their own shade', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:bf_emma')
      await render(<VoiceList />)
      expect(['Heart', 'Michael', 'Emma'].map(n => [...rowTitled(n).querySelector('.tier-tile').classList].filter(c => c.startsWith('nv-')).join())).toEqual(['nv-heart', 'nv-michael', 'nv-emma'])
      expect(rowTitled('Automatic').querySelector('.tier-tile').className).not.toContain('nv-')
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
      phone({ state: 'none' }) // no model: Automatic is an Apple voice and plays at once
      await render(<VoiceList />)
      const live = host.querySelector('#vp-live')
      expect(live.getAttribute('aria-live')).toBe('polite')
      await tap(rowTitled('Automatic'))
      await act(async () => { await new Promise(r => setTimeout(r, 80)) })
      expect(live.textContent).toBe('Playing')
    })
    const lineText = () => sampleLine(mocks.S) || sampleCue('kg')
    const say = ev => mocks.lineCbs.forEach(cb => cb({ text: lineText(), levels: [], ...ev }))
    it('a Natural sample waits: no playing look, the text after 300 ms, both end with the line', async () => {
      phone(ready)
      await render(<VoiceList />)
      vi.useFakeTimers()
      try {
        await tap(rowTitled('Heart'))
        const sub = () => rowTitled('Heart').querySelector('.lrow-s')?.textContent ?? null
        expect(sub()).toBeNull()
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).toBeNull()
        await act(async () => { vi.advanceTimersByTime(299) })
        expect(sub()).toBeNull()
        await act(async () => { vi.advanceTimersByTime(2) })
        expect(sub()).toBe('Loading, please wait…')
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).toBeNull()
        await act(async () => { vi.advanceTimersByTime(60) })
        expect(host.querySelector('#vp-live').textContent).toBe('Loading, please wait…')
        await act(async () => { say({ ms: 2000 }) })
        expect(sub()).toBeNull()
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).not.toBeNull()
      } finally { vi.useRealTimers() }
    })
    it('another line\u2019s event does not end the wait; Playing is announced when the line starts, not at the tap', async () => {
      phone(ready)
      await render(<VoiceList />)
      vi.useFakeTimers()
      try {
        await tap(rowTitled('Heart'))
        await act(async () => { vi.advanceTimersByTime(400) })
        await act(async () => { mocks.lineCbs.forEach(cb => cb({ text: 'a workout cue', levels: [], ms: 900 })) })
        expect(rowTitled('Heart').querySelector('.lrow-s')?.textContent).toBe('Loading, please wait…')
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).toBeNull()
        await act(async () => { vi.advanceTimersByTime(60) })
        expect(host.querySelector('#vp-live').textContent).toBe('Loading, please wait…')
        await act(async () => { say({ ms: 2000 }) })
        await act(async () => { vi.advanceTimersByTime(60) })
        expect(host.querySelector('#vp-live').textContent).toBe('Playing')
      } finally { vi.useRealTimers() }
    })
    it('a cover (the Apple voice speaks the line) ends the wait and the look ends on the estimate, not 15 s later', async () => {
      phone(ready)
      await render(<VoiceList />)
      vi.useFakeTimers()
      try {
        await tap(rowTitled('Heart'))
        await act(async () => { vi.advanceTimersByTime(400) })
        expect(rowTitled('Heart').querySelector('.lrow-s')).not.toBeNull()
        await act(async () => { say({ ms: 0, cover: true }) })
        expect(rowTitled('Heart').querySelector('.lrow-s')).toBeNull()
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).not.toBeNull()
        await act(async () => { vi.advanceTimersByTime(speakMs(lineText(), 1) + 10) })
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).toBeNull()
      } finally { vi.useRealTimers() }
    })
    it('the hero says Playing only once a Natural line starts', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceSettings />)
      vi.useFakeTimers()
      try {
        const btn = () => [...host.querySelectorAll('.btn')].find(b => /^(Try it|Playing)$/.test(b.textContent))
        await act(async () => { btn().click() })
        expect(btn().textContent).toBe('Try it')
        expect(host.querySelector('.vhero.play')).toBeNull()
        await act(async () => { mocks.lineCbs.forEach(cb => cb({ text: sampleCue('kg'), levels: [], ms: 800 })) })
        expect(btn().textContent).toBe('Playing')
        expect(host.querySelector('.vhero.play')).not.toBeNull()
      } finally { vi.useRealTimers() }
    })
    it('a line that starts at once never shows the text', async () => {
      phone(ready)
      await render(<VoiceList />)
      vi.useFakeTimers()
      try {
        await tap(rowTitled('Heart'))
        await act(async () => { say({ ms: 2000 }) })
        await act(async () => { vi.advanceTimersByTime(400) })
        expect(rowTitled('Heart').querySelector('.lrow-s')).toBeNull()
        expect(rowTitled('Heart').querySelector('.tier-tile.playing')).not.toBeNull()
      } finally { vi.useRealTimers() }
    })
    it('an Apple voice plays at the tap and never shows the text', async () => {
      phone(ready)
      await render(<VoiceList />)
      await tap(rowTitled('Anna')) // the folded Apple voices open on a tap
      vi.useFakeTimers()
      try {
        await tap(rowTitled('Anna'))
        expect(rowTitled('Anna').querySelector('.tier-tile.playing')).not.toBeNull()
        await act(async () => { vi.advanceTimersByTime(400) })
        expect(host.textContent).not.toContain('Loading, please wait…')
      } finally { vi.useRealTimers() }
    })
    it('a stored Heart pick with no model reads as Automatic, checked, and keeps what is stored', async () => {
      phone({ state: 'none' })
      mocks.voices.auto = { id: 'anna', name: 'Anna', lang: 'en-GB', quality: 'enhanced' }
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceList />)
      expect(rowTitled('Automatic').querySelector('.lrow-k')).not.toBeNull()
      await render(<VoiceSettings />)
      expect(heroName()).toBe('Automatic')
      expect(heroSub()).toBe('Anna · Enhanced')
      expect(host.querySelectorAll('[role="slider"]')).toHaveLength(2)
      expect(localStorage.getItem('og_speech_voice')).toBe('natural:af_heart')
    })
    it('Automatic with the model ready is Heart in en-US and Emma in en-GB: row, note, hero, no Pitch; not ready, the Apple voice', async () => {
      const apple = { id: 'anna', name: 'Anna', lang: 'en-GB', quality: 'enhanced' }
      for (const [loc, name, region] of [['en-US', 'Heart', 'US'], ['en-GB', 'Emma', 'UK']]) {
        mocks.loc = loc
        phone(ready); mocks.voices.auto = apple
        await render(<VoiceList />)
        expect(rowTitled('Automatic').textContent).toContain(`Uses ${name} (Natural voice), the best voice for your accent.`)
        await render(<VoiceSettings />)
        expect(heroName()).toBe('Automatic')
        expect(heroSub()).toBe(`${name} · Natural voice`)
        expect(host.querySelector('.vhero').className).toContain('tier-natural')
        expect(host.querySelectorAll('[role="slider"]')).toHaveLength(1)
        expect(region).toBeTruthy()
      }
      mocks.loc = 'en-GB'
      phone({ state: 'none' }); mocks.voices.auto = apple
      await render(<VoiceSettings />)
      expect(heroSub()).toBe('Anna · Enhanced')
      expect(host.querySelectorAll('[role="slider"]')).toHaveLength(2)
    })
    it('the hero reads Heart with the model ready, and Pitch is gone', async () => {
      phone(ready)
      localStorage.setItem('og_speech_voice', 'natural:af_heart')
      await render(<VoiceSettings />)
      expect(heroName()).toBe('Heart')
      expect(host.querySelectorAll('[role="slider"]')).toHaveLength(1)
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
    expect(voiceRowValue({ voices: [], auto: null, stuck: true }, '')).toBe('Automatic · Emma') // Automatic is Natural once the model is ready (en-GB)
    mocks.loc = 'en-US'
    expect(voiceRowValue({ voices: [], auto: null, stuck: false }, '')).toBe('Automatic · Heart')
    mocks.loc = 'en-GB'
    mocks.nat = idleNat
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
  it('reduced motion: the waveform and the presses stop, the check only fades', async () => {
    const css = (await import('node:fs')).readFileSync('src/components/VoiceSettings.css', 'utf8')
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toMatch(/vhero-wave i[^}]*animation: none/)
    expect(block).toMatch(/\.vs-tile:active[^}]*transform: none/)
    expect(block).toMatch(/\.vhero\.play \.vhero-wave i \{ transform: scaleY\(\.5\)/)
    expect(block).toMatch(/\.vs-ok\.pop \{ animation: vs-fade/)
    for (const m of block.matchAll(/(transition|animation):([^;}]+)/g)) if (m[2].trim() !== 'none') expect(m[2].trim()).toMatch(/!important$/)
    expect(block).toMatch(/:active \{ transform: none; opacity: \.6 \}/)
    expect(css).toMatch(/\.vhero-main:active \{ transform: scale\(var\(--press-scale-card\)\) \}/)
  })
  describe('the picker: tier tiles, and the plain list with Better voices off', () => {
    const ava = { id: 'ava', name: 'Ava', lang: 'en-US', online: false, quality: 'premium' }
    const anna = { id: 'anna', name: 'Anna', lang: 'en-US', online: false }
    const net = { id: 'net', name: 'Nora', lang: 'en-US', online: true }
    const phone = (nat, voices = [ava, anna], auto = ava) => { mocks.mobile = true; mocks.voices = { voices, auto, ios: true }; mocks.nat = { ...idleNat, available: true, ...nat } }
    const tiles = row => [...row.querySelectorAll('.tier-tile')]
    it('on: a legend in ladder order, a note for a screen reader, and a tile on every row', async () => {
      phone({ state: 'ready', bytes: 88e6 })
      localStorage.setItem('og_speech_voice', 'ava') // a pick among the Apple voices keeps them unfolded
      await render(<VoiceList />)
      const legend = host.querySelector('.vp-legend')
      expect(legend.getAttribute('aria-hidden')).toBe('true')
      expect([...legend.querySelectorAll('.tier-tile')].map(e => e.className.match(/tier-(natural|premium|enhanced|standard|online)\b/)[1])).toEqual(['natural', 'premium', 'enhanced', 'standard'])
      expect(host.querySelector('.vp-legend + .vh').textContent).toBe('Voice types: Natural, Premium, Enhanced, Standard')
      expect(legend.textContent).toBe('NaturalPremiumEnhancedStandard')
      expect(tiles(rowTitled('Ava'))[0].classList.contains('tier-premium')).toBe(true)
      expect(tiles(rowTitled('Anna'))[0].classList.contains('tier-standard')).toBe(true)
      expect(tiles(rowTitled('Heart'))[0].classList.contains('tier-natural')).toBe(true)
      expect(tiles(rowTitled('Automatic'))[0].classList.contains('tier-plain')).toBe(true)
      expect(rowTitled('Ava').querySelector('.lrow-v').textContent).toBe('Premium')
      expect(rowTitled('Ava').querySelector('.tier-tile').getAttribute('aria-hidden')).toBe('true')
    })
    it('on: Needs internet joins the legend, last, only when a voice is online; no Natural without the downloader', async () => {
      phone({ available: false }, [ava, net])
      await render(<VoiceList />)
      expect([...host.querySelectorAll('.vp-legend .tier-tile')].pop().classList.contains('tier-online')).toBe(true)
      expect(host.querySelector('.vp-legend + .vh').textContent).toBe('Voice types: Premium, Enhanced, Standard, Needs internet')
      expect(tiles(rowTitled('Nora'))[0].classList.contains('tier-online')).toBe(true)
    })
    it('on: the row that was picked shows its sample playing in the tile until the sample ends', async () => {
      phone({})
      await render(<VoiceList />)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await act(async () => { rowTitled('Ava').click() })
        expect(tiles(rowTitled('Ava'))[0].classList.contains('playing')).toBe(true)
        await act(async () => { vi.advanceTimersByTime(speakMs(sampleLine(mocks.S) || sampleCue('kg'), 1) + 50) })
        expect(tiles(rowTitled('Ava'))[0].classList.contains('playing')).toBe(false)
      } finally { vi.useRealTimers() }
    })
    it('on: a Natural pick ends its playing look on the real length, not the estimate', async () => {
      phone({ state: 'ready', bytes: 88e6 })
      await render(<VoiceList />)
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await act(async () => { rowTitled('Heart').click() })
        const text = sampleLine(mocks.S) || sampleCue('kg')
        mocks.lineCbs.at(-1)({ text: 'another line', ms: 100 })
        mocks.lineCbs.at(-1)({ text, ms: 400 })
        await act(async () => { vi.advanceTimersByTime(410) })
        expect(tiles(rowTitled('Heart'))[0].classList.contains('playing')).toBe(false)
        expect(speakMs(text, 1)).toBeGreaterThan(410)
      } finally { vi.useRealTimers() }
    })
    it('on: Natural rows that arrive after a download enter in a stagger; ones that were there do not', async () => {
      phone({ state: 'downloading', fraction: 0.5 })
      await render(<VoiceList />)
      mocks.nat = { ...idleNat, available: true, state: 'ready', bytes: 88e6, installedAt: 1001 }
      await act(async () => { mocks.natSubs.forEach(cb => cb()) })
      expect(rowTitled('Heart').classList.contains('vp-in')).toBe(true)
      expect(rowTitled('Michael').style.getPropertyValue('--i')).toBe('2')
      expect(host.querySelector('.vp-head').classList.contains('vp-in')).toBe(true)
      await render(<VoiceList key="fresh" />)
      expect(rowTitled('Heart').classList.contains('vp-in')).toBe(false)
    })
    it('a download that ended while away is still shown arriving, once', async () => {
      phone({ state: 'ready', bytes: 88e6, installedAt: 2002 })
      await render(<VoiceList />)
      expect(rowTitled('Heart').classList.contains('vp-in')).toBe(true)
      await render(<VoiceList key="again" />)
      expect(rowTitled('Heart').classList.contains('vp-in')).toBe(false)
    })
    it('the download bar scales instead of growing a width', async () => {
      phone({ state: 'downloading', fraction: 0.42 })
      await render(<VoiceList />)
      const fill = host.querySelector('.vp-bar i')
      expect(fill.getAttribute('style')).toBe('--p: 0.42;')
      const css = (await import('node:fs')).readFileSync('src/index.css', 'utf8')
      expect(css).toMatch(/\.vp-bar i\{[^}]*transform:scaleX\(var\(--p/)
      expect(css).toMatch(/\.vp-bar i\{[^}]*transition:transform 1s linear/)
    })
    describe('off', () => {
      beforeEach(() => { mocks.S.modules = { voices: false } })
      it('a plain list: Automatic, then the voices by accent, no tiles, tiers, legend, Natural or hint', async () => {
        phone({ state: 'ready', bytes: 88e6 }, [anna, net], ava)
        await render(<VoiceList />)
        expect(host.querySelector('[class*="tier-"]')).toBeNull()
        expect(host.querySelector('.vp-legend')).toBeNull()
        expect(titles()).toEqual(['Automatic', 'Anna', 'Nora'])
        expect(host.textContent).not.toContain('Natural voice')
        expect(host.textContent).not.toContain('Better voices are free')
        expect(host.textContent).not.toContain('Standard')
        expect(host.textContent).not.toContain('Premium')
        expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses Ava, the best voice for your accent.')
        expect(rowTitled('Nora').querySelector('.lrow-s').textContent).toBe('Needs internet')
        expect(rowTitled('Anna').querySelector('.lrow-s')).toBeNull()
      })
      it('no free-voices hint and no Premium note, with or without a Premium voice', async () => {
        phone({}, [anna], null)
        await render(<VoiceList />)
        expect(host.textContent).not.toContain('Better voices are free')
        expect(rowTitled('Automatic').querySelector('.lrow-s').textContent).toBe('Uses Anna, your phone’s standard voice.')
        phone({}, [ava, anna], ava)
        await render(<VoiceList key="p" />)
        expect(host.textContent).not.toContain('Nothing to add')
      })
      it('a stored Natural pick reads as Automatic, and is kept', async () => {
        phone({ state: 'ready', bytes: 88e6 })
        localStorage.setItem('og_speech_voice', 'natural:af_heart')
        await render(<VoiceList />)
        expect(rowTitled('Automatic').querySelector('.lrow-k')).not.toBeNull()
        expect(host.querySelectorAll('.lrow-k')).toHaveLength(1)
        expect(localStorage.getItem('og_speech_voice')).toBe('natural:af_heart')
      })
      it('the picker check pops only on a pick', async () => {
        phone({}, [ava, anna])
        localStorage.setItem('og_speech_voice', 'ava')
        await render(<VoiceList />)
        expect(host.querySelector('.vp-pick')).toBeNull()
        await act(async () => { rowTitled('Anna').click() })
        expect(rowTitled('Anna').classList.contains('vp-pick')).toBe(true)
      })
      it('an Apple pick keeps its check', async () => {
        phone({}, [ava, anna])
        localStorage.setItem('og_speech_voice', 'anna')
        await render(<VoiceList />)
        expect(rowTitled('Anna').querySelector('.lrow-k')).not.toBeNull()
        expect(rowTitled('Automatic').querySelector('.lrow-k')).toBeNull()
      })
    })
    it('reduced motion: the check and the new rows fade, the bar does not slide', async () => {
      const css = (await import('node:fs')).readFileSync('src/components/VoiceSettings.css', 'utf8')
      const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
      expect(block).toMatch(/\.vp-in \{ animation: vs-fade 140ms linear both !important/)
      expect(block).toMatch(/\.vp-voice\.vp-pick \.lrow-k \{ animation: vs-fade 140ms linear both !important/)
      const idx = (await import('node:fs')).readFileSync('src/index.css', 'utf8')
      expect(idx).toMatch(/prefers-reduced-motion:reduce\)\{[^@]*\.vp-bar i\{transition:none/)
    })
  })
  it('the microphone and the recorder', () => {
    expect(micErrorText({ name: 'NotAllowedError' })).toMatch(/microphone is off/)
    expect(micErrorText(new Error('x'))).toMatch(/No microphone/)
    expect(recordType({ isTypeSupported: x => x === 'audio/webm' })).toBe('audio/webm')
    expect(recordType(undefined)).toBe('')
  })
})
