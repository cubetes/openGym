// Settings → Timer alerts → Voice (v1.4.5): how the spoken cues sound.
//
//   the voice     one of this device's own voices for the app's language (lib/speech.js
//                 listVoices), kept on this device; speed and pitch, which sync
//   the style     a pack of lines per moment (lib/voice-styles.js), or lines of your own
//   the moments   per moment: its lines (read, or written when the style is your own) and up to
//                 three clips of your own, recorded here or picked from a file (lib/voice-clips.js),
//                 played instead of the line
//
// Everything here happens on the device: the voices are the phone's or the browser's, a clip is
// recorded and trimmed in the page (lib/sound-ingest.js), and a clip stays with the account that
// made it (never in the community library). Nothing imitates a real person.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore } from '../store/useStore.js'
import { savePrefs } from '../lib/device-prefs-sync.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { speak, hush, voiceState, onVoices, refreshVoices, langName, speechLang, voiceLabel, voiceOpts, pickedVoice, setPickedVoice, speechRateNum, speechPitchNum, setSpeechRate, setSpeechPitch, speechSupported, SPEECH_MIN, SPEECH_MAX } from '../lib/speech.js'
import { isNatural, autoNatural, NATURAL_VOICES, NATURAL_MB, naturalState, onNatural, refreshNatural, downloadNatural, cancelNatural, removeNatural, readPrefs, writePrefs } from '../lib/natural-voice.js'
import { sampleCue, cues } from '../lib/spoken-cues.js'
import { confirmSheet } from '../sheets.jsx'
import { MOMENTS, MOMENT_COPY, STYLE_COPY, cueStyleOf, linesFor, ownLines, setOwnLines, startOwnFrom, hasOwnLines, sampleLine, LINES_MAX, LINE_MAX } from '../lib/voice-styles.js'
import { voiceClipsOf, addVoiceClip, removeVoiceClip, CLIPS_PER_MOMENT, CLIP_SEC } from '../lib/voice-clips.js'
import { MOBILE } from '../lib/mobile.js'
import { mediaStore } from '../lib/media-store.js'
import { fmtClip } from '../lib/media-refs.js'
import { unlock, chime } from '../lib/sound.js'
import { soundErrorText } from './OwnSounds.jsx'
import { Section, Row, Slider, Switch, Button, TextField } from './ui.jsx'
import Icon from './Icon.jsx'
import TierTile, { tierKey, tierName, useEnding, accentClass } from './VoiceTier.jsx'
import { isOn } from '../lib/modules.js'
import { speakMs } from '../lib/voice-caption.js'
import { onVoiceLine } from '../lib/rest-alert.js'
import './VoiceSettings.css'

const toast = m => useUI.getState().toast(m)
const S_ = () => useStore.getState().S
// A sample is audible only: this tells a screen reader it started (the live region sits in the picker and the settings page).
const announce = msg => {
  const live = document.getElementById('vp-live')
  if (!live) return
  live.textContent = ''
  setTimeout(() => { live.textContent = msg }, 50)
}
const announcePlaying = () => announce(t('Playing'))
// A Natural sample waits for the model: 0 = not waiting, 1 = waiting (nothing plays yet), 2 = waiting and the text shows (after 300 ms, so cached lines never flash it).
let wait = 0, waitT = 0, offWait = () => {}
const waitSubs = new Set()
const setWait = v => { wait = v; waitSubs.forEach(f => f()) }
const stopWait = () => { clearTimeout(waitT); offWait(); if (wait) setWait(0) }
const startWait = text => {
  stopWait()
  setWait(1)
  // The phone sends the line's event when it starts (a cover too: the Apple voice speaks it); a workout cue's event is not this sample's.
  offWait = onVoiceLine(ev => { if (ev?.text === text) { stopWait(); if (!ev.dropped) announcePlaying() } })
  waitT = setTimeout(() => {
    setWait(2); announce(t('Loading, please wait…'))
    waitT = setTimeout(stopWait, 105000) // safety net: the phone waits no longer than 90 s for the model (the first load after an update is slow) plus 15 s
  }, 300)
}
const useWait = () => useSyncExternalStore(f => { waitSubs.add(f); return () => waitSubs.delete(f) }, () => wait)
let celebrated = 0 // the Natural install the picker has already shown arriving
let endPlaying = null // the hero's Playing state; anything else that speaks ends it
const sayIt = (text, extra = {}) => {
  const o = { ...voiceOpts(S_()), queue: false, patient: true, ...extra }
  endPlaying?.(); hush(); stopWait()
  if (isNatural(o.voice)) startWait(text); else announcePlaying()
  speak(text, o)
}
let offLine = () => {}
/** Calls `done` once `last` has been said: when the Natural voice reports the line's real length, else after the word-count estimate for `all` (Apple voices report none). */
// A Natural sample may wait for the model (up to 90 s load, then 15 s: RestAlertPlugin patient wait): the estimate must not end it before it starts.
const endAfter = (timer, all, last, speed, done, natural = false) => {
  clearTimeout(timer.current)
  offLine()
  const end = () => { stopWait(); done() }
  timer.current = setTimeout(end, speakMs(all, speed) + (natural ? 105000 : 0))
  offLine = onVoiceLine(ev => {
    if (ev?.text === last && ev.dropped) { end(); return } // a newer line replaced it while the model loaded: nothing will play
    if (ev?.text !== last || !(ev.ms > 0 || ev.cover)) return
    clearTimeout(timer.current)
    timer.current = setTimeout(end, ev.cover ? speakMs(last, speed) : ev.ms) // a cover has no length: the plain estimate
  })
}
const fmtX = n => `${Math.round(n * 100) / 100}×`

/** Why the microphone could not be used, as a sentence. */
export function micErrorText(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return t('The microphone is off for openGym. Allow it in your phone’s settings and try again.')
  return t('No microphone here. Pick a file instead.')
}

/** The MediaRecorder type this browser can write, or '' for its default. */
export function recordType(MR = globalThis.MediaRecorder) {
  if (!MR || typeof MR.isTypeSupported !== 'function') return ''
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(x => { try { return MR.isTypeSupported(x) } catch { return false } }) || ''
}
export const canRecord = () => typeof globalThis.MediaRecorder === 'function' && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

/** The phone's voice list ({ voices, auto, ios }); refreshed on mount so a voice downloaded while away shows. */
export function useVoices() {
  const [st, setSt] = useState(voiceState)
  useEffect(() => {
    const off = onVoices(() => setSt(voiceState()))
    // A failed listing is an empty one: the sheet still opens, as it did before the list was cached.
    refreshVoices().catch(() => setSt(s => (s.voices ? s : { ...s, voices: [] })))
    return off
  }, [])
  return st
}

// The tier word on a row: Premium and Enhanced everywhere, Standard only on the iPhone (Android has no ladder).
const tierWord = (v, ios) => (v.quality === 'premium' || v.quality === 'enhanced' ? tierName(v.quality) : ios ? tierName('standard') : null)
const LADDER = ['natural', 'premium', 'enhanced', 'standard']
const legendName = k => (k === 'natural' ? t('Natural') : tierName(k)) // short, so the legend fits one line

/** The Natural voice model's state; refreshed on mount, so a download that ended while away shows. */
function useNatural() {
  const [st, setSt] = useState(naturalState)
  useEffect(() => {
    const off = onNatural(() => setSt(naturalState()))
    refreshNatural()
    return off
  }, [])
  return st
}
const mbOf = bytes => Math.round(bytes / 1e6)

/** The Natural voice Automatic speaks with now ('' pick, model ready, English), or undefined. */
const autoNat = cur => (cur ? undefined : NATURAL_VOICES.find(v => v.id === autoNatural(speechLang(), naturalState())))

/** What the Voice row says. `cur` is the usable pick, so an unusable Natural pick reads as Automatic (Ruling 7). */
export function voiceRowValue({ voices, auto, stuck }, cur) {
  const nat = NATURAL_VOICES.find(v => v.id === cur)
  if (nat) return t('Natural voice · {0}', nat.name)
  const an = autoNat(cur)
  if (an) return t('Automatic · {0}', an.name)
  if (voices === null) return null
  const picked = voices.find(v => v.id === cur)
  if (picked) return voiceLabel(picked)
  return stuck ? t('Standard voice') : auto ? t('Automatic · {0}', voiceLabel(auto)) : t('Automatic')
}

/** The four steps to a better Apple voice. The menu names are the verified iPhone ones. */
function StepsSheet({ close, lang }) {
  const steps = [t('Open the iPhone Settings app.'), t('Tap Accessibility, then Read & Speak.'), t('Tap Voices, then {0}.', lang), t('Download a voice marked Premium or Enhanced.')]
  return <>
    <h3>{isEnglish() ? t('Get a better voice') : t('Get a better {0} voice', lang)}</h3>
    <ol className="vp-steps">{steps.map((s, i) => <li key={i}><span className="vp-n" aria-hidden="true">{i + 1}</span>{s}</li>)}</ol>
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
/** "English (US)", "English (UK)", "German (Germany)": the language, then its region, in the app's language. */
function groupName(tag) {
  const [lang, region] = String(tag).split(/[-_]/)
  const name = langName(lang) || tag
  if (!/^[a-z]{2}$/i.test(region || '')) return name
  const R = region.toUpperCase()
  let r = R === 'US' ? 'US' : R === 'GB' ? 'UK' : ''
  try { r = r || new Intl.DisplayNames([speechLang()], { type: 'region' }).of(R) || R } catch { r = R }
  return `${name} (${r})`
}
const isEnglish = () => speechLang().split('-')[0] === 'en'

/** Settings > Timer alerts > Voice > Choose a voice: Automatic, then this language's voices, by tier. */
export function VoiceList() {
  const { voices: list, auto, ios } = useVoices()
  const voices = list || []
  const nat = useNatural()
  const on = isOn(useStore(s => s.S), 'voices')
  const [, redraw] = useState(0)
  const [playKey, setPlayKey] = useState(null) // the row whose sample plays: its voice id, or 'auto'
  const timer = useRef(0)
  const w = useWait()
  useEffect(() => () => { clearTimeout(timer.current); offLine(); stopWait() }, [])
  const [before] = useState(() => celebrated)
  const fresh = nat.state === 'ready' && nat.installedAt > before // an install this picker has not shown yet; stays true for this visit
  useEffect(() => { if (nat.state === 'ready') celebrated = Math.max(celebrated, nat.installedAt || 0) }, [nat.state, nat.installedAt]) // shown now: the next visit starts calm
  // read each render: it turns '' when the model goes away. With Better voices off a Natural pick reads as Automatic; the pick itself stays stored.
  const stored = pickedVoice()
  const cur = !on && isNatural(stored) ? '' : stored
  const autoN = on ? autoNat(cur) : undefined // what Automatic speaks with when that is a Natural voice
  const pick = (id, say = id) => {
    setPickedVoice(id)
    savePrefs(useStore.getState().update)
    redraw(n => n + 1)
    const text = sampleLine(S_()) || sampleCue(S_().unit)
    sayIt(text, { voice: say, ...(isNatural(say) ? { fallback: auto?.id || '' } : {}) })
    setPlayKey(id || 'auto')
    endAfter(timer, text, text, speechRateNum(S_()), () => setPlayKey(null), isNatural(say))
  }
  const tile = (key, id, glyph, accent = id) => on ? <TierTile tier={key} glyph={glyph} accent={accentClass(accent)} playing={playKey === (id || 'auto') && !w} /> : null
  const rowCls = id => 'vp-voice' + (playKey === (id || 'auto') ? ' vp-pick' : '') // the check pops on a pick, not on a visit
  // Opening the page with a Natural pick (or Automatic speaking Natural), or picking one, has the model make the fixed lines ahead; prepareFixed does nothing for an Apple voice.
  useEffect(() => { cues.prepareFixed() }, [cur, autoN?.id])
  const [showApple, setShowApple] = useState(false)
  const lang = langName(speechLang().split('-')[0])
  const premium = voices.some(v => v.quality === 'premium')
  // With no Premium or Enhanced voice, voiceOpts passes '' and the phone speaks its default for the language, which is the top of this ranked list in practice; the name is that list's first voice.
  const autoNote = !ios ? null : autoN
    ? t('Uses {0} ({1}), the best voice for your accent.', autoN.name, tierName('natural'))
    : auto
    ? (on ? t('Uses {0} ({1}), the best voice for your accent.', voiceLabel(auto), tierName(tierKey(auto))) : t('Uses {0}, the best voice for your accent.', voiceLabel(auto)))
    : voices[0] ? t('Uses {0}, your phone’s standard voice.', voiceLabel(voices[0])) : t('Uses your phone’s standard voice.')
  const sel = on => (on ? ', ' + t('selected') : '')
  const groups = []
  for (const v of voices) {
    const g = groups.find(x => x.lang === v.lang)
    if (g) g.voices.push(v); else groups.push({ lang: v.lang, voices: [v] })
  }
  const apple = <>
    {groups.map(g => <Section key={g.lang} title={groupName(g.lang)}>
      {g.voices.map(v => <Row key={v.id} icon={tile(tierKey(v, { ios }), v.id)} title={voiceLabel(v)} ariaLabel={[voiceLabel(v), on && tierWord(v, ios)].filter(Boolean).join(', ') + sel(cur === v.id)}
        subtitle={v.online ? t('Needs internet') : null} value={on ? tierWord(v, ios) : null} className={rowCls(v.id)}
        accessory={cur === v.id ? 'check' : 'none'} onClick={() => pick(v.id)} />)}
    </Section>)}
    {on && ios && !premium && <section className="sect"><div className="sect-b vp-card">
      <div className="vp-hint"><Icon name="info" aria-hidden="true" /><div>
        <b>{isEnglish() ? t('Better voices are free') : t('Better {0} voices are free', lang)}</b>
        <span>{t('Settings > Accessibility > Read & Speak > Voices')}</span>
      </div></div>
      <Button variant="tinted" className="vp-how" onClick={() => useUI.getState().openSheet(close => <StepsSheet close={close} lang={lang} />)}>{t('Show me how')}</Button>
    </div></section>}
    {on && ios && premium && <p className="sect-f vp-note"><Icon name="info" aria-hidden="true" />{t('You already have a Premium voice. Nothing to add.')}</p>}
  </>
  const natural = on && ios && (nat.available || nat.debugModel)
  // With the model installed the Natural voices lead and the Apple voices fold into one row (frame 6); a pick among them keeps them open.
  const folded = natural && isEnglish() && nat.state === 'ready' && !showApple && !(cur && !isNatural(cur)) && voices.length > 0
  const names = voices.slice(0, 3).map(voiceLabel).join(', ')
  const kinds = LADDER.filter(k => k !== 'natural' || natural).concat(voices.some(v => v.online) ? ['online'] : [])
  return <>
    <span id="vp-live" className="vh" role="status" aria-live="polite" />
    {on && <>
      <div className="vp-legend" aria-hidden="true">{kinds.map(k => <span key={k}><TierTile tier={k} size="xs" />{legendName(k)}</span>)}</div>
      <span className="vh">{t('Voice types: {0}', kinds.map(legendName).join(', '))}</span>
    </>}
    <Section footer={voices.length ? null : t('No other voices for this language here. Your device’s settings can add more.')}>
      <Row icon={tile(autoN ? 'natural' : 'plain', '', 'bolt', autoN?.id)} className={rowCls('')} title={t('Automatic')} subtitle={w === 2 && playKey === 'auto' ? t('Loading, please wait…') : autoNote} ariaLabel={t('Automatic') + sel(!cur)} accessory={!cur ? 'check' : 'none'} onClick={() => pick('', autoN?.id || auto?.id || '')} />
    </Section>
    {natural && nat.state === 'ready' && <NaturalGroup nat={nat} cur={cur} pick={pick} tile={tile} rowCls={rowCls} fresh={fresh} wait={id => (w === 2 && playKey === id ? t('Loading, please wait…') : null)} />}
    {folded
      ? <Section title={t('Apple voices')}><Row title={names} ariaLabel={t('Apple voices') + ', ' + names} accessory="chevron" className={fresh ? 'vp-in' : ''} style={fresh ? { '--i': NATURAL_VOICES.length + 3 } : null} onClick={() => setShowApple(true)} /></Section>
      : apple}
    {natural && nat.state !== 'ready' && <NaturalGroup nat={nat} cur={cur} pick={pick} tile={tile} rowCls={rowCls} />}
    {!ios && list !== null && MOBILE && <p className="sect-f vp-note"><Icon name="info" aria-hidden="true" />{t('Natural voice is on iPhone first. Android uses your phone’s voices for now.')}</p>}
  </>
}

/** Natural voice in the picker: the offer, the download, a stop, and the installed voices with Remove. */
function NaturalGroup({ nat, cur, pick, tile, rowCls, fresh, wait }) {
  const [wifi, setWifi] = useState(() => readPrefs().wifiOnly)
  const lastMb = useRef(0) // where a download was when it stopped; the state forgets it
  const total = nat.total > 0 ? mbOf(nat.total) : NATURAL_MB
  const doneMb = Math.round((nat.fraction || 0) * total)
  if (nat.state === 'downloading') lastMb.current = doneMb
  const switchRow = <Row title={t('Wi-Fi only')}><Switch checked={wifi} onChange={v => { writePrefs({ wifiOnly: v }); setWifi(v) }} /></Row>
  if (!isEnglish()) {
    return <Section className="vp-dim" title={t('Natural voice')} footer={t('Natural voice speaks English for now. Other languages keep the Apple voice.')}>
      <Row title={t('Not in {0} yet', langName(speechLang().split('-')[0]))} subtitle={t('Your Apple voice keeps speaking.')} />
    </Section>
  }
  if (nat.state === 'ready') {
    const sel = id => (cur === id ? ', ' + t('selected') : '')
    const mb = mbOf(nat.bytes) || total
    const n = NATURAL_VOICES.length
    return <>
      <Section title={<span className={'vp-head' + (fresh ? ' vp-in' : '')} style={fresh ? { '--i': 0 } : null}>{t('Natural voice · English')}<span className="vp-pill">{t('Installed')}</span></span>}
        footer={<span className={fresh ? 'vp-in' : undefined} style={fresh ? { '--i': n + 1 } : null}>{t('Lines are made during the rest, so you do not hear a delay. Where it has no voice for your language, the Apple voice speaks.')}</span>}>
        {NATURAL_VOICES.map((v, i) => <Row key={v.id} icon={tile('natural', v.id)} title={v.name} value={v.region} subtitle={wait?.(v.id)} className={rowCls(v.id) + (fresh ? ' vp-in' : '')} style={fresh ? { '--i': i + 1 } : null}
          ariaLabel={[v.name, t('Natural voice'), v.region].join(', ') + sel(v.id)} accessory={cur === v.id ? 'check' : 'none'} onClick={() => pick(v.id)} />)}
      </Section>
      {!nat.debugModel && <Section><Row danger className={fresh ? 'vp-in' : ''} style={fresh ? { '--i': n + 2 } : null} title={t('Remove download')} subtitle={t('Frees {0} MB', mb)} onClick={() => confirmSheet({
        title: t('Remove Natural voice?'), message: t('Frees {0} MB. You can download it again.', mb), confirmText: t('Remove'), danger: true, onConfirm: () => removeNatural(),
      })} /></Section>}
    </>
  }
  const downloading = nat.state === 'downloading'
  const failed = !downloading && nat.error && nat.error !== 'cancelled'
  const pct = Math.round((nat.fraction || 0) * 100)
  return <Section title={t('Natural voice')} footer={downloading ? t('You can leave this page. The download keeps going while the app is open.') : t('Made on your phone. Nothing leaves it. It uses a bit more battery than Apple voices.')}>
    {downloading
      ? <div className="lrow">
        <span className="lrow-m">
          <span className="lrow-t">{t('Downloading')}</span>
          <span className="lrow-s">{wifi ? t('{0} of {1} MB · Wi-Fi only', doneMb, total) : t('{0} of {1} MB', doneMb, total)}</span>
          <span className="vp-bar" role="progressbar" aria-label={t('Natural voice download, {0} percent', pct)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ '--p': Math.min(1, nat.fraction || 0) }} /></span>
        </span>
        <Button variant="ghost" className="vp-act" onClick={() => cancelNatural()}>{t('Cancel')}</Button>
      </div>
      : failed
        ? <div className="lrow vp-fade">
          <span className="lrow-m">
            <span className="lrow-t vp-bad">{t('Download stopped. Try again.')}</span>
            {nat.error !== 'needs-wifi' && lastMb.current > 0 && <span className="lrow-s">{t('The connection dropped at {0} MB.', lastMb.current)}</span>}
          </span>
          <Button variant="primary" className="vp-act" onClick={() => downloadNatural({ wifiOnly: wifi })}>{t('Try again')}</Button>
        </div>
        : <div className="lrow">
          <span className="lrow-m">
            <span className="lrow-t">{t('More human, offline')}</span>
            <span className="lrow-s">{t('One download, about {0} MB.', total)}</span>
          </span>
          <Button variant="primary" className="vp-act" onClick={() => downloadNatural({ wifiOnly: wifi })}>{t('Download')}</Button>
        </div>}
    {switchRow}
  </Section>
}

/** A row with a slider under its title: speed or pitch, 0.5× to 2×. */
function SliderRow({ icon, title, value, set, low, high }) {
  const update = useStore(s => s.update)
  return <div className="lrow voice-sld">
    <span className="lrow-i" style={{ '--tint': 'var(--teal)' }}><Icon name={icon} /></span>
    <span className="lrow-m">
      <span className="voice-sld-h"><span className="lrow-t">{title}</span><span className="lrow-v">{fmtX(value)}</span></span>
      <Slider value={value} min={SPEECH_MIN} max={SPEECH_MAX} step={0.05} ariaLabel={title} ariaValueText={fmtX(value)}
        onChange={v => update(s => { set(s, v) })} onEnd={() => sayIt(sampleCue(S_().unit))} />
      <span className="voice-sld-ends" aria-hidden="true"><span>{low}</span><span>{high}</span></span>
    </span>
  </div>
}

/** "Edit these lines": a pack's lines become your own. A second tap confirms when you already wrote some. */
function useEditLines(onStart) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const style = cueStyleOf(S)
  const [replace, setReplace] = useState(false)
  const go = () => {
    if (hasOwnLines(S) && !replace) { setReplace(true); return }
    update(s => { startOwnFrom(s, style) })
    onStart?.(style)
    setReplace(false)
  }
  return [replace, go]
}
const EditLinesRow = ({ replace, go }) => <Row icon="pencil" iconTint="var(--acc)" title={replace ? t('Replace my lines') : t('Edit these lines')} subtitle={t('They become your own lines, for every moment.')} onClick={go} />
const REPLACE_NOTE = () => t('This replaces the lines you wrote before. Tap again to go ahead.')

/** A moment's lines: read and heard in a pack, written and heard when the style is your own. */
function MomentLines({ moment }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const style = cueStyleOf(S)
  const own = style === 'own'
  const [draft, setDraft] = useState(() => (own ? ownLines(S, moment) : []))
  const [replace, makeOwn] = useEditLines(from => setDraft(linesFor({ cueStyle: from }, moment)))
  useEffect(() => { if (own) setDraft(d => (d.length ? d : ownLines(useStore.getState().S, moment))) }, [own, moment])

  if (!own) {
    const lines = linesFor(S, moment)
    return <Section title={t('Lines')} footer={replace ? REPLACE_NOTE() : t('One is picked at random each time.')}>
      {lines.map((l, i) => <Row key={i} icon="play" iconTint="var(--teal)" title={l} onClick={() => sayIt(l)} />)}
      {!lines.length && <Row icon="chat" iconTint="var(--grey)" title={t('Nothing said here in this style.')} />}
      <EditLinesRow replace={replace} go={makeOwn} />
    </Section>
  }

  const commit = next => { setDraft(next); update(s => { setOwnLines(s, moment, next) }) }
  return <Section title={t('Your lines')} footer={t('One is picked at random each time. Up to {0} lines.', LINES_MAX)}>
    {draft.map((l, i) => <div key={i} className="lrow voice-line">
      <TextField value={l} maxLength={LINE_MAX} aria-label={t('Line {0}', i + 1)} placeholder={t('Something your coach would say')}
        onChange={e => commit(draft.map((x, j) => (j === i ? e.target.value : x)))} />
      <Button variant="ghost" size="sm" icon="play" aria-label={t('Hear it')} title={t('Hear it')} disabled={!l.trim()} onClick={() => sayIt(l)} />
      <Button variant="ghost" size="sm" icon="trash" aria-label={t('Remove line {0}', i + 1)} title={t('Remove')} onClick={() => commit(draft.filter((_, j) => j !== i))} />
    </div>)}
    {draft.length < LINES_MAX && <Row icon="plus" iconTint="var(--acc)" title={t('Add a line')} onClick={() => setDraft([...draft, ''])} />}
  </Section>
}

/** A moment's clips of your own: play, remove, record one, or pick a file. */
function MomentClips({ moment }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const clips = voiceClipsOf(S, moment)
  const [busy, setBusy] = useState(false)
  const [rec, setRec] = useState(null)   // { secs } while recording
  const file = useRef(null)
  const recorder = useRef(null)
  useEffect(() => () => { try { recorder.current?.stop() } catch { /* already stopped */ } }, [])

  const keep = async (blob, name) => {
    setBusy(true)
    try {
      const { ingestSoundFile } = await import('../lib/sound-ingest.js')
      const out = await ingestSoundFile(blob, { maxSec: CLIP_SEC })
      await mediaStore.put(out.media.hash, out.blob, { mime: 'audio/wav', pending: true })
      let id = null
      update(s => { id = addVoiceClip(s, moment, { name, m: out.media }) })
      if (id) { unlock(true); chime(true, 'u:' + out.media.hash); toast(t('Clip added. It plays instead of the line.')) }
    } catch (e) {
      toast(soundErrorText(e))
    } finally { setBusy(false) }
  }
  const onFile = ev => {
    const f = ev.target.files && ev.target.files[0]
    ev.target.value = ''
    if (f) keep(f, String(f.name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ') || t('Clip'))
  }
  const startRec = async () => {
    unlock(true)
    hush()
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) { toast(micErrorText(e)); return }
    const type = recordType()
    let mr
    try { mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined) } catch (e) { stream.getTracks().forEach(x => x.stop()); toast(micErrorText(e)); return }
    const parts = []
    const started = Date.now()
    const tick = setInterval(() => {
      const secs = Math.floor((Date.now() - started) / 1000)
      setRec({ secs })
      if (secs >= CLIP_SEC) { try { mr.stop() } catch { /* */ } }
    }, 250)
    mr.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data) }
    mr.onstop = () => {
      clearInterval(tick)
      stream.getTracks().forEach(x => x.stop())
      recorder.current = null
      setRec(null)
      if (parts.length) keep(new Blob(parts, { type: mr.mimeType || type || 'audio/webm' }), t('Recording {0}', clips.length + 1))
    }
    recorder.current = mr
    setRec({ secs: 0 })
    mr.start()
  }
  const stopRec = () => { try { recorder.current?.stop() } catch { /* */ } }

  const full = clips.length >= CLIPS_PER_MOMENT
  return <Section title={t('Your own clips')} footer={t('A clip plays instead of the line. Up to {0} here, {1} seconds each. Your clips stay yours: they sync to your own devices and are never shared.', CLIPS_PER_MOMENT, CLIP_SEC)}>
    {clips.map(c => <div key={c.id} className="lrow own-snd" data-voice-clip={c.id}>
      <button type="button" className="own-snd-pick" onClick={() => { unlock(true); chime(true, 'u:' + c.m.hash) }}>
        <span className="lrow-i" style={{ '--tint': 'var(--pink)' }}><Icon name="play" /></span>
        <span className="lrow-m">
          <span className="lrow-t">{c.name}</span>
          {c.m.dur != null && <span className="lrow-s">{fmtClip(c.m.dur)}</span>}
        </span>
      </button>
      <Button variant="ghost" size="sm" icon="trash" aria-label={t('Remove {0}', c.name)} title={t('Remove')} onClick={() => { update(s => { removeVoiceClip(s, c.id) }); toast(t('Clip removed.')) }} />
    </div>)}
    {!full && canRecord() && (rec
      ? <Row icon="stop" iconTint="var(--red)" title={t('Stop recording')} subtitle={t('{0} of {1} seconds', rec.secs, CLIP_SEC)} className="voice-rec" onClick={stopRec} />
      : <Row icon={busy ? 'hourglass' : 'mic'} iconTint="var(--red)" title={busy ? t('Loading…') : t('Record a clip')} onClick={() => { if (!busy) startRec() }} />)}
    {/* Your own voice from somewhere else, or someone else's (TestFlight 11-08): any audio file this
        device decodes, cut to CLIP_SEC and kept like a recording. openGym ships no voices of its own. */}
    {!full && !rec && <Row icon="folder" iconTint="var(--pink)" title={t('Pick an audio file')} subtitle={t('MP3, M4A, WAV, AAC or OGG. Yours, or a friend’s with their OK.')}
      onClick={() => { if (!busy) file.current?.click() }} />}
    <input ref={file} type="file" accept="audio/*,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus" hidden onChange={onFile} data-voice-clip-input />
  </Section>
}

function MomentSheet({ moment, close }) {
  return <>
    <h3>{t(MOMENT_COPY[moment])}</h3>
    <MomentLines moment={moment} />
    <MomentClips moment={moment} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
const momentSheet = moment => useUI.getState().openSheet(close => <MomentSheet moment={moment} close={close} />)

/** What a moment's row says: that a clip of your own plays, else the first line, else that it is quiet. */
export function momentSummary(S, moment) {
  if (voiceClipsOf(S, moment).length) return t('Your clip')
  return linesFor(S, moment)[0] || t('Quiet')
}

// The waveform is decoration: 28 bars of fixed height and period, moving only while a sample plays. They start from flat and fade out before they stop.
const WAVE = Array.from({ length: 28 }, (_, i) => ({ '--h': (0.35 + 0.6 * Math.abs(Math.sin(i * 1.7))).toFixed(2), '--d': [0.8, 0.9, 1.1, 1.3][i % 4] + 's', '--dl': `${(((i * 0.37) % 1) * 0.4).toFixed(2)}s` }))

/** The voice in use: its tile, its name, Change (opens the picker), a waveform and Try it. */
function VoiceHero({ vs, cur, openList }) {
  const S = useStore(s => s.S)
  const [playing, setPlaying] = useState(false)
  const w = useWait()
  const lit = playing && !w // the look starts with the line, not the tap
  const timer = useRef(0)
  const on = isOn(S, 'voices')
  useEffect(() => {
    endPlaying = () => { clearTimeout(timer.current); setPlaying(false) }
    return () => { endPlaying = null; clearTimeout(timer.current); offLine(); stopWait() }
  }, [])
  const nat = NATURAL_VOICES.find(v => v.id === cur)
  const apple = nat ? null : vs.voices?.find(v => v.id === cur)
  const autoN = on ? autoNat(cur) : undefined
  const used = nat || apple ? null : autoN || vs.auto // what Automatic speaks with
  const accent = nat ? cur : autoN?.id
  const key = !on ? 'plain' : nat || autoN ? 'natural' : apple ? tierKey(apple) : used ? tierKey(used) : 'plain'
  const name = nat ? nat.name : apple ? voiceLabel(apple) : t('Automatic')
  const tier = !on ? null : nat ? `${tierName('natural')} · ${nat.region}` : apple ? tierName(key) : used ? tierName(key) : vs.ios && vs.voices ? t('Standard voice') : null
  const sub = used ? [autoN ? autoN.name : voiceLabel(used), on && tierName(key)].filter(Boolean).join(' · ') : tier
  const tryIt = () => {
    const cue = sampleCue(S.unit), line = sampleLine(S)
    sayIt(cue)
    speak(line, { ...voiceOpts(S), patient: true })
    setPlaying(true)
    endAfter(timer, `${cue}. ${line}`, line, speechRateNum(S), () => setPlaying(false), isNatural(voiceOpts(S).voice))
  }
  const ending = useEnding(lit)
  return <div className={`vhero tier-${key}${accentClass(accent)}${lit ? ' play' : ''}${ending ? ' end' : ''}`}>
    <button type="button" className="vhero-main" aria-label={`${t('Using now')}, ${[name, sub].filter(Boolean).join(', ')}. ${t('Change voice')}`} onClick={openList}>
      <TierTile tier={key} size="xl" accent={accentClass(accent)} playing={lit} />
      <span className="vhero-tx">
        <span className="vhero-k">{t('Using now')}</span>
        <span className="vhero-n">{name}</span>
        {(w === 2 || sub) && <span className="vhero-s">{w === 2 ? t('Loading, please wait…') : sub}</span>}
      </span>
      <span className="vhero-chg">{t('Change')}<Icon name="chevronRight" aria-hidden="true" /></span>
    </button>
    <div className="vhero-wave" aria-hidden="true">{WAVE.map((st, i) => <i key={i} style={st} />)}</div>
    <Button variant="primary" className="vhero-try" icon="play" onClick={tryIt}>{lit ? t('Playing') : t('Try it')}</Button>
  </div>
}

const STYLE_LOOK = { hype: ['bolt', '#f97316'], plain: ['list', '#8e8e93'], calm: ['heart', '#14a3a8'], drill: ['flag', '#e5484d'], deadpan: ['smile', '#7c7cf0'], own: ['pencil', '#8e8e93'] }
// The tiles as drawn (flow-studio): Hype man first. STYLE_IDS keeps its own order.
const TILE_ORDER = ['hype', 'plain', 'calm', 'drill', 'deadpan', 'own']
const BUBBLES = ['restStart', 'restOver']

/** The six styles as tiles, then the picked style's first line for two moments, then "Edit these lines". */
function StyleGrid({ S, style, pickStyle }) {
  const [popped, setPopped] = useState(null) // the tile tapped this visit: only its check pops
  const [replace, makeOwn] = useEditLines()
  const own = style === 'own'
  const [, color] = STYLE_LOOK[style]
  return <section className="sect">
    <h2 className="sect-t" id="vp-style-h">{t('Style')}</h2>
    <div className="vs-grid" role="radiogroup" aria-labelledby="vp-style-h">
      {TILE_ORDER.map((id, i) => {
        const [icon, c] = STYLE_LOOK[id], nm = t(STYLE_COPY[id][0])
        return <button key={id} type="button" role="radio" aria-checked={style === id} aria-label={`${nm}, ${t('{0} of {1}', i + 1, TILE_ORDER.length)}`} data-find={nm}
          className={'vs-tile' + (style === id ? ' sel' : '') + (id === 'own' ? ' own' : '')} style={{ '--c': c }} onClick={() => { setPopped(id); pickStyle(id) }}>
          <span className="vs-ch"><span className="vs-ico"><Icon name={icon} aria-hidden="true" /></span><span className="vs-nn">{nm}</span></span>
          {style === id && <span className={'vs-ok' + (popped === id ? ' pop' : '')}><Icon name="check" aria-hidden="true" /></span>}
          <span className="vs-dd">{t(STYLE_COPY[id][1])}</span>
        </button>
      })}
    </div>
    <div className="vs-smp" style={{ '--c': color }}>
      {BUBBLES.map(m => {
        const line = linesFor(S, m)[0]
        return line ? <button key={m} type="button" className="vs-bub" aria-label={t('Play: {0}, {1}', t(MOMENT_COPY[m]), line)} onClick={() => sayIt(line)}>
          <small><Icon name="play" aria-hidden="true" />{t(MOMENT_COPY[m])}</small>{line}
        </button> : null
      })}
    </div>
    {!own && <div className="sect-b vs-edit"><EditLinesRow replace={replace} go={makeOwn} /></div>}
    <p className="sect-f">{replace ? REPLACE_NOTE() : t('Only the words change. Your own lines live here too.')}</p>
  </section>
}

export default function VoiceSettings({ openList }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const vs = useVoices()
  useNatural() // redraws the hero when the model arrives or goes
  const style = cueStyleOf(S)
  const cur = pickedVoice()
  const off = S.spokenCues !== true
  const pickStyle = id => {
    update(s => { s.cueStyle = id })
    const after = { ...S_(), cueStyle: id }
    sayIt(sampleLine(after))
  }
  // Shown in full even where nothing can speak (this browser): the lines and clips sync to the
  // devices that can, and the footer says why nothing is heard here.
  const footer = !speechSupported() ? t('This browser can’t speak. Try another one.') : null
  return <>
    <span id="vp-live" className="vh" role="status" aria-live="polite" />
    {off && <section className="sect"><div className="sect-b vp-card">
      <div className="vp-off"><span>{t('Spoken cues are off. Switch them on to hear your next set and the countdown.')}</span></div>
      <Button variant="primary" className="vp-how" onClick={() => { update(s => { s.spokenCues = true }); sayIt(sampleCue(S.unit)) }}>{t('Turn on')}</Button>
    </div></section>}
    <div className={off ? 'vp-body vp-off-dim' : 'vp-body'} inert={off}>
      <VoiceHero vs={vs} cur={cur} openList={openList} />
      {footer && <p className="sect-f">{footer}</p>}
      <StyleGrid S={S} style={style} pickStyle={pickStyle} />
      {/* "How much it says" (#1602) goes here, between Style and Moments. */}
      {/* Where your own voice goes in (TestFlight 11-08: "upload my own voice, or a file"): said
          up front, since the clips sit one tap down, in each moment's sheet. */}
      <Section title={t('Moments')} footer={<>{t('Tap a moment to record your own voice for it or pick an audio file, up to {0} seconds.', CLIP_SEC)} {t('Your next set is still said first when a rest starts. The count of a hold stays a count.')}</>}>
        <div className="vm-tl" aria-hidden="true">
          <span className="vm-tl-t">{t('One rest, in order')}</span>
          <div className="vm-trk">
            {[[8, t('Starts')], [60, t('10 s')], [92, t('Over')]].map(([x, l]) => <span key={x}><b style={{ left: x + '%' }} /><u style={{ left: x + '%' }}>{l}</u></span>)}
          </div>
          <div className="vm-tags"><span>{t(MOMENT_COPY.lastSet)}</span><span>{t(MOMENT_COPY.record)}</span></div>
        </div>
        {MOMENTS.map(m => <Row key={m} icon="bell" iconTint="var(--orange)" title={t(MOMENT_COPY[m])} subtitle={momentSummary(S, m)} accessory="chevron" onClick={() => momentSheet(m)} />)}
      </Section>
      <Section title={t('Fine tune')}>
        <SliderRow icon="gauge" title={t('Speed')} value={speechRateNum(S)} set={setSpeechRate} low={t('Slower')} high={t('Faster')} />
        {/* Kokoro has no pitch, and shifting it afterwards spoils the sound (Ruling 2). */}
        {isNatural(cur) || autoNat(cur)
          ? <div className="lrow vp-nopitch" data-find={t('Pitch')}><span className="lrow-i" style={{ '--tint': 'var(--teal)' }}><Icon name="speaker" /></span><span className="lrow-m"><span className="lrow-s">{t('No pitch for Natural voices.')}</span></span></div>
          : <SliderRow icon="speaker" title={t('Pitch')} value={speechPitchNum(S)} set={setSpeechPitch} low={t('Lower')} high={t('Higher')} />}
      </Section>
    </div>
  </>
}
