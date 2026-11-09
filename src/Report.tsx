import { useEffect } from 'react'
import { oacReport } from './engine/actions.ts'
import type { ItemState } from './engine/analyze.ts'
import { useAnalysis, useProject } from './projectData.ts'
import { fmtDay, fmtShort, Link, NotFound } from './ui.tsx'

const lbl = (s: ItemState) => `${s.item.kind === 'rfi' ? 'RFI' : 'Submittal'} ${s.item.number}`

export default function Report({ id }: { id: string }) {
  const { loading, project, ds } = useProject(id)
  const a = useAnalysis(ds, project?.config)
  useEffect(() => { if (project && a) document.title = `OAC report ${fmtDay(a.asOf)} · ${project.name}` }, [project?.name, a?.asOf])
  if (loading) return <div className="boot" role="status"><span className="spinner" /> Building report</div>
  if (!project || !a) return <NotFound />
  const r = oacReport(a.states, project.config)
  const s = a.summary
  return (
    <article className="report">
      <div className="report-actions">
        <Link href={`/app/p/${id}/actions`} className="btn ghost">Back</Link>
        <button type="button" className="btn primary" onClick={() => print()}>Print or save as PDF</button>
      </div>
      <header className="report-head">
        <div className="eyebrow">Weekly OAC meeting &middot; RFI and submittal status</div>
        <h1>{project.name}</h1>
        <p className="muted">As of {fmtDay(a.asOf)}. Ages and lateness in working days. Contract review periods: {Object.entries(project.config.reviewDays).filter(([k]) => k !== 'GC').map(([k, v]) => `${k} ${v}`).join(', ')}.{project.sampleId && ' Synthetic sample data.'}</p>
      </header>
      <div className="kpis">
        <div className="kpi"><small>Open</small><b>{s.open}</b><p>{s.openRfis} RFIs, {s.openSubmittals} submittals</p></div>
        <div className={`kpi${s.overdue ? ' bad' : ''}`}><small>Past contract period</small><b>{s.overdue}</b><p>{r.overdueByParty.length} part{r.overdueByParty.length === 1 ? 'y' : 'ies'} holding</p></div>
        <div className="kpi"><small>This week</small><b>+{s.newThisWeek} / &minus;{s.closedThisWeek}</b><p>opened / closed</p></div>
        <div className={`kpi${s.delays ? ' bad' : ''}`}><small>Critical path</small><b>{s.threats}</b><p>{s.delays} delaying completion</p></div>
      </div>

      {r.threats.length > 0 && <>
        <h2>1. Schedule threats</h2>
        <table><thead><tr><th>Item</th><th>Title</th><th>Activity</th><th>Needed</th><th>Forecast</th><th className="num">Float</th></tr></thead>
          <tbody>{r.threats.map(t => <tr key={t.item.key}><th scope="row">{lbl(t)}</th><td>{t.item.title}</td><td>{t.linked?.name ?? '—'}</td><td>{fmtShort(t.sched!.needBy)}</td><td>{fmtShort(t.sched!.forecast)}</td><td className="num strong">{t.sched!.float}</td></tr>)}</tbody></table>
      </>}

      <h2>{r.threats.length ? 2 : 1}. Overdue by party</h2>
      {r.overdueByParty.length === 0 ? <p>Nothing is past its contract review period.</p> : r.overdueByParty.map(g => (
        <section key={g.firm} className="report-group">
          <h3>{g.firm} <small className="muted">({g.role}, {g.items.length})</small></h3>
          <table><thead><tr><th>Item</th><th>Title</th><th>Received</th><th>Due</th><th className="num">Days late</th></tr></thead>
            <tbody>{g.items.map(t => <tr key={t.item.key}><th scope="row">{lbl(t)}</th><td>{t.item.title}{(t.item.costImpact || t.item.scheduleImpact) && <small className="muted"> ({[t.item.costImpact && 'cost', t.item.scheduleImpact && 'schedule'].filter(Boolean).join(', ')} impact)</small>}</td><td>{fmtShort(t.holder!.from)}</td><td>{fmtShort(t.holder!.dueAt)}</td><td className="num strong">{t.daysLate}</td></tr>)}</tbody></table>
        </section>
      ))}

      <h2>{r.threats.length ? 3 : 2}. Decisions needed</h2>
      {r.decisions.length === 0 ? <p>No owner decisions or impact items are pending with the design team or owner.</p> : (
        <table><thead><tr><th>Item</th><th>Title</th><th>With</th><th className="num">Days</th><th>Impact</th></tr></thead>
          <tbody>{r.decisions.map(t => <tr key={t.item.key}><th scope="row">{lbl(t)}</th><td>{t.item.title}</td><td>{t.holder!.firm}</td><td className="num">{t.inCourt}</td><td>{[t.item.costImpact && 'Cost', t.item.scheduleImpact && 'Schedule'].filter(Boolean).join(', ') || '—'}</td></tr>)}</tbody></table>
      )}

      <h2>{r.threats.length ? 4 : 3}. Submittals due in the next three weeks</h2>
      {r.submitBy.length === 0 ? <p>No unsubmitted submittal has a submit-by date in the next 15 working days.</p> : (
        <table><thead><tr><th>Submittal</th><th>Title</th><th>Held by</th><th>Submit by</th><th className="num">Float</th></tr></thead>
          <tbody>{r.submitBy.map(t => <tr key={t.item.key}><th scope="row">{t.item.number}</th><td>{t.item.title}</td><td>{t.holder?.firm ?? '—'}</td><td className={t.sched!.submitBy! < a.asOf ? 'error strong' : ''}>{fmtShort(t.sched!.submitBy)}{t.sched!.submitBy! < a.asOf && ' (past)'}</td><td className="num">{t.sched!.float}</td></tr>)}</tbody></table>
      )}

      <h2>{r.threats.length ? 5 : 4}. New this week</h2>
      {r.newItems.length === 0 ? <p>No new items.</p> : (
        <table><thead><tr><th>Item</th><th>Title</th><th>Created</th><th>With</th></tr></thead>
          <tbody>{r.newItems.map(t => <tr key={t.item.key}><th scope="row">{lbl(t)}</th><td>{t.item.title}</td><td>{fmtShort(t.item.created)}</td><td>{t.holder?.firm ?? 'Closed'}</td></tr>)}</tbody></table>
      )}
      <p className="muted small report-foot">Prepared with Ball in Court from the project&rsquo;s exported logs. Working days exclude weekends and {project.config.holidays.length} listed holidays.</p>
    </article>
  )
}
