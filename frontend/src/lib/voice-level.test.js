import { describe, it, expect, beforeEach } from 'vitest'
import { estimateCurve, levelAt, smooth, lineLevels, useVoiceLevel } from './voice-level.js'
import { speakMs, useCaption } from './voice-caption.js'

describe('estimateCurve', () => {
  it('one value per 50 ms, a peak per word, all within 0..1', () => {
    const text = 'one two three'
    const c = estimateCurve(text, 1, () => 1)
    expect(c).toHaveLength(Math.ceil(speakMs(text) / 50))
    expect(c.every(v => v >= 0 && v <= 1)).toBe(true)
    const peaks = c.filter((v, i) => v === 1 && v >= (c[i - 1] ?? 0) && v >= (c[i + 1] ?? 0))
    expect(peaks).toHaveLength(3)
  })
  it('decays by 0.6 each step and overlapping pulses take the max', () => {
    const c = estimateCurve('a b', 1, () => 0)
    const i = c.findIndex(v => v > 0)
    expect(c[i]).toBeCloseTo(0.55)
    expect(c[i + 1]).toBeCloseTo(0.55 * 0.6)
  })
})

describe('levelAt and smooth', () => {
  it('interpolates, and is 0 outside', () => {
    expect(levelAt([0, 1], 25)).toBe(0.5)
    expect(levelAt([0, 1], -5)).toBe(0)
    expect(levelAt([0, 1], 500)).toBe(0)
  })
  it('rises fast and falls slowly', () => {
    expect(smooth(0, 1)).toBe(0.55)
    expect(smooth(1, 0)).toBeCloseTo(0.86)
  })
})

describe('lineLevels', () => {
  it('the middle is now, the sides lag at their bases', () => {
    const [l, m, r] = lineLevels([...Array(10).fill(0), 1])
    expect(m).toBe(1)
    expect(l).toBeCloseTo(0.36)
    expect(r).toBeCloseTo(0.36)
  })
  it('missing history counts as 0', () => {
    expect(lineLevels([])).toEqual([0.36, 0.5, 0.36])
  })
})

describe('useVoiceLevel', () => {
  beforeEach(() => { useCaption.getState().hide(); useVoiceLevel.setState({ text: '', curve: [], real: false }) })
  it('a native line for the current text replaces the estimate', () => {
    useCaption.getState().show('Rest is over')
    expect(useVoiceLevel.getState().real).toBe(false)
    useVoiceLevel.getState().fromNative({ text: 'Rest is over', levels: [0.2, 0.9], ms: 100 })
    expect(useVoiceLevel.getState().real).toBe(true)
    expect(useVoiceLevel.getState().curve).toEqual([0.2, 0.9])
  })
  it('another text, or a malformed event, is ignored', () => {
    useCaption.getState().show('Rest is over')
    const before = useVoiceLevel.getState().curve
    useVoiceLevel.getState().fromNative({ text: 'Old line', levels: [1] })
    useVoiceLevel.getState().fromNative({ text: 'Rest is over', levels: null })
    expect(useVoiceLevel.getState().real).toBe(false)
    expect(useVoiceLevel.getState().curve).toBe(before)
  })
  it('an empty levels list (unreadable WAV) keeps the estimate', () => {
    useCaption.getState().show('Rest is over')
    const before = useVoiceLevel.getState().curve
    useVoiceLevel.getState().fromNative({ text: 'Rest is over', levels: [] })
    expect(useVoiceLevel.getState().real).toBe(false)
    expect(useVoiceLevel.getState().curve).toBe(before)
  })
  it('an empty curve reads as silence', () => {
    useVoiceLevel.setState({ curve: [] })
    expect(useVoiceLevel.getState().now()).toBe(0)
  })
})
