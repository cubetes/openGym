import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useCaption, caption, ageText, agoText } from '../lib/voice-caption.js'
import { cues } from '../lib/spoken-cues.js'
import { hush, onVoices, pickedVoice, voiceLabel, voiceState } from '../lib/speech.js'
import { NATURAL_VOICES } from '../lib/natural-voice.js'
import { tickNative } from '../lib/rest-alert.js'
import { isOn } from '../lib/modules.js'
import { nav } from '../lib/nav.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { tierKey, tierName } from './VoiceTier.jsx'
import './VoiceOrb.css'

const HOLD_MS = 500
const HINT_DELAY = 600
const HINT_MS = 4000
const EASE = 'cubic-bezier(.32,.72,0,1)'
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The voice in use: its tier (the orb colour) and its name. Automatic reads as what it speaks with.
function useVoiceInfo(on) {
  const [, bump] = useState(0)
  useEffect(() => onVoices(() => bump(n => n + 1)), [])
  const { voices, auto } = voiceState()
  const id = pickedVoice()
  const nat = NATURAL_VOICES.find(v => v.id === id)
  const v = nat ? null : voices?.find(x => x.id === id) || auto
  const key = !on ? 'plain' : nat ? 'natural' : v ? tierKey(v) : 'plain'
  const name = nat ? nat.name : v ? voiceLabel(v) : t('Automatic')
  return { key, name, tier: key === 'plain' ? '' : tierName(key) }
}

// A line that changes: the old one fades up and out, the new one in, by CSS transitions (no keyframe restart on a countdown).
function Line({ text, className }) {
  const [st, setSt] = useState({ cur: text, old: '' })
  if (st.cur !== text) setSt({ cur: text, old: st.cur })
  useEffect(() => {
    if (!st.old) return undefined
    const id = setTimeout(() => setSt(s => ({ ...s, old: '' })), 160)
    return () => clearTimeout(id)
  }, [st.old])
  return <span className="vo-ln">
    {[st.old && <span key={st.old} className={className + ' out'}>{st.old}</span>, <span key={st.cur} className={className}>{st.cur}</span>]}
  </span>
}

// The orb is always there while a workout runs; tap opens the words, a 500 ms hold mutes (components/VoiceOrb.css).
export default function VoiceOrb() {
  const running = useStore(s => !!s.S.active)
  return running ? <Orb /> : null
}

function Orb() {
  const c = useCaption()
  const rest = useUI(s => !!(s.timer || s.work || s.countIn))
  // Which bar it is: the element changes between a rest, a hold and a count-in, and gains a row for auto holds.
  const barKey = useUI(s => [!!s.countIn, !!s.work, !!s.timer, s.timer?.ready, s.timer?.kind].join())
  const update = useStore(s => s.update)
  const muted = useStore(s => s.S.active?.voiceMuted === true)
  const bar = useStore(s => s.S.voiceBar === true)
  const on = useStore(s => isOn(s.S, 'voices'))
  const seen = useStore(s => s.S.voiceHintSeen === true)
  const voice = useVoiceInfo(on)
  const [acts, setActs] = useState(false) // the panel above the bar is open (the store's `expanded` also holds the line while focused)
  const [held, setHeld] = useState(false)
  const [hint, setHint] = useState(false)
  const [wash, setWash] = useState(0)
  const [ack, setAck] = useState(0) // the line the bar has shown, so its dot can go
  const [, tick] = useState(0)
  const root = useRef(null)
  const fx = useRef(null)
  const panel = useRef(null)
  const press = useRef({ timer: 0, long: false })
  const hintTimers = useRef([])

  const card = c.kind === 'card' && !!c.text
  const silent = c.silent && !!c.text && !muted
  const speaking = c.speaking && !!c.text && !muted && !silent
  const dot = (card || silent) && !muted && !bar && c.shownAt !== ack
  const shut = () => { setActs(false); useCaption.getState().close() }

  const setBar = v => update(S => { S.voiceBar = v })
  const toggleBar = () => { setBar(!bar); if (bar) shut() }

  // Mute or unmute for the workout. Muting stops the voice at once; unmuting clears the muted line.
  const toggleMute = () => {
    tickNative()
    setWash(n => n + 1)
    cues.mute(!muted)
    if (muted) caption.hide(); else useCaption.setState({ speaking: false })
  }

  const release = () => { clearTimeout(press.current.timer); setHeld(false) }
  const down = e => {
    if (e.button > 0) return
    // Touch captures the pointer to the orb: let go, so sliding a finger off it cancels the hold.
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no capture */ }
    press.current.long = false
    setHeld(true)
    setHint(false)
    clearTimeout(press.current.timer)
    press.current.timer = setTimeout(() => { press.current.long = true; setHeld(false); toggleMute() }, HOLD_MS)
  }
  // The click after a long press is the same finger lifting: it must not also toggle the bar.
  const click = () => { if (press.current.long) { press.current.long = false; return } toggleBar() }
  useEffect(() => () => clearTimeout(press.current.timer), [])

  // The line the bar has shown loses its dot; a card opens with the bar.
  useEffect(() => {
    if (bar && (card || silent)) setAck(c.shownAt)
    setActs(bar && card)
  }, [bar, card, card ? c.shownAt : 0])

  // "Hold to mute": once ever, the first time the orb shows live, 600 ms in, for 4 s.
  const live = useRef(true)
  live.current = !muted && !silent && !bar
  useEffect(() => {
    if (seen) return undefined
    const id = setTimeout(() => {
      if (!live.current) return
      setHint(true)
      update(S => { S.voiceHintSeen = true })
      hintTimers.current.push(setTimeout(() => setHint(false), HINT_MS))
    }, HINT_DELAY)
    hintTimers.current.push(id)
    return () => hintTimers.current.forEach(clearTimeout)
  }, [])
  useEffect(() => { if (bar) setHint(false) }, [bar])

  // A silent line's age (and the idle "seconds ago") is re-read every 10 s while the bar shows it.
  useEffect(() => {
    if (!bar || muted) return undefined
    const id = setInterval(() => tick(n => n + 1), 10000)
    return () => clearInterval(id)
  }, [bar, muted])

  // A card does not outlive the rest it was said in.
  const wasRest = useRef(rest)
  useEffect(() => {
    if (wasRest.current && !rest && c.kind === 'card') { shut(); caption.hide() }
    wasRest.current = rest
  }, [rest])

  // Gone with the workout: a line or a card must not show in the next one, and "Voice on" is true again.
  useEffect(() => () => { useCaption.getState().close(); caption.hide(); useCaption.setState({ last: '', lastAt: 0 }) }, [])

  // The rest bar's height, so the orb sits 12 px above it whatever rows it has (index.css --vp-b).
  useEffect(() => {
    const el = rest && document.getElementById('timer')
    if (!el) return undefined
    const b = document.body
    const size = () => b.style.setProperty('--vp-rb', el.offsetHeight + 'px')
    size()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); b.style.removeProperty('--vp-rb') }
  }, [rest, barKey])

  // The page keeps room for the orb, or the bar and its open panel, the way it does for the rest bar (index.css body.vpill).
  const panelOpen = bar && acts
  useLayoutEffect(() => {
    const b = document.body
    const size = () => b.style.setProperty('--vp-h', (56 + (panelOpen ? 8 + (panel.current?.offsetHeight || 0) : 0)) + 'px')
    size()
    b.classList.add('vpill')
    const ro = panelOpen && typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null
    if (panel.current) ro?.observe(panel.current)
    return () => { ro?.disconnect(); b.classList.remove('vpill'); b.style.removeProperty('--vp-h') }
  }, [panelOpen])

  // When the rest bar comes or goes the orb's place changes: slide it from the old place (FLIP), never animate `bottom`.
  useEffect(() => {
    let last = root.current.offsetTop
    const sync = () => { last = root.current.offsetTop }
    const move = () => {
      const now = root.current.offsetTop, d = last - now
      last = now
      if (!d || reduced()) return
      for (const el of [root.current, fx.current]) el.animate?.([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 300, easing: EASE })
    }
    const mo = new MutationObserver(move)
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] })
    window.addEventListener('resize', sync)
    return () => { mo.disconnect(); window.removeEventListener('resize', sync) }
  }, [])

  const settings = () => { shut(); nav('/settings/voice') }
  const stop = () => { hush(); useCaption.setState({ speaking: false }) }
  const dismiss = () => { shut(); caption.hide() }
  const unmute = () => { cues.mute(false); caption.hide() }
  const age = silent ? ageText(Math.floor((Date.now() - c.shownAt) / 1000)) : ''

  const row = [voice.name, voice.tier].filter(Boolean).join(' · ')
  // What the bar says, and what a screen reader reads for it.
  let words, spoken
  if (muted) {
    words = <span className="vo-ln"><span className="vo-c2">{t('Voice is muted for this workout')}</span></span>
    spoken = t('Voice is muted for this workout')
  } else if (card) {
    words = <span className="vo-tx"><span className="vo-c1">{c.source || row}</span>{c.source && <span className="vo-meta">{row}</span>}</span>
    spoken = [c.source, row].filter(Boolean).join(', ')
  } else if (silent) {
    words = <span className="vo-tx"><Line text={c.text} className="vo-c1" /><span className="vo-meta" aria-hidden="true">{age}</span></span>
    spoken = c.text + ' ' + age
  } else if (c.text) {
    words = <Line text={c.text} className="vo-c2" />
    spoken = c.text
  } else if (c.last) {
    const ago = agoText(Math.floor((Date.now() - c.lastAt) / 1000))
    words = <span className="vo-tx"><span className="vo-c1 vo-dim">{c.last}</span><span className="vo-meta">{ago}</span></span>
    spoken = c.last + ' ' + ago
  } else {
    words = <span className="vo-ln"><span className="vo-dim">{t('Voice on')}</span></span>
    spoken = t('Voice on')
  }

  const round = (label, icon, onClick) => <button type="button" className="vo-round" aria-label={label} onClick={onClick}><Icon name={icon} /></button>
  const stopOrReplay = speaking
    ? { label: t('Stop speaking'), icon: 'stop', on: stop, word: t('Stop') }
    : { label: t('Replay the last line'), icon: 'reset', on: () => cues.replay(), word: t('Replay') }
  let body
  if (muted) {
    body = <div className="vo-row">
      <button type="button" className="vo-btn" aria-label={t('Unmute spoken cues')} onClick={unmute}><Icon name="speaker" />{t('Unmute')}</button>
      <button type="button" className="vo-btn" aria-label={t('Open voice settings')} onClick={settings}><Icon name="gear" />{t('Settings')}</button>
    </div>
  } else if (card) {
    body = <>
      <p className="vo-card" aria-hidden={speaking || undefined}>{c.text}</p>
      <div className="vo-row">
        <button type="button" className="vo-btn vo-dis" onClick={dismiss}>{t('Dismiss')}</button>
        {round(stopOrReplay.label, stopOrReplay.icon, stopOrReplay.on)}
        {round(t('Mute spoken cues'), 'speakerSlash', () => cues.mute(true))}
        {round(t('Open voice settings'), 'gear', settings)}
      </div>
    </>
  } else if (silent) {
    body = <div className="vo-row"><button type="button" className="vo-btn" aria-label={t('Open voice settings')} onClick={settings}><Icon name="gear" />{t('Settings')}</button></div>
  } else {
    body = <div className="vo-acts">
      <button type="button" aria-label={stopOrReplay.label} onClick={stopOrReplay.on}><i><Icon name={stopOrReplay.icon} /></i>{stopOrReplay.word}</button>
      <button type="button" aria-label={t('Mute spoken cues')} onClick={() => cues.mute(true)}><i><Icon name="speakerSlash" /></i>{t('Mute')}</button>
      <button type="button" aria-label={t('Open voice settings')} onClick={settings}><i><Icon name="gear" /></i>{t('Settings')}</button>
    </div>
  }

  const who = voice.tier || voice.name // with Better voices off there is no tier: the voice's name stands in
  const label = muted ? (bar ? t('Voice is muted. Hide the words.') : t('Voice is muted. Show the words.'))
    : silent ? (bar ? t('Voice, not spoken. Hide the words.') : t('Voice, not spoken. Show the words.'))
      : dot && card ? t('Voice, new Coach line. Show the words.')
        : speaking ? (bar ? t('Voice, speaking, {0}. Hide the words.', who) : t('Voice, speaking, {0}. Show the words.', who))
          : (bar ? t('Voice, {0}. Hide the words.', who) : t('Voice, {0}. Show the words.', who))

  const cls = ['vo-orb', muted && 'muted', silent && 'sil', speaking && 'sp', held && 'held', dot && 'dot'].filter(Boolean).join(' ')
  // Focus inside the bar holds the line (the store defers hide while `expanded`), so it never goes from under a finger or a screen reader.
  return <>
    <div ref={fx} className={'vo-fx tier-' + voice.key + (muted || silent ? ' off' : '')} aria-hidden="true">
      <i className="vo-halo" />
    </div>
    <div ref={root} className={'vo tier-' + voice.key}>
      <div className="vo-stack"
        onFocus={() => useCaption.getState().open()}
        onBlur={e => { if (!acts && !e.currentTarget.contains(e.relatedTarget)) useCaption.getState().close() }}>
        <div className={'vo-bar' + (bar ? ' on' : '')} inert={!bar}>
          <button type="button" className="vo-cap" aria-expanded={acts}
            aria-label={speaking ? t('Voice actions') : spoken + '. ' + t('Voice actions')}
            onClick={() => { if (acts) shut(); else { setActs(true); useCaption.getState().open() } }}>
            <span className="vo-words" aria-hidden={speaking || undefined}>{words}</span>
          </button>
        </div>
        <div ref={panel} className={'vo-panel' + (panelOpen ? ' on' : '')} inert={!panelOpen}>{body}</div>
      </div>
      <button type="button" className={cls} aria-expanded={bar} aria-label={label}
        onPointerDown={down} onPointerUp={release} onPointerLeave={release} onPointerCancel={release}
        onContextMenu={e => e.preventDefault()} onClick={click}>
        <span className="vo-body"><i className="vo-b1" /><i className="vo-b2" /><i className="vo-core" /><i className={'vo-wash' + (wash ? ' go' : '')} key={wash} /></span>
        <span className="vo-lines" aria-hidden="true"><b /><b /><b /></span>
        <span className="vo-dot" aria-hidden="true" />
      </button>
      {/* VoiceOver cannot reach a custom action on a web element: this hidden button does what the hold does. */}
      <button type="button" className="vh" onClick={toggleMute}>{muted ? t('Unmute') : t('Mute')}</button>
      <div className={'vo-hint' + (hint ? ' on' : '')} aria-hidden="true">{t('Hold to mute')}</div>
    </div>
  </>
}
