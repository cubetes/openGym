// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import TierTile, { TIER_KEYS, tierKey, tierName } from './VoiceTier.jsx'

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

describe('styles', () => {
  it('has a reduced-motion block and the ease-out token', () => {
    expect(readFileSync('src/components/VoiceTier.css', 'utf8')).toMatch(/prefers-reduced-motion/)
    expect(readFileSync('src/index.css', 'utf8')).toMatch(/--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/)
  })
})
