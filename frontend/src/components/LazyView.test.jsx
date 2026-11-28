// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'
import { lazyView } from './LazyView.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('lazyView', () => {
  it('keeps the screen mounted when the fetch lands, so its state survives the next render', async () => {
    const log = []
    const Screen = () => { useEffect(() => { log.push('mount'); return () => log.push('unmount') }, []); return <p>screen</p> }
    const Lazy = lazyView(() => Promise.resolve({ default: Screen }))
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<Lazy n={1} />) })
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    await act(async () => { root.render(<Lazy n={2} />) })
    expect(host.textContent).toBe('screen')
    expect(log).toEqual(['mount'])
    await act(async () => { root.render(<Lazy n={3} />) })
    expect(log).toEqual(['mount'])
    await act(async () => { root.unmount() })
  })
})
