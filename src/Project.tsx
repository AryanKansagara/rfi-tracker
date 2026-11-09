import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BurnChart, narrow, RoleBar, RoleDot, ROLE_VAR, Swimlane } from './charts.tsx'
import { snapshot, type ItemState } from './engine/analyze.ts'
import { fromIso, toIso } from './engine/calendar.ts'
import { toCsv } from './engine/parse.ts'
import { ROLES, type Config } from './engine/types.ts'
import { useAnalysis, useProject, type Analysis } from './projectData.ts'
import { uuid, type Project as P } from './store.ts'
import { download, Empty, fmtDay, fmtN, fmtShort, go, isTyping, Link, NotFound, SyntheticBadge, toast } from './ui.tsx'

const DataTab = lazy(() => import('./Import.tsx'))
const Tabs = lazy(() => import('./Tabs.tsx'))

const TABS = [['overview', 'Overview'], ['log', 'Log'], ['schedule', 'Schedule'], ['parties', 'Parties'], ['actions', 'Actions'], ['history', 'History'], ['data', 'Data']] as const

export const itemLabel = (s: ItemState) => `${s.item.kind === 'rfi' ? 'RFI' : 'SUB'} ${s.item.number}`

export function saveSnapshot(project: P, a: Analysis, update: (p: Partial<P>) => void, label?: string) {
  const snap = snapshot(a.states, a.asOf, uuid(), label ?? `Week ending ${fmtDay(a.asOf)}`)
  const rest = project.snapshots.filter(s => s.asOf !== a.asOf)
  update({ snapshots: [...rest, snap].sort((x, y) => x.asOf - y.asOf) })
  toast(rest.length < project.snapshots.length ? `Snapshot for ${fmtDay(a.asOf)} replaced` : `Snapshot saved for ${fmtDay(a.asOf)}`, { tone: 'ok' })
}

export default function ProjectView({ id, tab }: { id: string; tab: string }) {
  const { loading, project, ds, update, setConfig } = useProject(id)
  const a = useAnalysis(ds, project?.config)
  const [focus, setFocus] = useState<string | undefined>()

  useEffect(() => { if (project) document.title = `${project.name} · Ball in Court` }, [project?.name])
  useEffect(() => {
    if (!project || !a) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) { go(`/app/p/${id}/${TABS[n - 1][0]}`, { keepScroll: true }); return }
      if (e.key === 's' || e.key === 'S') saveSnapshot(project, a, update)
      if (e.key === 'p' || e.key === 'P') go(`/app/p/${id}/report`)
      if (e.key === '/') { e.preventDefault(); go(`/app/p/${id}/log`, { keepScroll: true }); setTimeout(() => (document.getElementById('log-search') as HTMLInputElement | null)?.focus(), 50) }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [project, a, id])

  if (loading) return <div className="boot" role="status"><span className="spinner" /> Opening project</div>
  if (!project || !ds || !a) return <NotFound />
  const empty = ds.items.length === 0
  const active = empty && tab !== 'data' && tab !== 'history' ? 'data' : tab

  return (
    <section className="page">
      <div className="proj-head">
        <div>
          <div className="row gap-sm"><Link href="/app" className="muted small">Projects</Link><span className="muted small">/</span>{project.sampleId && <SyntheticBadge />}</div>
          <h1>{project.name}</h1>
          <p className="muted small">{a.summary.openRfis} open RFIs &middot; {a.summary.openSubmittals} open submittals &middot; {ds.activities.length ? `${ds.activities.length} schedule activities` : 'no schedule linked'}</p>
        </div>
        <div className="row gap wrap">
          <label className="field asof"><span>As of</span>
            <input type="date" value={toIso(a.asOf)} onChange={e => { if (e.target.value) setConfig({ asOf: fromIso(e.target.value) }) }} />
          </label>
          {project.config.asOf !== undefined && !project.sampleId && <button type="button" className="btn ghost sm" onClick={() => setConfig({ asOf: undefined })}>Today</button>}
          <button type="button" className="btn outline" disabled={empty} onClick={() => saveSnapshot(project, a, update)} title="Shortcut: S">Save weekly snapshot</button>
          <Link href={`/app/p/${id}/report`} className={`btn primary${empty ? ' disabled' : ''}`} aria-disabled={empty} title="Shortcut: P">OAC report</Link>
        </div>
      </div>
      <nav className="tabs" aria-label="Project sections">
        {TABS.map(([k, l], i) => <Link key={k} href={`/app/p/${id}/${k}`} aria-current={active === k ? 'page' : undefined} title={`Shortcut: ${i + 1}`}>{l}{k === 'actions' && a.summary.overdue > 0 && <span className="tab-count">{a.summary.overdue}</span>}</Link>)}
      </nav>
      <Suspense fallback={<div className="boot" role="status"><span className="spinner" /> Loading</div>}>
        {active === 'overview' && <Overview project={project} a={a} ds={ds} focus={focus} setFocus={setFocus} />}
        {active === 'log' && <Log a={a} focus={focus} setFocus={setFocus} name={project.name} />}
        {(active === 'schedule' || active === 'parties' || active === 'actions' || active === 'history') && <Tabs tab={active} project={project} a={a} ds={ds} update={update} setConfig={setConfig} />}
        {active === 'data' && <DataTab project={project} ds={ds} update={update} setConfig={setConfig} />}
        {!TABS.some(t => t[0] === active) && <Empty title="No such section"><Link href={`/app/p/${id}`}>Back to overview</Link></Empty>}
      </Suspense>
    </section>
  )
}

// ---------- Overview ----------

function Overview({ project, a, ds, focus, setFocus }: { project: P; a: Analysis; ds: NonNullable<ReturnType<typeof useProject>['ds']>; focus?: string; setFocus(k?: string): void }) {
  const s = a.summary
  const prev = [...project.snapshots].filter(x => x.asOf < a.asOf).at(-1)?.summary
  const delta = (now: number, was?: number) => was === undefined || now === was ? null : <span className={`delta ${now > was ? 'up' : 'down'}`}>{now > was ? '+' : '−'}{Math.abs(now - was)}</span>
  const sel = a.states.find(x => x.item.key === focus)
  const worst = a.states.filter(x => x.overdue).sort((x, y) => y.daysLate - x.daysLate).slice(0, 6)
  return (
    <>
      <div className="kpis">
        <div className="kpi"><small>Open items</small><b>{s.open}{delta(s.open, prev?.open)}</b><p>{s.openRfis} RFIs, {s.openSubmittals} submittals</p></div>
        <div className={`kpi${s.overdue ? ' bad' : ''}`}><small>Past contract period</small><b>{s.overdue}{delta(s.overdue, prev?.overdue)}</b><p>{s.open ? `${Math.round(s.overdue / s.open * 100)}% of open` : 'Nothing open'}</p></div>
        <div className="kpi"><small>Median age, open</small><b>{fmtN(s.medianAge, 0)}<span className="unit">workdays</span></b><p>{s.newThisWeek} new, {s.closedThisWeek} closed this week</p></div>
        <div className={`kpi${s.delays ? ' bad' : s.threats ? ' warn' : ''}`}><small>Critical path threats</small><b>{s.threats}{delta(s.threats, prev?.threats)}</b><p>{s.minFloat === null ? 'Link a schedule to see float' : `Least float ${s.minFloat > 0 ? '+' : ''}${s.minFloat} workdays`}</p></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Ball in court, last 10 weeks</h2><span className="muted small">Click a line to inspect it. Hot segments ran past the contract period.</span></div>
        <div className="swim-wrap"><Swimlane ds={ds} cfg={project.config} asOf={a.asOf} states={a.states} weeks={10} focus={focus} onPick={k => setFocus(k === focus ? undefined : k)} height={narrow() ? 380 : 320} width={narrow() ? 520 : 1000} /></div>
        {sel ? <ItemDetail s={sel} onClose={() => setFocus(undefined)} /> : <p className="muted small">Lanes show who held each item and when it changed hands. Dots on the right are where open items sit today.</p>}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Threatening the schedule</h2><Link href={`/app/p/${project.id}/schedule`} className="small">Register</Link></div>
          {a.threats.length === 0 ? <p className="muted">{ds.activities.length ? 'No open item is eating into a critical activity. ' : 'Import a schedule (P6, MS Project or any CSV) on the Data tab to link items to activities. '}Required-on-site dates in the submittal log still count.</p> : (
            <ul className="risk-list">
              {a.threats.slice(0, 6).map(t => (
                <li key={t.item.key} className={t.sched!.threat!}>
                  <button type="button" className="linkish" onClick={() => setFocus(t.item.key)}>{itemLabel(t)}</button>
                  <span className="grow break">{t.item.title}{t.linked && <small className="muted"> &rarr; {t.linked.name}</small>}</span>
                  <b className="tab-nums">{t.sched!.float > 0 ? '+' : ''}{t.sched!.float}d</b>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Most overdue</h2><Link href={`/app/p/${project.id}/actions`} className="small">Reminders</Link></div>
          {worst.length === 0 ? <p className="muted">Nothing is past its contract review period.</p> : (
            <ul className="risk-list">
              {worst.map(t => (
                <li key={t.item.key}>
                  <button type="button" className="linkish" onClick={() => setFocus(t.item.key)}>{itemLabel(t)}</button>
                  <span className="grow break"><RoleDot role={t.holder!.role} /> {t.holder!.firm}</span>
                  <b className="tab-nums error">{t.daysLate}d late</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Open-item burn-down</h2></div>
          <BurnChart burn={a.burn} />
          <p className="small">{a.burn.openedPerWeek.toFixed(1)} opened and {a.burn.closedPerWeek.toFixed(1)} closed per week over the last 8 weeks. {a.burn.netPerWeek > 0 && a.burn.zeroWeek !== null && a.burn.zeroWeek - a.asOf <= 365 ? <>At this rate the log clears around <b>{fmtDay(a.burn.zeroWeek)}</b>.</> : a.burn.netPerWeek >= 0 ? <b className="warn-text">Items close about as fast as they open, so the open count is flat.</b> : <b className="warn-text">The log is growing faster than it closes.</b>}</p>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Where the time went</h2><Link href={`/app/p/${project.id}/parties`} className="small">Scorecards</Link></div>
          <RoleBar roles={a.roles} />
          <table className="compact">
            <thead><tr><th>Party</th><th className="num">Workdays held</th><th className="num">Holding now</th><th className="num">Overdue</th></tr></thead>
            <tbody>{a.roles.map(r => <tr key={r.role}><th scope="row"><RoleDot role={r.role} /> {r.role}</th><td className="num">{fmtN(r.days)}</td><td className="num">{r.holding}</td><td className={`num${r.overdue ? ' error' : ''}`}>{r.overdue}</td></tr>)}</tbody>
          </table>
          <h3 className="small strong">Cost and schedule impact flags</h3>
          <table className="compact">
            <thead><tr><th /><th className="num">Cost</th><th className="num">Schedule</th><th className="num">Both</th><th className="num">Open w/ impact</th></tr></thead>
            <tbody>{a.impacts.map(i => <tr key={i.kind}><th scope="row">{i.kind}</th><td className="num">{i.cost}</td><td className="num">{i.schedule}</td><td className="num">{i.both}</td><td className="num">{Math.max(i.openCost, i.openSchedule)}</td></tr>)}</tbody>
          </table>
          {a.impacts.some(i => i.costValue > 0) && <p className="muted small">Potential cost carried on flagged items: ${fmtN(a.impacts.reduce((x, i) => x + i.costValue, 0))}.</p>}
        </div>
      </div>
    </>
  )
}

export function ItemDetail({ s, onClose }: { s: ItemState; onClose?(): void }) {
  const total = s.segs.reduce((x, g) => x + g.days, 0) || 1
  return (
    <div className="detail">
      <div className="row between top">
        <div>
          <div className="muted small">{s.item.kind === 'rfi' ? 'RFI' : 'Submittal'} {s.item.number}{s.item.revision ? ` · Rev ${s.item.revision}` : ''}{s.item.spec ? ` · ${s.item.spec}` : ''} · {s.item.status}</div>
          <h3>{s.item.title}</h3>
        </div>
        {onClose && <button type="button" className="icon-btn" aria-label="Close detail" onClick={onClose}>&times;</button>}
      </div>
      <div className="seg-bar" role="img" aria-label="Time with each party">
        {s.segs.map((g, i) => <span key={i} style={{ flexGrow: Math.max(g.days, 0.4), background: ROLE_VAR[g.role] }} className={g.late ? 'late' : ''} title={`${g.firm}: ${g.days} workdays`} />)}
      </div>
      <table className="compact">
        <thead><tr><th>With</th><th>From</th><th>To</th><th className="num">Workdays</th><th className="num">Allowed</th><th className="num">Late</th></tr></thead>
        <tbody>{s.segs.map((g, i) => (
          <tr key={i}><th scope="row"><RoleDot role={g.role} /> {g.firm} <small className="muted">{g.role}</small></th><td>{fmtShort(g.from)}</td><td>{g.open ? 'now' : fmtShort(g.to)}</td><td className="num">{g.days} <small className="muted">({Math.round(g.days / total * 100)}%)</small></td><td className="num">{['Architect', 'Engineer', 'Owner'].includes(g.role) ? g.allowed : '—'}</td><td className={`num${g.late ? ' error' : ''}`}>{['Architect', 'Engineer', 'Owner'].includes(g.role) && g.late ? g.late : ''}</td></tr>
        ))}</tbody>
      </table>
      {s.sched && <p className="small">{s.item.kind === 'submittal' ? <>Needed on site {fmtDay(s.sched.needBy)}{s.sched.submitBy !== undefined && <>; submit by {fmtDay(s.sched.submitBy)}</>}; forecast on site {fmtDay(s.sched.forecast)}.</> : <>Needed before {s.linked?.name ?? 'the linked activity'} starts {fmtDay(s.sched.needBy)}; forecast answer {fmtDay(s.sched.forecast)}.</>} Float <b className={s.sched.float < 0 ? 'error' : ''}>{s.sched.float > 0 ? '+' : ''}{s.sched.float} workdays</b>{s.sched.threat === 'delays' ? ', delays completion' : s.sched.threat === 'at-risk' ? ', at risk' : ''}.</p>}
      {!s.item.history?.length && <p className="muted tiny">No status history imported: hand-offs are inferred from the sent, response and close dates.</p>}
    </div>
  )
}

// ---------- Log ----------

type Filter = { kind: '' | 'rfi' | 'submittal'; state: 'open' | 'all' | 'overdue'; role: string; q: string }

function Log({ a, focus, setFocus, name }: { a: Analysis; focus?: string; setFocus(k?: string): void; name: string }) {
  const [f, setF] = useState<Filter>({ kind: '', state: 'open', role: '', q: '' })
  const [sort, setSort] = useState<{ k: 'late' | 'age' | 'court' | 'num' | 'float'; dir: 1 | -1 }>({ k: 'late', dir: -1 })
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    const xs = a.states.filter(s => (!f.kind || s.item.kind === f.kind) && (f.state === 'all' || (f.state === 'open' ? s.item.open : s.overdue))
      && (!f.role || s.holder?.role === f.role || s.holder?.firm === f.role)
      && (!q || `${s.item.number} ${s.item.title} ${s.holder?.firm ?? ''} ${s.item.spec ?? ''}`.toLowerCase().includes(q)))
    const key = (s: ItemState) => sort.k === 'late' ? s.daysLate * 1000 + s.inCourt : sort.k === 'age' ? s.age : sort.k === 'court' ? s.inCourt : sort.k === 'float' ? s.sched?.float ?? 9999 : 0
    return xs.sort((x, y) => sort.k === 'num' ? sort.dir * x.item.number.localeCompare(y.item.number, undefined, { numeric: true }) : sort.dir * (key(x) - key(y)))
  }, [a, f, sort])
  const firms = [...new Set(a.states.map(s => s.holder?.firm).filter(Boolean) as string[])].sort()
  const th = (k: typeof sort.k, label: string, num = true) => (
    <th className={num ? 'num' : ''} aria-sort={sort.k === k ? sort.dir > 0 ? 'ascending' : 'descending' : 'none'}>
      <button type="button" className="th-sort" onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>{label}{sort.k === k ? sort.dir > 0 ? ' ↑' : ' ↓' : ''}</button>
    </th>
  )
  const exportCsv = () => download(`${name.replace(/\W+/g, '-').toLowerCase()}-log-${toIso(a.asOf)}.csv`, toCsv([
    ['Type', 'Number', 'Title', 'Status', 'Ball in court', 'Party', 'Workdays in court', 'Age (workdays)', 'Due', 'Workdays late', 'Float', 'Revision', 'Cost impact', 'Schedule impact'],
    ...rows.map(s => [s.item.kind, s.item.number, s.item.title, s.item.status, s.holder?.firm ?? '', s.holder?.role ?? '', s.inCourt, s.age, s.holder ? toIso(s.holder.dueAt) : '', s.daysLate, s.sched?.float ?? '', s.item.revision, s.item.costImpact ? 'Yes' : 'No', s.item.scheduleImpact ? 'Yes' : 'No'])]))
  return (
    <div className="panel">
      <div className="toolbar">
        <input id="log-search" type="search" placeholder="Search number, title, firm, spec ( / )" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search the log" />
        <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as Filter['kind'] })} aria-label="Type"><option value="">RFIs and submittals</option><option value="rfi">RFIs</option><option value="submittal">Submittals</option></select>
        <select value={f.state} onChange={e => setF({ ...f, state: e.target.value as Filter['state'] })} aria-label="Status"><option value="open">Open</option><option value="overdue">Overdue only</option><option value="all">All</option></select>
        <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} aria-label="Ball in court"><option value="">Anyone holding</option>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}<optgroup label="Firm">{firms.map(x => <option key={x} value={x}>{x}</option>)}</optgroup></select>
        <button type="button" className="btn outline sm" onClick={exportCsv}>Download CSV</button>
      </div>
      <p className="muted small">{rows.length} item{rows.length === 1 ? '' : 's'}. Ages and lateness are in working days as of {fmtDay(a.asOf)}.</p>
      {rows.length === 0 ? <Empty title="Nothing matches">Try clearing the filters.</Empty> : (
        <div className="table-wrap">
          <table className="log">
            <thead><tr>{th('num', 'Item', false)}<th>Title</th><th>Ball in court</th>{th('court', 'In court')}{th('age', 'Age')}<th>Due</th>{th('late', 'Late')}{th('float', 'Float')}<th>Flags</th></tr></thead>
            <tbody>{rows.slice(0, 400).map(s => (
              <tr key={s.item.key} className={`${s.overdue ? 'is-late' : ''}${focus === s.item.key ? ' is-focus' : ''}`} onClick={() => setFocus(focus === s.item.key ? undefined : s.item.key)}>
                <th scope="row" className="nowrap"><button type="button" className="linkish" aria-expanded={focus === s.item.key}>{itemLabel(s)}</button></th>
                <td className="break">{s.item.title}<div className="muted tiny">{s.item.status}{s.item.spec ? ` · ${s.item.spec}` : ''}</div></td>
                <td>{s.holder ? <><RoleDot role={s.holder.role} /> {s.holder.firm}</> : <span className="muted">Closed {fmtShort(s.item.closed)}</span>}</td>
                <td className="num">{s.holder ? s.inCourt : ''}</td>
                <td className="num">{s.age}</td>
                <td className="nowrap">{s.holder ? fmtShort(s.holder.dueAt) : ''}</td>
                <td className={`num${s.overdue ? ' error strong' : ''}`}>{s.overdue ? s.daysLate : ''}</td>
                <td className={`num${s.sched && s.sched.float < 0 ? ' error' : ''}`}>{s.sched && s.item.open ? (s.sched.float > 0 ? '+' : '') + s.sched.float : ''}</td>
                <td className="nowrap">{s.item.costImpact && <span className="flag" title="Cost impact">$</span>}{s.item.scheduleImpact && <span className="flag" title="Schedule impact">&#9719;</span>}{s.item.revision > 0 && <span className="flag" title="Revision">R{s.item.revision}</span>}{s.sched?.threat && <span className={`flag ${s.sched.threat}`} title={s.sched.threat === 'delays' ? 'Delays completion' : 'At risk'}>CP</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {focus && (() => { const s = a.states.find(x => x.item.key === focus); return s ? <ItemDetail s={s} onClose={() => setFocus(undefined)} /> : null })()}
    </div>
  )
}

