// The Natural voice on this iPhone: the state of the downloaded model and the bridge to the
// native NaturalVoice plugin (ios/App/App/NaturalVoice/NaturalVoicePlugin.swift). Same shape as
// anim-packs.js: one lazy plugin, module state with subscribe, prefs in localStorage.
//
//   available()  → { available, debugModel }     iOS 26+ with the downloader, or a DEBUG model folder
//   status()     → { state: 'ready'|'none'|'downloading', bytes? }
//   info()       → { downloadSize? }             Apple's figure
//   download({ wifiOnly }) → resolves once copied; 'progress' events { fraction };
//                  rejects with a code: 'needs-wifi', 'unavailable', 'cancelled', 'failed'
//   cancel(), remove()
//
// Web and Android have no plugin: available is false and nothing throws.
import { MOBILE } from './mobile.js'

export const PREFS_KEY = 'gym_natural_v1'
export const NATURAL_MB = 330 // shown until Apple's own figure (info) is in
export const NATURAL_VOICES = [
  { id: 'natural:af_heart', name: 'Heart', region: 'US' },
  { id: 'natural:am_michael', name: 'Michael', region: 'US' },
  { id: 'natural:bf_emma', name: 'Emma', region: 'UK' },
]

export const isNatural = id => typeof id === 'string' && id.startsWith('natural:')
/** A natural pick only speaks in English with the model on the phone; otherwise Automatic does. */
export const naturalUsable = (id, lang, s = state) => isNatural(id) && /^en/i.test(lang || '') && s.state === 'ready'

/* ---------------------------------------------------------------- the choice, per device */
export function readPrefs(storage = globalThis.localStorage) {
  let v = null
  try { v = JSON.parse(storage?.getItem(PREFS_KEY) || 'null') } catch { /* unreadable: the defaults */ }
  return { wifiOnly: v?.wifiOnly !== false }
}
export function writePrefs(patch, storage = globalThis.localStorage) {
  const next = { ...readPrefs(storage), ...patch }
  next.wifiOnly = next.wifiOnly !== false
  try { storage?.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* private mode: for this run only */ }
  prefs = next
  return next
}
let prefs = readPrefs()

/* ---------------------------------------------------------------- state */
const idle = { available: false, debugModel: false, state: 'none', fraction: null, bytes: 0, total: null, error: null }
let state = idle
const listeners = new Set()
const emit = () => { for (const fn of listeners) fn() }
const set = patch => { state = { ...state, ...patch }; emit() }
export const naturalState = () => state
export const onNatural = fn => { listeners.add(fn); return () => listeners.delete(fn) }

/* ---------------------------------------------------------------- the native side */
// Registered once and handed out inside an object: a Capacitor plugin proxy answers `then` with
// a native call that never settles, so a promise resolved with the bare proxy hangs (#42).
let pluginP = null
const plugin = () => pluginP || (pluginP = (async () => {
  if (!MOBILE) return null
  const { registerPlugin, Capacitor } = await import('@capacitor/core')
  return Capacitor.getPlatform() === 'ios' ? { Voice: registerPlugin('NaturalVoice') } : null
})().catch(() => null))

let progressHooked = false
let running = null

/** Asks the native side what it has. At start, and after every download or removal. */
export async function refreshNatural() {
  const p = await plugin()
  if (!p) { state = idle; emit(); return state }
  let available = false, debugModel = false
  try {
    const r = await p.Voice.available()
    available = !!r?.available; debugModel = !!r?.debugModel
  } catch { /* no native side: not available */ }
  if (!available && !debugModel) { state = idle; emit(); return state }
  let st = { state: 'none' }
  try { st = await p.Voice.status() } catch { /* read as none */ }
  const live = st?.state === 'downloading' || running
  set({
    available, debugModel, error: null,
    state: st?.state === 'ready' ? 'ready' : live ? 'downloading' : 'none',
    bytes: st?.state === 'ready' ? Number(st.bytes) || 0 : 0,
    fraction: st?.state === 'ready' || !live ? null : state.fraction ?? 0,
  })
  try {
    const n = Number((await p.Voice.info())?.downloadSize)
    if (n > 0) set({ total: n })
  } catch { /* the page shows NATURAL_MB */ }
  return state
}

/** Downloads the model; resolves to 'ready' or the code it stopped with. One at a time. */
export function downloadNatural({ wifiOnly = prefs.wifiOnly } = {}) {
  if (running) return running
  running = (async () => {
    const p = await plugin()
    if (!p || !state.available) return 'unavailable'
    if (!progressHooked) {
      progressHooked = true
      // Wrapped: addListener rejects when the plugin is not behind the bridge.
      Promise.resolve(p.Voice.addListener('progress', e => {
        if (state.state === 'downloading') set({ fraction: Math.max(0, Math.min(1, Number(e?.fraction) || 0)) })
      })).catch(() => {})
    }
    set({ state: 'downloading', fraction: 0, error: null })
    try {
      await p.Voice.download({ wifiOnly })
      await refreshNatural()
      return state.state === 'ready' ? 'ready' : 'failed'
    } catch (e) {
      const code = ['needs-wifi', 'unavailable', 'cancelled'].includes(e?.code) ? e.code : 'failed'
      set({ state: 'none', fraction: null, error: code === 'cancelled' ? null : code })
      return code
    }
  })().finally(() => { running = null })
  return running
}

export async function cancelNatural() {
  const p = await plugin()
  try { await p?.Voice.cancel() } catch { /* the download's own reject says how it ended */ }
}

export async function removeNatural() {
  const p = await plugin()
  if (!p) return false
  try { await p.Voice.remove() } catch { /* read back below either way */ }
  await refreshNatural()
  return state.state !== 'ready'
}

export function _resetNatural() {
  pluginP = null; progressHooked = false; running = null; state = idle; prefs = readPrefs()
}
