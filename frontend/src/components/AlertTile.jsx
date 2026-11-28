import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'
import './AlertTile.css'

// One timer alert as a tile (Settings > Timer alerts). The top part is the switch. The strip under
// it shows the current choice: a button when `onStrip` is given (opens that channel's options),
// plain text otherwise. A strip shows only while `value` is given, so the page decides when an
// Off tile has none (Android Flash keeps one).
export default function AlertTile({ tint, icon, name, on, onToggle, label, value, find, stripFind, onStrip, stripLabel, wide }) {
  const strip = value == null ? null : onStrip
    ? <button type="button" className="at-op" aria-label={stripLabel} data-find={stripFind} onClick={onStrip}>
      <span>{value}</span><Icon name="chevronRight" className="chev" />
    </button>
    : <div className="at-op" data-find={stripFind}><span>{value}</span></div>
  return (
    <div className={'at ' + (on ? 'on' : 'off') + (wide ? ' wide' : '')} style={{ '--c': tint }}>
      <button type="button" role="switch" aria-checked={!!on} aria-label={label} className="at-sw" data-find={find} onClick={() => onToggle(!on)}>
        <span className="chip" aria-hidden="true"><Icon name={icon} /></span>
        <span className="st" aria-hidden="true">{on ? t('On') : t('Off')}</span>
        <span className="mini" aria-hidden="true" />
        <span className="nm">{name}</span>
      </button>
      {strip}
    </div>
  )
}
