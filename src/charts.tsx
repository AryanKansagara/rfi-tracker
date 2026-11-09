import { useMemo } from 'react'
import { itemStates, type BurnDown, type ItemState } from './engine/analyze.ts'
import { ROLES, type Config, type Dataset, type Day, type Role } from './engine/types.ts'
import { fmtShort } from './ui.tsx'

/** Phones get a narrower drawing so lane labels stay legible. */
export const narrow = () => typeof innerWidth !== 'undefined' && innerWidth < 720

export const ROLE_VAR: Record<Role, string> = { Architect: 'var(--p-architect)', Engineer: 'var(--p-engineer)', Owner: 'var(--p-owner)', Subcontractor: 'var(--p-sub)', GC: 'var(--p-gc)' }
const ROLE_LABEL: Record<Role, string> = { Architect: 'Architect', Engineer: 'Engineers', Owner: 'Owner', Subcontractor: 'Subs', GC: 'GC' }

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296 }

/**
 * Parties as lanes, items as lines that hop between lanes at each hand-off. Time runs left to right up to `asOf`.
 * Late stretches (past the contractual due date) are drawn hot; overdue items pulse where they sit now.
 */
export function Swimlane({ ds, cfg, asOf, weeks = 10, focus, height = 300, width = 1000, states: given, onPick, label = true }: {
  ds: Dataset; cfg: Config; asOf: Day; weeks?: number; focus?: string; height?: number; width?: number; states?: ItemState[]; onPick?(key: string): void; label?: boolean
}) {
  const states = useMemo(() => given ?? itemStates(ds, { ...cfg, asOf }), [given, ds, cfg, asOf])
  const W = width, padL = label ? 104 : 8, padR = 34, laneH = height / ROLES.length
  const start = asOf - weeks * 7
  const x = (d: Day) => padL + ((Math.max(start, Math.min(asOf, d)) - start) / (asOf - start)) * (W - padL - padR)
  const laneY = (r: Role) => ROLES.indexOf(r) * laneH
  const yOf = (s: ItemState, r: Role) => laneY(r) + laneH * (0.18 + 0.64 * hash(s.item.key))
  const visible = states.filter(s => s.segs.length && (s.item.open || (s.item.closed ?? 0) >= start))
  const holding = (r: Role) => visible.filter(s => s.holder?.role === r).length
  const late = (r: Role) => visible.filter(s => s.holder?.role === r && s.overdue).length
  const ticks: Day[] = []
  for (let d = asOf; d >= start; d -= 14) ticks.push(d)

  return (
    <svg className="swim" viewBox={`0 0 ${W} ${height + 22}`} role="img" aria-label={`Ball in court by party over ${weeks} weeks to ${fmtShort(asOf)}. ${ROLES.map(r => `${ROLE_LABEL[r]} holding ${holding(r)}, ${late(r)} overdue`).join('; ')}.`}>
      {ROLES.map((r, i) => (
        <g key={r}>
          <rect x={0} y={laneY(r)} width={W} height={laneH} className={i % 2 ? 'lane alt' : 'lane'} />
          {label && <>
            <rect x={0} y={laneY(r) + laneH / 2 - 11} width={4} height={22} fill={ROLE_VAR[r]} />
            <text x={12} y={laneY(r) + laneH / 2 - 2} className="lane-name">{ROLE_LABEL[r]}</text>
            <text x={12} y={laneY(r) + laneH / 2 + 13} className="lane-count">{holding(r)} holding{late(r) ? ` · ${late(r)} late` : ''}</text>
          </>}
        </g>
      ))}
      {ticks.map(t => <g key={t}><line x1={x(t)} x2={x(t)} y1={0} y2={height} className="tick" /><text x={x(t)} y={height + 15} className="tick-label" textAnchor="middle">{fmtShort(t)}</text></g>)}
      {visible.map(s => {
        const segs = s.segs.filter(g => g.to >= start)
        const hot = s.item.key === focus
        const dim = !!focus && !hot
        return (
          <g key={s.item.key} className={`flow${s.item.open ? ' open' : ''}${hot ? ' focus' : ''}${dim ? ' dim' : ''}`} onClick={onPick ? () => onPick(s.item.key) : undefined}>
            <title>{`${s.item.kind === 'rfi' ? 'RFI' : 'Submittal'} ${s.item.number}: ${s.item.title}${s.holder ? ` · with ${s.holder.firm} ${s.inCourt} workdays${s.overdue ? `, ${s.daysLate} late` : ''}` : ' · closed'}`}</title>
            {segs.map((g, i) => {
              const y = yOf(s, g.role)
              const x0 = x(g.from), x1 = x(g.to)
              const prev = segs[i - 1]
              return (
                <g key={i}>
                  {prev && <path d={`M${x(prev.to)} ${yOf(s, prev.role)} C${x0 + 5} ${yOf(s, prev.role)} ${x0 - 5} ${y} ${x0} ${y}`} className="hop" />}
                  <line x1={x0} x2={Math.max(x0 + 1.5, x1)} y1={y} y2={y} stroke={ROLE_VAR[g.role]} className="seg" />
                  {g.late > 0 && g.dueAt < g.to && <line x1={x(g.dueAt)} x2={x1} y1={y} y2={y} className="seg-late" />}
                </g>
              )
            })}
            {s.holder && (() => {
              const y = yOf(s, s.holder.role)
              return <>
                {s.overdue && <circle cx={x(asOf)} cy={y} r={4} className="pulse" />}
                <circle cx={x(asOf)} cy={y} r={hot ? 5 : 3.2} className={s.overdue ? 'dot late' : 'dot'} fill={s.overdue ? undefined : ROLE_VAR[s.holder.role]} />
              </>
            })()}
          </g>
        )
      })}
      <line x1={x(asOf)} x2={x(asOf)} y1={0} y2={height} className="now" />
    </svg>
  )
}

/** Semicircle gauge for workdays of float: green when comfortable, amber under the risk threshold, red when negative. */
export function FloatGauge({ value, risk = 10, label, sub }: { value: number | null; risk?: number; label: string; sub?: string }) {
  const min = -30, max = 30
  const v = value === null ? 0 : Math.max(min, Math.min(max, value))
  const a = Math.PI * (1 - (v - min) / (max - min))
  const cx = 100, cy = 92, r = 74
  const pt = (ang: number, rr = r) => `${cx + rr * Math.cos(ang)} ${cy - rr * Math.sin(ang)}`
  const arc = (from: number, to: number) => `M${pt(Math.PI * (1 - (from - min) / (max - min)))} A${r} ${r} 0 0 1 ${pt(Math.PI * (1 - (to - min) / (max - min)))}`
  const tone = value === null ? '' : value < 0 ? 'bad' : value < risk ? 'warn' : 'good'
  return (
    <figure className={`gauge ${tone}`}>
      <svg viewBox="0 0 200 112" role="img" aria-label={`${label}: ${value === null ? 'no linked dates' : `${value} workdays of float`}`}>
        <path d={arc(min, 0)} className="g-bad" />
        <path d={arc(0, risk)} className="g-warn" />
        <path d={arc(risk, max)} className="g-good" />
        {value !== null && <line x1={cx} y1={cy} x2={cx + (r - 12) * Math.cos(a)} y2={cy - (r - 12) * Math.sin(a)} className="needle" />}
        <circle cx={cx} cy={cy} r={5} className="hub" />
      </svg>
      <figcaption>
        <b className="tab-nums">{value === null ? '—' : value > 0 ? `+${value}` : value}</b>
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </figcaption>
    </figure>
  )
}

export function BurnChart({ burn }: { burn: BurnDown }) {
  const pts = [...burn.history.map(p => ({ d: p.week, v: p.open, f: false })), ...burn.forecast.map(p => ({ d: p.week, v: p.projected!, f: true }))]
  const W = 600, H = 180, pad = 28
  const maxV = Math.max(1, ...pts.map(p => p.v))
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - pad - (v / maxV) * (H - pad * 2)
  const hist = pts.filter(p => !p.f)
  const line = (xs: { v: number }[], off: number) => xs.map((p, i) => `${i ? 'L' : 'M'}${x(i + off)} ${y(p.v)}`).join(' ')
  const nowI = hist.length - 1
  return (
    <svg className="burn" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Open items: ${hist.at(-1)!.v} now; ${burn.netPerWeek > 0 ? `net ${burn.netPerWeek.toFixed(1)} closed per week` : 'not burning down at the current rate'}.`}>
      {[0, .5, 1].map(f => <g key={f}><line x1={pad} x2={W - pad} y1={y(maxV * f)} y2={y(maxV * f)} className="tick" /><text x={pad - 6} y={y(maxV * f) + 4} textAnchor="end" className="tick-label">{Math.round(maxV * f)}</text></g>)}
      <path d={`${line(hist, 0)} L${x(nowI)} ${H - pad} L${x(0)} ${H - pad} Z`} className="burn-area" />
      <path d={line(hist, 0)} className="burn-line" />
      <path d={line(pts.slice(nowI), nowI)} className="burn-fc" />
      <line x1={x(nowI)} x2={x(nowI)} y1={pad / 2} y2={H - pad} className="now" />
      <text x={x(0)} y={H - 8} className="tick-label">{fmtShort(pts[0].d)}</text>
      <text x={x(nowI)} y={H - 8} textAnchor="middle" className="tick-label">Now</text>
      <text x={x(pts.length - 1)} y={H - 8} textAnchor="end" className="tick-label">{fmtShort(pts.at(-1)!.d)}</text>
    </svg>
  )
}

/** Horizontal share bar of workdays by party. */
export function RoleBar({ roles }: { roles: { role: Role; days: number }[] }) {
  const total = roles.reduce((a, r) => a + r.days, 0) || 1
  return (
    <div className="rolebar" role="img" aria-label={roles.map(r => `${r.role} ${Math.round(r.days / total * 100)}%`).join(', ')}>
      {roles.filter(r => r.days > 0).map(r => <span key={r.role} style={{ flexGrow: r.days, background: ROLE_VAR[r.role] }} title={`${r.role}: ${r.days} workdays`} />)}
    </div>
  )
}

export const RoleDot = ({ role }: { role: Role | '' }) => role ? <i className="role-dot" style={{ background: ROLE_VAR[role] }} aria-hidden="true" /> : null
