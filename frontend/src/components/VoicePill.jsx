import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { useCaption, caption, ageText } from '../lib/voice-caption.js'
import { cues } from '../lib/spoken-cues.js'
import { hush } from '../lib/speech.js'
import { nav } from '../lib/nav.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import './VoicePill.css'

const FADE_OUT_MS = 140

const Wave = () => <span className="vcap-wave" aria-hidden="true"><b /><b /><b /><b /></span>

// The caption for every spoken cue line (lib/voice-caption.js). Shown only while a workout runs.
export default function VoicePill() {
  const running = useStore(s => !!s.S.active)
  return running ? <Pill /> : null
}

function Pill() {
  const c = useCaption()
  const rest = useUI(s => !!(s.timer || s.work || s.countIn))
  // Which bar it is: the element changes between a rest, a hold and a count-in, and gains a row for auto holds.
  const barKey = useUI(s => [!!s.countIn, !!s.work, !!s.timer, s.timer?.ready, s.timer?.kind].join())
  const [acts, setActs] = useState(false) // the actions are open (the store's `expanded` also holds the pill while focused)
  const [, tick] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const root = useRef(null)
  const shut = () => { setActs(false); useCaption.getState().close() }
  const lastShown = useRef(c)
  if (c.text) lastShown.current = c

  // Fade out for 140 ms after the line is gone.
  useEffect(() => {
    if (c.text) { setLeaving(false); return undefined }
    if (!lastShown.current.text) return undefined
    setLeaving(true)
    const id = setTimeout(() => { setLeaving(false); lastShown.current = c }, FADE_OUT_MS)
    return () => clearTimeout(id)
  }, [c.text])

  // A silent line's age is re-read every 10 s.
  useEffect(() => {
    if (!c.silent || !c.text) return undefined
    const id = setInterval(() => tick(n => n + 1), 10000)
    return () => clearInterval(id)
  }, [c.silent, c.text])

  // A card does not outlive the rest it was said in.
  const wasRest = useRef(rest)
  useEffect(() => {
    if (wasRest.current && !rest && c.kind === 'card') { shut(); caption.hide() }
    wasRest.current = rest
  }, [rest])

  // Gone with the workout: a muted line or a card must not show in the next one.
  useEffect(() => () => { useCaption.getState().close(); caption.hide() }, [])

  // The rest bar's height, so the pill sits 12 px above it whatever rows it has (index.css --vp-b).
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

  const v = c.text ? c : leaving ? lastShown.current : null

  // The page keeps room for the pill, the way it does for the rest bar (index.css body.vpill).
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return undefined
    const b = document.body
    const size = () => b.style.setProperty('--vp-h', el.offsetHeight + 'px')
    size()
    b.classList.add('vpill')
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); b.classList.remove('vpill'); b.style.removeProperty('--vp-h') }
  }, [!!v])

  if (!v) return null

  const settings = () => { shut(); nav('/settings/voice') }
  const stop = () => { hush(); useCaption.setState({ speaking: false }) }
  const mute = () => { shut(); cues.mute(true); caption.show(v.text, { muted: true }) }
  const unmute = () => { shut(); cues.mute(false); caption.hide() }
  const dismiss = () => { shut(); caption.hide() }
  const age = ageText(Math.floor((Date.now() - v.shownAt) / 1000))

  const gear = <Icon name="gear" />
  const stopIcon = <Icon name="stop" />
  const muteIcon = <Icon name="speakerSlash" />
  const roundBtn = (label, icon, onClick) => <button type="button" className="vcap-round" aria-label={label} onClick={onClick}>{icon}</button>

  let body
  if (v.muted) {
    body = <>
      <div className="vcap-top" style={{ paddingBottom: 4 }}>
        <span className="vcap-ic" aria-hidden="true">{muteIcon}</span>
        <span className="vcap-tx"><span className="vcap-line full">{v.text}</span><span className="vcap-meta">{t('Voice is muted for this workout')}</span></span>
      </div>
      <div className="vcap-acts two">
        <button type="button" aria-label={t('Unmute spoken cues')} onClick={unmute}><i><Icon name="speaker" /></i>{t('Unmute')}</button>
        <button type="button" aria-label={t('Open voice settings')} onClick={settings}><i>{gear}</i>{t('Settings')}</button>
      </div>
    </>
  } else if (v.kind === 'card') {
    body = <div className="vcap-card" role={v.source ? 'group' : undefined} aria-label={v.source || undefined}>
      {(v.speaking || v.source || v.silent) && <div className="vcap-hdr">
        {v.speaking && <Wave />}
        <div className="vcap-src">{v.source}{v.silent && <span>{v.source ? ' · ' : ''}{age}</span>}</div>
        {v.speaking && roundBtn(t('Stop speaking'), stopIcon, stop)}
      </div>}
      <div className="vcap-line full" aria-hidden={v.speaking || undefined} key={v.text}>{v.text}</div>
      <div className="vcap-row">
        <button type="button" className="vcap-dis" onClick={dismiss}>{t('Dismiss')}</button>
        {!v.silent && roundBtn(t('Mute spoken cues'), muteIcon, mute)}
        {roundBtn(t('Open voice settings'), gear, settings)}
      </div>
    </div>
  } else if (v.silent) {
    body = <div className="vcap-top" role="group" aria-label={age}>
      <span className="vcap-ic" aria-hidden="true">{muteIcon}</span>
      <span className="vcap-tx"><span className="vcap-line" key={v.text}>{v.text}</span><span className="vcap-meta" aria-hidden="true">{age}</span></span>
      {roundBtn(t('Open voice settings'), gear, settings)}
    </div>
  } else {
    body = <>
      <button type="button" className="vcap-top" aria-expanded={acts}
        aria-label={acts ? t('Voice actions') : v.speaking ? t('Voice, speaking. Open voice actions.') : undefined}
        onClick={() => { if (acts) shut(); else { setActs(true); useCaption.getState().open() } }}>
        {v.speaking && <Wave />}
        <span className="vcap-tx"><span className={'vcap-line' + (acts ? ' full' : '')} aria-hidden={(v.speaking && !acts) || undefined} key={v.text}>{v.text}</span></span>
        {acts && <span className="vcap-chev" aria-hidden="true"><Icon name="chevronDown" /></span>}
      </button>
      {acts && <div className="vcap-acts hair">
        <button type="button" aria-label={v.speaking ? t('Stop speaking') : t('Replay the last line')} onClick={v.speaking ? stop : () => cues.replay()}>
          <i><Icon name={v.speaking ? 'stop' : 'reset'} /></i>{v.speaking ? t('Stop') : t('Replay')}
        </button>
        <button type="button" aria-label={t('Mute spoken cues')} onClick={mute}><i>{muteIcon}</i>{t('Mute')}</button>
        <button type="button" aria-label={t('Open voice settings')} onClick={settings}><i>{gear}</i>{t('Settings')}</button>
      </div>}
    </>
  }

  // Focus inside holds the pill (the store defers hide while `expanded`), so it never goes from under a finger or a screen reader.
  return (
    <div ref={root} className={'vcap' + (v.speaking ? ' sp' : '') + (c.text ? '' : ' out')}
      onFocus={() => useCaption.getState().open()}
      onBlur={e => { if (!acts && !e.currentTarget.contains(e.relatedTarget)) useCaption.getState().close() }}>
      {body}
    </div>
  )
}
