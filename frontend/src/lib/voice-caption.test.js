import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { captionKind, holdMs, ageText, agoText, speakMs, useCaption } from './voice-caption.js'

const w = n => Array.from({ length: n }, () => 'word').join(' ')
const s = () => useCaption.getState()

describe('rules', () => {
  it('12 words is a pill, 13 a card', () => {
    expect(captionKind(w(12))).toBe('pill')
    expect(captionKind(w(13))).toBe('card')
  })
  it('hold times', () => {
    expect(holdMs('Rest is over', { silent: false })).toBe(1200)
    expect(holdMs('Rest is over', { silent: true })).toBe(3000)
    expect(holdMs(w(12), { silent: true })).toBe(4200)
    expect(holdMs(w(40), { silent: true })).toBe(Infinity)
    expect(holdMs(w(13), { silent: false })).toBe(Infinity)
  })
  it('a 40-word silent line would hold 12000 if it were a pill', () => {
    expect(Math.min(12000, Math.max(3000, 350 * 40))).toBe(12000)
  })
  it('ageText steps', () => {
    expect(ageText(4)).toBe('Not spoken, 10 seconds ago')
    expect(ageText(20)).toBe('Not spoken, 20 seconds ago')
    expect(ageText(39)).toBe('Not spoken, 30 seconds ago')
    expect(ageText(65)).toBe('Not spoken, 1 minute ago')
    expect(ageText(190)).toBe('Not spoken, 3 minutes ago')
  })
  it('speakMs estimates from words and speed', () => {
    expect(speakMs('Rest is over')).toBe(1500)
    expect(speakMs('Rest is over', 2)).toBe(900)
  })
})

describe('store', () => {
  beforeEach(() => { vi.useFakeTimers(); useCaption.getState().hide() })
  afterEach(() => vi.useRealTimers())

  it('a heard pill speaks, then holds 1200 ms, then hides', () => {
    s().show('Rest is over')
    expect(s().speaking).toBe(true)
    vi.advanceTimersByTime(1500)
    expect(s().speaking).toBe(false)
    expect(s().text).toBe('Rest is over')
    vi.advanceTimersByTime(1200)
    expect(s().text).toBe('')
  })
  it('a silent pill holds its silent time', () => {
    s().show('Rest is over', { silent: true })
    expect(s().speaking).toBe(false)
    vi.advanceTimersByTime(2999)
    expect(s().text).toBe('Rest is over')
    vi.advanceTimersByTime(1)
    expect(s().text).toBe('')
  })
  it('a muted line does not time out', () => {
    s().show('Rest is over', { muted: true })
    vi.advanceTimersByTime(60000)
    expect(s().text).toBe('Rest is over')
  })
  it('a card never times out, and a new line replaces it', () => {
    s().show(w(20), { source: 'Coach' })
    vi.advanceTimersByTime(60000)
    expect(s().kind).toBe('card')
    s().show('Rest is over')
    expect(s().kind).toBe('pill')
    expect(s().source).toBe(null)
  })
  it('hide() is ignored while open, and the caption hides after close', () => {
    s().show('Rest is over', { silent: true })
    s().open()
    vi.advanceTimersByTime(5000)
    s().hide()
    expect(s().text).toBe('Rest is over')
    s().close()
    expect(s().text).toBe('')
  })
  it('replay shows the last line again', () => {
    s().show('Rest is over')
    vi.advanceTimersByTime(5000)
    expect(s().text).toBe('')
    s().replay()
    expect(s().text).toBe('Rest is over')
    expect(s().speaking).toBe(true)
  })
  it('heard moves the speaking end to the real length', () => {
    s().show('Rest is over')
    vi.advanceTimersByTime(1000)
    s().heard('Rest is over', 3000)
    vi.advanceTimersByTime(1000)
    expect(s().speaking).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(s().speaking).toBe(false)
    vi.advanceTimersByTime(1200)
    expect(s().text).toBe('')
  })
  it('heard is ignored for another line, or while muted', () => {
    s().show('Rest is over')
    vi.advanceTimersByTime(1600)
    s().heard('Something else', 3000)
    expect(s().speaking).toBe(false)
    s().show('Rest is over', { muted: true })
    s().hide()
    s().show('Rest is over', { muted: true })
    vi.advanceTimersByTime(1000)
    s().heard('Rest is over', 3000)
    vi.advanceTimersByTime(1000)
    expect(s().speaking).toBe(false)
  })
  it('lastAt is set with last', () => {
    s().show('Rest is over', { silent: true })
    expect(s().lastAt).toBeGreaterThan(0)
  })
})

describe('agoText', () => {
  it('steps', () => {
    expect(agoText(25)).toBe('20 seconds ago')
    expect(agoText(4)).toBe('10 seconds ago')
    expect(agoText(65)).toBe('1 minute ago')
    expect(agoText(130)).toBe('2 minutes ago')
  })
})
