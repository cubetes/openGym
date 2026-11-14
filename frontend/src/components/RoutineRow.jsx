import Icon from './Icon.jsx'
import RoutineTile from './RoutineTile.jsx'
import MiniBodyMap from './MiniBodyMap.jsx'
import SwipeRow from './SwipeRow.jsx'
import { t } from '../lib/i18n.js'
import { said } from '../lib/a11y-name.js'
import { colorOf } from '../lib/routine-colors.js'
import { isFavRoutine } from '../lib/routine-favs.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

/** The "…" on a routine row, a folder row and the current plan block: it opens that one's menu. */
export function MoreButton({ name, onClick }) {
  return <button type="button" className="plan-more" aria-label={t('More for {0}', said(name))}
    onClick={e => { e.stopPropagation(); onClick() }}><Icon name="more" /></button>
}

/** One routine on Plan: colour tile, name (a gold star when starred), `sub`, muscle maps, "…".
 *  `swipe` is the props of the SwipeRow around it (Settings → Swipe actions), or falsy. */
export default function RoutineRow({ r, sub, body, onOpen, onMenu, swipe }) {
  const row = <div className="item plan-routine" {...tappable(onOpen)}>
    <RoutineTile r={r} />
    <div className="grow"><div className="tt">{isFavRoutine(r) && <Icon name="starFill" className="fav-star" />}{r.name}</div><div className="ss">{sub}</div></div>
    <MiniBodyMap routines={[r]} tint={colorOf(r)} body={body} />
    <MoreButton name={r.name} onClick={onMenu} />
  </div>
  return swipe ? <SwipeRow className="swrow-item" {...swipe}>{row}</SwipeRow> : row
}
