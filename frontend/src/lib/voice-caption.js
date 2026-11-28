import { create } from 'zustand'
import { t, tn } from './i18n.js'

const words = text => text.trim().split(/\s+/).filter(Boolean).length

export const captionKind = text => (words(text) <= 12 ? 'pill' : 'card')

export function holdMs (text, { silent } = {}) {
  if (captionKind(text) === 'card') return Infinity
  return silent ? Math.min(12000, Math.max(3000, 350 * words(text))) : 1200
}

export function ageText (sec) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60)
    return tn('Not spoken, {0} minute ago', 'Not spoken, {0} minutes ago', m)
  }
  return t('Not spoken, {0} seconds ago', Math.max(10, Math.floor(sec / 10) * 10))
}

// shortcut: estimate, the phones send no end event; add a native end event if the pill hides early or late on device
export const speakMs = (text, speed = 1) => Math.round(words(text) * 400 / speed) + 300

let timer = null
let expired = false // the hold ran out while the pill was open
const clear = () => { clearTimeout(timer); timer = null }

export const useCaption = create((set, get) => ({
  text: '', kind: null, source: null, silent: false, muted: false,
  speaking: false, expanded: false, shownAt: 0, last: '',

  show (text, { source = null, silent = false, muted = false, speed = 1 } = {}) {
    clear()
    expired = false
    const kind = captionKind(text)
    const speaking = !silent && !muted
    set({ text, kind, source, silent, muted, speaking, shownAt: Date.now(), last: text })
    if (muted || kind === 'card') {
      if (speaking) timer = setTimeout(() => set({ speaking: false }), speakMs(text, speed))
      return
    }
    const hold = () => { timer = setTimeout(get().hide, holdMs(text, { silent })) }
    if (speaking) {
      timer = setTimeout(() => { set({ speaking: false }); hold() }, speakMs(text, speed))
    } else hold()
  },

  hide () {
    if (get().expanded) { expired = true; return }
    clear()
    set({ text: '', kind: null, source: null, silent: false, muted: false, speaking: false })
  },

  open () { set({ expanded: true }) },

  close () {
    set({ expanded: false })
    if (expired) get().hide()
  },

  replay () {
    const { last, source } = get()
    if (last) get().show(last, { source })
  },
}))

export const caption = { show: (...a) => useCaption.getState().show(...a), hide: () => useCaption.getState().hide() }
