// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlertTile from './AlertTile.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove() })
const show = props => act(() => root.render(<AlertTile tint="var(--pink)" icon="speaker" name="Sound" label="Sound, Chime" onToggle={() => {}} {...props} />))

describe('AlertTile', () => {
  it('the top is a switch named by the label; a tap asks for the opposite', () => {
    const onToggle = vi.fn()
    show({ on: true, onToggle })
    const sw = host.querySelector('[role="switch"]')
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(sw.getAttribute('aria-label')).toBe('Sound, Chime')
    expect(host.querySelector('.st').textContent).toBe('On')
    act(() => sw.click())
    expect(onToggle).toHaveBeenCalledWith(false)
    show({ on: false, onToggle })
    expect(host.querySelector('.st').textContent).toBe('Off')
    act(() => host.querySelector('[role="switch"]').click())
    expect(onToggle).toHaveBeenLastCalledWith(true)
  })

  it('an Off tile with no value has no strip', () => {
    show({ on: false })
    expect(host.querySelector('.at-op')).toBeNull()
  })

  it('a strip with onStrip is a labelled button; without it, plain text that cannot be focused', () => {
    const onStrip = vi.fn()
    show({ on: true, value: 'Chime', onStrip, stripLabel: 'Sound options', stripFind: 'Sound' })
    const b = host.querySelector('button.at-op')
    expect(b.getAttribute('aria-label')).toBe('Sound options')
    expect(b.dataset.find).toBe('Sound')
    act(() => b.click())
    expect(onStrip).toHaveBeenCalled()
    show({ on: true, value: 'Screen blinks' })
    expect(host.querySelector('button.at-op')).toBeNull()
    expect(host.querySelector('.at-op').textContent).toBe('Screen blinks')
  })

  it('turning a tile off folds its strip: inert, plain text, out of search', () => {
    show({ on: true, value: 'Chime', onStrip: () => {}, stripFind: 'Sound' })
    show({ on: false })
    const fold = host.querySelector('.at-fold')
    expect(fold.classList.contains('open')).toBe(false)
    expect(fold.hasAttribute('inert')).toBe(true)
    expect(host.querySelector('button.at-op')).toBeNull()
    expect(host.querySelector('[data-find="Sound"]')).toBeNull()
    expect(host.querySelector('.at-op').textContent).toBe('Chime')
  })

  it('wide spans the row', () => {
    show({ on: true, wide: true })
    expect(host.querySelector('.at').classList.contains('wide')).toBe(true)
  })

  it('right-to-left: the knob and the word sit at the inline end and the knob slides the other way', () => {
    const css = readFileSync('src/components/AlertTile.css', 'utf8')
    expect(css).not.toMatch(/\bright:|\bleft:/)
    expect(css).toMatch(/\.at \.mini\s*\{[^}]*inset-inline-end:\s*12px/)
    expect(css).toMatch(/\.at \.st\s*\{[^}]*inset-inline-end:\s*58px/)
    expect(css).toMatch(/\.at \.mini::after\s*\{[^}]*inset-inline-start:\s*2px/)
    expect(css).toMatch(/\[dir="rtl"\] \.at\.on \.mini::after\s*\{\s*transform:\s*translateX\(-14px\)/)
  })

  it('has a reduced-motion block, one column at large text and 44 pt strips', () => {
    const css = readFileSync('src/components/AlertTile.css', 'utf8')
    expect(css).toMatch(/prefers-reduced-motion/)
    expect(css).toMatch(/\.at-sw:active \{ opacity: \.6 \}/)
    expect(css).toMatch(/\.at:has\(\.at-sw:active\)\s*\{\s*transform:\s*scale\(var\(--press-scale\)\)/)
    expect(css).toMatch(/\.at\s*\{[^}]*transition:\s*background var\(--med\) var\(--ease\)/)
    expect(css).toMatch(/\.text-big \.alert-grid\s*\{\s*grid-template-columns:\s*1fr\s*\}/)
    expect(css).toMatch(/\.at-op\s*\{[^}]*min-height:\s*44px/)
  })

  // The global .chip (index.css) pads 6px 13px: left on, the 22 px glyph overflowed a 10 px box and sat 6 px right of centre.
  it('has no padding on the glyph chip, so the glyph centres in its square', () => {
    expect(readFileSync('src/components/AlertTile.css', 'utf8')).toMatch(/\.at \.chip\s*\{[^}]*padding:\s*0;/)
  })
})
