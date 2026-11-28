import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { isNatural } from '../lib/natural-voice.js'
import { t } from '../lib/i18n.js'
import './VoiceTier.css'

export const TIER_KEYS = ['natural', 'premium', 'enhanced', 'standard', 'online']

// `voice` is a speech.js voice object or a Natural id string. `ios` is accepted for the callers
// that pass it; the order below does not depend on it yet.
export function tierKey(voice) {
  if (isNatural(typeof voice === 'string' ? voice : voice?.id)) return 'natural'
  if (voice?.online) return 'online'
  if (voice?.quality === 'premium') return 'premium'
  if (voice?.quality === 'enhanced') return 'enhanced'
  return 'standard'
}

export function tierName(key) {
  return {
    natural: t('Natural voice'), premium: t('Premium'), enhanced: t('Enhanced'),
    standard: t('Standard'), online: t('Needs internet'),
  }[key]
}

const GLYPH = { natural: 'sparkles', premium: 'crown', enhanced: 'starFill', standard: 'speaker', online: 'cloud' }
const SIZE = { xs: 'xs', md: 'md', xl: 'xl' }

/** True for `ms` after `on` turns false, so a playing look can fade out before it goes. */
export function useEnding(on, ms = 120) {
  const [prev, setPrev] = useState(on)
  const [ending, setEnding] = useState(false)
  if (prev !== on) { setPrev(on); setEnding(!on) }
  useEffect(() => {
    if (!ending) return undefined
    const id = setTimeout(() => setEnding(false), ms)
    return () => clearTimeout(id)
  }, [ending, ms])
  return ending
}

// One tile per tier. `tier` is a TIER_KEYS value, or anything else (plain) for Automatic; `glyph` swaps the icon (Automatic wears bolt).
export default function TierTile({ tier, size = 'md', playing = false, glyph }) {
  const key = GLYPH[tier] ? tier : 'plain'
  const ending = useEnding(playing)
  return (
    <span className={`tier-tile tier-${key} tier-${SIZE[size] || 'md'}${playing ? ' playing' : ''}`} aria-hidden="true">
      <Icon name={glyph || GLYPH[key] || 'speaker'} className="tier-glyph" />
      {(playing || ending) && <span className={'tier-play' + (ending ? ' end' : '')}><span className="tier-bars"><i /><i /><i /><i /></span><span className="tier-ring" /></span>}
    </span>
  )
}
