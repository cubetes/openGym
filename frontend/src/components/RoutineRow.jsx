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
 *  `swipe` is the props of the SwipeRow around it (Settings → Swipe actions), or falsy.
 *  `edit` ({ checked, onToggle, handle, style, grip }) is Plan's Edit: a check circle and a grip in place
 *  of the swipe and the "…"; a tap on the row selects it. */
export default function RoutineRow({ r, sub, body, onOpen, onMenu, swipe, edit }) {
  const row = <div className={'item plan-routine' + (edit?.checked ? ' is-selected' : '')} {...tappable(edit ? edit.onToggle : onOpen)}
    {...(edit ? { 'data-reorder-row': '', style: edit.style } : {})}>
    {edit && <button type="button" role="checkbox" aria-checked={!!edit.checked} className="plan-check" aria-label={t('Select {0}', said(r.name))}
      onClick={e => { e.stopPropagation(); edit.onToggle() }}><span><Icon name="check" /></span></button>}
    <RoutineTile r={r} />
    <div className="grow"><div className="tt">{isFavRoutine(r) && <Icon name="starFill" className="fav-star" />}{r.name}</div><div className="ss">{sub}</div></div>
    <MiniBodyMap routines={[r]} tint={colorOf(r)} body={body} />
    {edit
      ? edit.grip && <button type="button" className="plan-grip" aria-label={t('Move {0}', said(r.name))} title={t('Drag to reorder')} {...edit.handle}><Icon name="grip" /></button>
      : <MoreButton name={r.name} onClick={onMenu} />}
  </div>
  return swipe && !edit ? <SwipeRow className="swrow-item" {...swipe}>{row}</SwipeRow> : row
}
