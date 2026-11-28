// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import TierTile, { TIER_KEYS, tierKey, tierName, accentClass } from './VoiceTier.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const show = el => {
  const host = document.createElement('div')
  act(() => createRoot(host).render(el))
  return host
}

describe('tierKey', () => {
  it('orders natural, online, premium, enhanced, standard', () => {
    expect(tierKey('natural:af_heart')).toBe('natural')
    expect(tierKey({ id: 'natural:bf_emma' })).toBe('natural')
    expect(tierKey({ quality: 'premium' })).toBe('premium')
    expect(tierKey({ quality: 'enhanced', online: true })).toBe('online')
    expect(tierKey({ quality: 'enhanced' })).toBe('enhanced')
    expect(tierKey({ quality: 'default' })).toBe('standard')
    expect(tierKey(undefined)).toBe('standard')
  })
  it('names every tier', () => {
    expect(tierName('online')).toBe('Needs internet')
    for (const k of TIER_KEYS) expect(tierName(k)).toBeTruthy()
  })
})

describe('TierTile', () => {
  it('is hidden from readers and carries its tier class and glyph', () => {
    const el = show(<TierTile tier="premium" size="xl" />).firstChild
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.classList.contains('tier-premium')).toBe(true)
    expect(el.querySelector('svg')).toBeTruthy()
    expect(el.querySelector('.tier-bars')).toBeNull()
  })
  it('an unknown tier is plain', () => {
    expect(show(<TierTile tier="" />).firstChild.classList.contains('tier-plain')).toBe(true)
  })
  it('playing adds the bars and the ring', () => {
    const el = show(<TierTile tier="natural" playing />).firstChild
    expect(el.querySelectorAll('.tier-bars i').length).toBe(4)
    expect(el.querySelector('.tier-ring')).toBeTruthy()
  })
})

describe('TierTile ending', () => {
  it('stopping keeps the bars a moment while they fade, then they go', () => {
    vi.useFakeTimers()
    try {
      const host = document.createElement('div')
      const root = createRoot(host)
      act(() => root.render(<TierTile tier="natural" playing />))
      act(() => root.render(<TierTile tier="natural" playing={false} />))
      expect(host.querySelector('.tier-play.end')).not.toBeNull()
      expect(host.querySelector('.playing')).toBeNull()
      act(() => { vi.advanceTimersByTime(120) })
      expect(host.querySelector('.tier-play')).toBeNull()
    } finally { vi.useRealTimers() }
  })
})

describe('styles', () => {
  it('has a reduced-motion block and the ease-out token', () => {
    expect(readFileSync('src/components/VoiceTier.css', 'utf8')).toMatch(/prefers-reduced-motion/)
    expect(readFileSync('src/components/VoiceTier.css', 'utf8')).toMatch(/\.tier-play, \.tier-tile \.tier-glyph \{ transition: opacity 120ms linear !important \}/)
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/)
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/--ease-in-out:\s*cubic-bezier\(0\.77, 0, 0\.175, 1\)/)
  })
})

describe('each Natural voice has its own shade', () => {
  const css = readFileSync('src/components/VoiceTier.css', 'utf8')
  const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  const onWhite = hex => 1.05 / (lum(hex) + 0.05)
  const stops = sel => css.match(new RegExp(sel.replace(/[.[\]"]/g, '\\$&') + ' \\{ ([^}]*)\\}'))[1]
  it('names the class from the voice id, only for a Natural voice', () => {
    expect(['natural:af_heart', 'natural:am_michael', 'natural:bf_emma', 'ava', ''].map(accentClass)).toEqual([' nv-heart', ' nv-michael', ' nv-emma', '', ''])
    expect(show(<TierTile tier="natural" accent=" nv-emma" />).firstChild.className).toContain('nv-emma')
    expect(show(<TierTile tier="premium" accent=" nv-emma" />).firstChild.className).not.toContain('nv-emma')
  })
  it('Heart, Michael and Emma differ, and white keeps 3:1 on every stop, dark and light', () => {
    const seen = new Set(['#0d9488|#8b5cf6'])
    for (const v of ['michael', 'emma']) {
      const base = stops(`.tier-natural.nv-${v}`), light = stops(`:root[data-theme="light"] .tier-natural.nv-${v}`)
      const [a, b] = [/--tier-a:(#\w+)/.exec(base)[1], /--tier-b:(#\w+)/.exec(base)[1]]
      const lb = /--tier-b:(#\w+)/.exec(light)[1]
      expect(seen.has(a + '|' + b)).toBe(false)
      seen.add(a + '|' + b)
      for (const c of [a, b, lb]) expect(onWhite(c)).toBeGreaterThanOrEqual(3)
    }
    for (const c of ['#0d9488', '#8b5cf6', '#7c3aed']) expect(onWhite(c)).toBeGreaterThanOrEqual(3)
  })

  // `.vp-legend span` also matched the tile (a span), turning its grid into inline-flex and pinning the glyph to the left.
  it('the legend styles its own entries only, never the tile inside', () => {
    const css = readFileSync('src/components/VoiceSettings.css', 'utf8')
    expect(css).toMatch(/\.vp-legend > span \{/)
    expect(css).not.toMatch(/\.vp-legend span/)
  })
})
