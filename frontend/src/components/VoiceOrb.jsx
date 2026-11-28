import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useCaption, caption, ageText, agoText, speakMs } from '../lib/voice-caption.js'
import { useVoiceLevel, smooth, lineLevels, curveMs } from '../lib/voice-level.js'
import { cues } from '../lib/spoken-cues.js'
import { hush, onVoices, pickedVoice, speechSupported, voiceLabel, voiceState } from '../lib/speech.js'
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
const SETTLE_MS = 100 // the muted look waits for the grey wash to peak (96 ms)
const RIPPLE_EASE = 'cubic-bezier(.23,1,.32,1)'
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

// The orb is there while a workout runs with Spoken cues on and a voice to speak with; tap opens the words, a 500 ms hold mutes (components/VoiceOrb.css).
export default function VoiceOrb() {
  const running = useStore(s => !!s.S.active && s.S.spokenCues === true)
  return running && speechSupported() ? <Orb /> : null
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
  const orbBody = useRef(null)
  const halo = useRef(null)
  const core = useRef(null)
  const lines = useRef(null)
  const loop = useRef({ raf: 0, s: 0, hist: [], ripple: -1e3 })
  const hold = useRef(false)
  const panel = useRef(null)
  const barEl = useRef(null)
  const press = useRef({ timer: 0, long: false })
  const hintTimers = useRef([])

  const card = c.kind === 'card' && !!c.text
  const silent = c.silent && !!c.text && !muted
  const speaking = c.speaking && !!c.text && !muted && !silent
  const dot = (card || silent) && !muted && !bar && c.shownAt !== ack
  const shut = () => { setActs(false); useCaption.getState().close() }

  // The muted look (grey orb, flat lines) comes after the wash, not with it; unmuting is at once.
  const [settled, setSettled] = useState(muted)
  useEffect(() => {
    if (!muted) { setSettled(false); return undefined }
    if (!hold.current) { setSettled(true); return undefined }
    hold.current = false
    const id = setTimeout(() => { setSettled(true); setHeld(false) }, SETTLE_MS) // held and muted swap in one render: .92 straight to .86
    return () => clearTimeout(id)
  }, [muted])

  // The one animation loop: runs while the voice speaks (or a real curve is still playing) and ends when the level is back to nothing.
  const gate = useRef({})
  gate.current = { ok: !muted && !silent, speaking, bar }
  const endLoop = () => {
    const l = loop.current
    cancelAnimationFrame(l.raf)
    l.raf = 0; l.s = 0; l.hist = []
    for (const el of [orbBody.current, halo.current, core.current, ...(lines.current?.children || [])]) if (el) { el.style.transform = ''; el.style.opacity = '' }
  }
  const frame = at => {
    const l = loop.current, st = gate.current, v = useVoiceLevel.getState()
    const live = st.ok && (st.speaking || (v.real && globalThis.performance.now() - v.start < curveMs(v.curve)))
    const was = l.s
    const s = l.s = smooth(was, live ? v.now() : 0)
    if (!live && s < 0.01) { endLoop(); return }
    const calm = l.calm
    if (!calm && !st.bar && was < 0.7 && s >= 0.7 && at - l.ripple > 300) { l.ripple = at; ripple() }
    l.hist.push(s)
    if (l.hist.length > 6) l.hist.shift()
    const light = l.light
    const set = (el, tf, op) => { if (!el) return; if (tf) el.style.transform = tf; el.style.opacity = op }
    if (!calm) orbBody.current.style.transform = `scale(${1 + 0.13 * s})`
    set(halo.current, calm ? null : `scale(${0.62 + 0.42 * s})`, calm ? 0.2 + 0.4 * s : 0.14 + (light ? 0.41 : 0.86) * s)
    set(core.current, null, 0.12 + 0.38 * s)
    const hs = lineLevels(l.hist)
    l.bars.forEach((b, i) => {
      b.style.transform = `scaleY(${calm ? 0.6 : hs[i]})`
      b.style.opacity = calm ? 0.55 + 0.45 * s : ''
    })
    l.raf = requestAnimationFrame(frame)
  }
  // One ring leaves the orb on a word peak, behind the page controls.
  const ripple = () => {
    const el = document.createElement('i')
    el.className = 'vo-rp'
    if (!el.animate) return
    fx.current.append(el)
    el.animate([{ transform: 'scale(1)', opacity: 0.5 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 650, easing: RIPPLE_EASE }).onfinish = () => el.remove()
  }
  useEffect(() => {
    if (!speaking || loop.current.raf) return
    // Read once per line, not per frame: the motion setting, the theme and the three lines.
    Object.assign(loop.current, { calm: reduced(), light: document.documentElement.dataset.theme === 'light', bars: [...lines.current.children] })
    loop.current.raf = requestAnimationFrame(frame)
  }, [speaking])
  useEffect(() => { if (settled || silent) endLoop() }, [settled, silent])
  useEffect(() => () => { cancelAnimationFrame(loop.current.raf); fx.current?.querySelectorAll('.vo-rp').forEach(r => r.remove()) }, [])

  const setBar = v => update(S => { S.voiceBar = v })
  const toggleBar = () => { setBar(!bar); if (bar) shut() }

  // Mute or unmute for the workout. Muting stops the voice at once; unmuting clears the muted line.
  const toggleMute = () => {
    tickNative()
    setWash(n => n + 1)
    if (!muted) hold.current = true
    cues.mute(!muted)
    if (muted) caption.hide(); else useCaption.setState({ speaking: false })
  }

  // After a long press the settle clears `held`, so the orb goes .92 to .86 with no bounce back toward 1.
  const release = () => { clearTimeout(press.current.timer); if (!press.current.long) setHeld(false) }
  const down = e => {
    if (e.button > 0) return
    // Touch captures the pointer to the orb: let go, so sliding a finger off it cancels the hold.
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no capture */ }
    press.current.long = false
    setHeld(true)
    setHint(false)
    clearTimeout(press.current.timer)
    press.current.timer = setTimeout(() => { press.current.long = true; if (muted) setHeld(false); toggleMute() }, HOLD_MS)
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

  // The page keeps room for the orb, or the bar (up to 4 lines at large text) and its open panel, the way it does for the rest bar (index.css body.vpill).
  const panelOpen = bar && acts
  useLayoutEffect(() => {
    const b = document.body
    const size = () => {
      const w = barEl.current?.offsetWidth
      if (w) barEl.current.style.setProperty('--vo-x', (56 / w).toFixed(4)) // closed, the bar is exactly the orb's 56 px
      const bh = bar ? Math.max(56, barEl.current?.offsetHeight || 0) : 56
      b.style.setProperty('--vp-h', (bh + (panelOpen ? 8 + (panel.current?.offsetHeight || 0) : 0)) + 'px')
    }
    size()
    b.classList.add('vpill')
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null
    if (barEl.current) ro?.observe(barEl.current)
    if (panelOpen && panel.current) ro?.observe(panel.current)
    return () => { ro?.disconnect(); b.classList.remove('vpill'); b.style.removeProperty('--vp-h') }
  }, [bar, panelOpen])

  // When the rest bar comes or goes the orb's place changes: slide it from the old place (FLIP), never animate `bottom`.
  useEffect(() => {
    const b = document.body
    // What --vp-b depends on (index.css): only a change here can move the orb, so only then read layout.
    const where = () => [b.classList.contains('resting'), b.classList.contains('no-tabbar'), b.style.getPropertyValue('--vp-rb')].join()
    let slide = [] // the running FLIP animations; a second move starts from where the orb is drawn
    let last = root.current.offsetTop, key = where()
    const sync = () => { last = root.current.offsetTop }
    const move = () => {
      const k = where()
      if (k === key) return
      key = k
      const before = root.current.getBoundingClientRect().top // drawn, with the running slide's transform
      slide.forEach(a => a.cancel?.())
      slide = []
      const now = root.current.offsetTop
      const d = last - now + (before - root.current.getBoundingClientRect().top) // plus what the running slide still added
      last = now
      if (!d || reduced()) return
      for (const el of [root.current, fx.current]) { const a = el.animate?.([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 300, easing: EASE }); if (a) slide.push(a) }
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

  const cls = ['vo-orb', settled && 'muted', silent && 'sil', speaking && 'sp', held && 'held', dot && 'dot'].filter(Boolean).join(' ')
  // Focus inside the bar holds the line (the store defers hide while `expanded`), so it never goes from under a finger or a screen reader.
  return <>
    <div ref={fx} className={'vo-fx tier-' + voice.key + (muted || silent || bar ? ' off' : '')} aria-hidden="true">
      <i ref={halo} className="vo-halo" />
    </div>
    {/* In bar mode the halo gives way to the light along the screen's bottom edge (one glow at a time). It stays mounted, so closing the bar fades it out. */}
    <div className={'vo-glow tier-' + voice.key + (!bar ? '' : speaking ? ' on sp' : muted ? ' on mut' : '') + (rest ? ' rest' : '')} aria-hidden="true"><i />
      {/* The bright patch crosses once over the estimated length of the line (not for 1 or 2 words); it pauses when the voice stops, so it fades with the glow. The hairline is the light-mode edge. */}
      {!muted && !silent && c.text && c.text.trim().split(/\s+/).length > 2 && <b key={c.shownAt} className="vo-gh" style={{ animationDuration: speakMs(c.text) + 'ms' }} />}
      <b className="vo-ge" />
    </div>
    <div ref={root} className={'vo tier-' + voice.key}>
      <div className="vo-stack"
        onFocus={() => useCaption.getState().open()}
        onBlur={e => { if (!acts && !e.currentTarget.contains(e.relatedTarget)) useCaption.getState().close() }}>
        <div ref={barEl} className={'vo-bar' + (bar ? ' on' : '')} inert={!bar}>
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
        <span ref={orbBody} className="vo-body"><i className="vo-b1" /><i className="vo-b2" /><i ref={core} className="vo-core" /><i className={'vo-wash' + (wash ? ' go' : '')} key={wash} /></span>
        <span ref={lines} className="vo-lines" aria-hidden="true"><b /><b /><b /></span>
        <span className="vo-dot" aria-hidden="true" />
      </button>
      {/* VoiceOver cannot reach a custom action on a web element: this hidden button does what the hold does. */}
      <button type="button" className="vh" onClick={toggleMute}>{muted ? t('Unmute') : t('Mute')}</button>
      <div className={'vo-hint' + (hint ? ' on' : '')} aria-hidden="true">{t('Hold to mute')}</div>
    </div>
  </>
}
