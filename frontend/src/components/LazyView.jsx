import { Suspense, lazy, useState } from 'react'

/** A screen fetched on demand. `views` collects each fetch, for the idle prefetch (App.jsx). */
export function lazyView(load, views = []) {
  let View = null
  const fetchIt = () => load().then(m => { View = m.default; return m })
  const Lazy = lazy(fetchIt)
  views.push(fetchIt)
  return function LazyView(props) {
    // Chosen once per mount: switching to View when the fetch lands would remount the screen on the next render and drop its state.
    const [Loaded] = useState(() => View)
    return Loaded ? <Loaded {...props} /> : <Suspense fallback={null}><Lazy {...props} /></Suspense>
  }
}
