import { create } from 'zustand'
import { speakMs, useCaption } from './voice-caption.js'

const STEP = 50
const clamp = v => Math.min(1, Math.max(0, v))
const now = () => globalThis.performance.now()

// A made-up loudness for a line the phone cannot measure: one pulse per word, fast attack, slow decay.
export function estimateCurve (text, speed = 1, rand = Math.random) {
  const n = Math.ceil(speakMs(text, speed) / STEP)
  const curve = new Array(n).fill(0)
  const words = text.trim().split(/\s+/).filter(Boolean).length
  for (let w = 0; w < words; w++) {
    const at = Math.floor((w + 0.5) * n / words)
    const peak = clamp(0.55 + 0.45 * rand())
    for (let i = at, v = peak; i < n; i++, v *= 0.6) curve[i] = Math.max(curve[i], v)
  }
  return curve
}

// How long a curve plays, in ms.
export const curveMs = curve => curve.length * STEP

export function levelAt (curve, ms) {
  const x = ms / STEP
  if (x < 0 || x > curve.length - 1) return 0
  const i = Math.floor(x)
  const a = curve[i]
  const b = curve[i + 1] ?? a
  return a + (b - a) * (x - i)
}

export const smooth = (s, L) => s + (L - s) * (L > s ? 0.55 : 0.14)

// The three bars of the line: [left, mid, right] heights from the smoothed level history (newest last).
export function lineLevels (history) {
  const ago = n => history[history.length - 1 - n] ?? 0
  const h = (base, level) => base + (1 - base) * level
  return [h(0.36, ago(3) * 0.85), h(0.5, ago(0)), h(0.36, ago(5) * 0.7)]
}

export const useVoiceLevel = create((set, get) => ({
  text: '', curve: [], start: 0, real: false,

  startLine (text, speed = 1) {
    set({ text, curve: estimateCurve(text, speed), start: now(), real: false })
  },

  // A line that is no longer the one on screen is ignored, so the orb never follows the wrong curve.
  fromNative ({ text, levels } = {}) {
    if (!text || text !== useCaption.getState().text || !Array.isArray(levels) || !levels.length) return
    set({ text, curve: levels.map(clamp), start: now(), real: true })
  },

  now () {
    const { curve, start } = get()
    return levelAt(curve, now() - start)
  },
}))
