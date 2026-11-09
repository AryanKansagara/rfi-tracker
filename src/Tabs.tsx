import { useMemo, useState } from 'react'
import { RoleDot } from './charts.tsx'
import { delayCsv, delayLog, registerCsv, registerRows, REGISTER_HEADERS, reminders } from './engine/actions.ts'
import { compare, guessRole, resubmittalLoops, type Change } from './engine/analyze.ts'
import { toIso } from './engine/calendar.ts'
import { ROLES, type Config, type Dataset, type Role } from './engine/types.ts'
import { itemLabel, ItemDetail, saveSnapshot } from './Project.tsx'
import type { Analysis } from './projectData.ts'
import { getDefaults, type Project } from './store.ts'
import { deleteSnapshotCloud } from './sync.ts'
import { CopyButton, download, Empty, fmtDay, fmtN, fmtPct, fmtShort, Link, toast } from './ui.tsx'

interface Props { tab: string; project: Project; a: Analysis; ds: Dataset; update(p: Partial<Project>): void; setConfig(p: Partial<Config>): void }

export default function Tabs(p: Props) {
  if (p.tab === 'schedule') return <Schedule {...p} />
  if (p.tab === 'parties') return <Parties {...p} />
  if (p.tab === 'actions') return <Actions {...p} />
  return <History {...p} />
}

const slug = (s: string) => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()

/** SheetJS is loaded only when someone asks for a workbook. */
async function downloadXlsx(name: string, sheet: string, rows: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(48, Math.max(8, ...rows.slice(0, 200).map(r => String(r[i] ?? '').length))) }))
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  download(name, new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}

// ---------- Schedule ----------

function Schedule({ project, a, ds, setConfig }: Props) {
  const [open, setOpen] = useState<string | undefined>()
  const subs = a.states.filter(s => s.item.kind === 'submittal').sort((x, y) => (x.sched?.float ?? 9999) - (y.sched?.float ?? 9999))
  const rfis = a.states.filter(s => s.item.kind === 'rfi' && s.item.open && s.linked)
  const loops = resubmittalLoops(a.states)
  const link = (key: string, id: string) => setConfig({ links: { ...project.config.links, [key]: id } })
  const fileBase = `${slug(project.name)}-submittal-register-${toIso(a.asOf)}`
  return (
    <>
      {!ds.activities.length && <div className="banner"><span><strong>No schedule linked.</strong> Submit-by dates use the required-on-site dates in the submittal log. <Link href={`/app/p/${project.id}/data`}>Import a P6, MS Project or generic schedule</Link> to link items to activities and find critical-path threats.</span></div>}
      <div className="panel">
        <div className="panel-head">
          <h2>Submittal register</h2>
          <div className="row gap-sm wrap">
            <button type="button" className="btn outline sm" onClick={() => download(`${fileBase}.csv`, registerCsv(a.states, ds.specs))}>CSV</button>
            <button type="button" className="btn outline sm" onClick={() => void downloadXlsx(`${fileBase}.xlsx`, 'Submittal register', [REGISTER_HEADERS, ...registerRows(a.states, ds.specs)])}>XLSX</button>
          </div>
        </div>
        <p className="muted small">Submit by = required on site &minus; lead time &minus; {project.config.reviewCycles} review cycle{project.config.reviewCycles > 1 ? 's' : ''} at the reviewer&rsquo;s contract period (fewer once resubmitted). Float is in working days; negative means late. A linked activity&rsquo;s own total float is used before calling it a completion delay.</p>
        {subs.length === 0 ? <Empty title="No submittals yet">Import a submittal log on the Data tab.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Submittal</th><th>Title</th><th>Linked activity</th><th>Needed</th><th className="num">Lead</th><th>Submit by</th><th>Stage</th><th>Forecast</th><th className="num">Float</th></tr></thead>
              <tbody>{subs.map(s => (
                <tr key={s.item.key} className={s.sched?.threat === 'delays' ? 'is-late' : ''}>
                  <th scope="row" className="nowrap"><button type="button" className="linkish" onClick={() => setOpen(open === s.item.key ? undefined : s.item.key)}>{s.item.number}</button>{s.item.revision > 0 && <span className="flag">R{s.item.revision}</span>}</th>
                  <td className="break">{s.item.title}</td>
                  <td>
                    {ds.activities.length ? (
                      <select className="table-input" value={project.config.links[s.item.key] ?? s.linked?.id ?? ''} aria-label={`Activity for ${s.item.number}`} onChange={e => link(s.item.key, e.target.value)}>
                        <option value="">Not linked</option>
                        {ds.activities.map(x => <option key={x.id} value={x.id}>{x.id} {x.name}{x.critical ? ' (critical)' : ''}</option>)}
                      </select>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="nowrap">{fmtShort(s.sched?.needBy)}</td>
                  <td className="num">{s.item.leadDays ?? <span className="muted" title="Project default">{project.config.defaultLeadDays}</span>}</td>
                  <td className="nowrap">{fmtShort(s.sched?.submitBy)}</td>
                  <td className="small">{s.sched?.stage ?? (s.item.open ? 'no dates' : 'closed')}</td>
                  <td className="nowrap">{fmtShort(s.sched?.forecast)}</td>
                  <td className={`num strong${s.sched && s.sched.float < 0 ? ' error' : s.sched && s.sched.float < project.config.riskFloat ? ' warn-text' : ''}`}>{s.sched ? `${s.sched.float > 0 ? '+' : ''}${s.sched.float}` : ''}{s.sched?.threat === 'delays' && <span className="flag delays" title="Delays completion">CP</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {open && (() => { const s = a.states.find(x => x.item.key === open); return s ? <ItemDetail s={s} onClose={() => setOpen(undefined)} /> : null })()}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Open RFIs blocking activities</h2></div>
          {rfis.length === 0 ? <p className="muted">No open RFI is linked to a schedule activity. RFIs link through an activity column, a spec section in the activity name, or by hand on the Log.</p> : (
            <table className="compact">
              <thead><tr><th>RFI</th><th>Activity</th><th>Starts</th><th className="num">Float</th></tr></thead>
              <tbody>{rfis.sort((x, y) => x.sched!.float - y.sched!.float).map(s => <tr key={s.item.key}><th scope="row">{s.item.number}</th><td className="break">{s.linked!.name}</td><td>{fmtShort(s.linked!.start)}</td><td className={`num${s.sched!.float < 0 ? ' error' : ''}`}>{s.sched!.float > 0 ? '+' : ''}{s.sched!.float}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Resubmittal loops</h2></div>
          {loops.length === 0 ? <p className="muted">No submittal has needed a resubmittal.</p> : (
            <table className="compact">
              <thead><tr><th>Submittal</th><th className="num">Revisions</th><th>With</th><th className="num">Age</th></tr></thead>
              <tbody>{loops.map(s => <tr key={s.item.key} className={s.item.revision >= 2 ? 'is-late' : ''}><th scope="row" className="break">{s.item.number} <small className="muted">{s.item.title}</small></th><td className="num strong">{s.item.revision}</td><td>{s.holder ? <><RoleDot role={s.holder.role} /> {s.holder.firm}</> : 'Closed'}</td><td className="num">{s.age}</td></tr>)}</tbody>
            </table>
          )}
          <p className="muted small">Each revision costs a full review cycle. Two or more usually means the requirements were not clear at the first submission.</p>
        </div>
      </div>
    </>
  )
}

// ---------- Parties ----------

function Parties({ project, a, setConfig }: Props) {
  const firms = useMemo(() => [...new Set(a.states.flatMap(s => s.segs.map(g => g.firm)))].filter(f => f !== 'Reviewer').sort(), [a])
  const setRole = (firm: string, role: Role) => setConfig({ firms: { ...project.config.firms, [firm]: role } })
  return (
    <>
      <div className="panel">
        <div className="panel-head"><h2>Reviewer responsiveness</h2><span className="muted small">Working days, as of {fmtDay(a.asOf)}</span></div>
        {a.cards.length === 0 ? <Empty title="No reviews yet" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Firm</th><th className="num">Reviews</th><th className="num">Median turnaround</th><th className="num">90th pct</th><th className="num">Contract period</th><th className="num">% late</th><th className="num">Holding</th><th className="num">Overdue now</th><th className="num">Worst</th></tr></thead>
              <tbody>{a.cards.map(c => {
                const period = project.config.reviewDays[c.role]
                return (
                  <tr key={c.firm}>
                    <th scope="row"><RoleDot role={c.role} /> {c.firm} <small className="muted">{c.role}</small></th>
                    <td className="num">{c.reviews}</td>
                    <td className={`num strong${c.median > period ? ' error' : ''}`}>{fmtN(c.median, c.median % 1 ? 1 : 0)}</td>
                    <td className="num">{fmtN(c.p90)}</td>
                    <td className="num muted">{period}</td>
                    <td className="num"><span className="pct-bar"><i style={{ width: `${(c.pctLate || 0) * 100}%` }} /></span>{fmtPct(c.pctLate)}</td>
                    <td className="num">{c.holding}</td>
                    <td className={`num${c.overdue ? ' error strong' : ''}`}>{c.overdue}</td>
                    <td className="num">{c.worstLate ? `${c.worstLate}d` : ''}</td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
        <p className="muted small">Median counts returned reviews only. % late counts returned reviews plus open ones already past due. Subcontractor rows measure how long revisions and preparation sat with them.</p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Firm roles</h2></div>
          <p className="muted small">Guessed from names; correct any that are wrong. Your company is the GC.</p>
          <label className="field"><span>Your company (GC)</span><input defaultValue={project.config.gcName} onBlur={e => { const v = e.target.value.trim(); if (v !== project.config.gcName) setConfig({ gcName: v, firms: v ? { ...project.config.firms, [v]: 'GC' } : project.config.firms }) }} /></label>
          <div className="table-wrap">
            <table className="compact">
              <thead><tr><th>Firm or person</th><th>Role</th></tr></thead>
              <tbody>{firms.map(f => (
                <tr key={f}><th scope="row" className="break">{f}</th><td>
                  <select className="table-input" value={project.config.firms[f] ?? guessRole(f, project.config.gcName)} aria-label={`Role of ${f}`} onChange={e => setRole(f, e.target.value as Role)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}{!project.config.firms[f] && guessRole(f, project.config.gcName) === r ? ' (guess)' : ''}</option>)}
                  </select>
                </td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Contract review periods</h2></div>
          <p className="muted small">Working days each party has under the contract. An exported due date on the item overrides this for the reviewer holding it.</p>
          <div className="inline-fields">
            {ROLES.map(r => <label key={r} className="field"><span><RoleDot role={r} /> {r}</span><input type="number" min="1" max="60" value={project.config.reviewDays[r]} onChange={e => setConfig({ reviewDays: { ...project.config.reviewDays, [r]: Math.max(1, Number(e.target.value) || 1) } })} /></label>)}
          </div>
          <h3 className="small strong">Open items flagged for cost or schedule impact, by who holds them</h3>
          <table className="compact">
            <thead><tr><th /> {ROLES.map(r => <th key={r} className="num" title={r}><RoleDot role={r} />{r === 'Subcontractor' ? 'Subs' : r === 'Architect' ? 'Arch.' : r === 'Engineer' ? 'Eng.' : r}</th>)}</tr></thead>
            <tbody>{a.impacts.map(i => <tr key={i.kind}><th scope="row">Open {i.kind}</th>{ROLES.map(r => <td key={r} className={`num${i.byRole[r] ? ' strong' : ' muted'}`}>{i.byRole[r]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------- Actions ----------

function Actions({ project, a }: Props) {
  const sender = getDefaults().sender
  const mails = reminders(a.states, project.config, project.name, sender)
  const log = delayLog(a.states)
  const [pick, setPick] = useState(0)
  const m = mails[Math.min(pick, mails.length - 1)]
  return (
    <>
      <div className="grid-3 actions-grid">
        <Link href={`/app/p/${project.id}/report`} className="action-card"><span className="ico">01</span><b>Weekly OAC report</b><small>New, overdue by party, decisions needed, submit-by dates. Printable.</small></Link>
        <a href="#reminders" className="action-card"><span className="ico">02</span><b>{mails.length} reminder email{mails.length === 1 ? '' : 's'}</b><small>One per party holding overdue items.</small></a>
        <a href="#evidence" className="action-card"><span className="ico">03</span><b>{log.length} delay record{log.length === 1 ? '' : 's'}</b><small>Reviews past the contract period, for notices and claims.</small></a>
      </div>

      <div className="panel" id="reminders">
        <div className="panel-head"><h2>Reminder emails</h2>{!sender && <Link href="/settings" className="small">Set your signature</Link>}</div>
        {!m ? <Empty title="Nobody is overdue">No party is past its contract review period. Nothing to chase this week.</Empty> : (
          <div className="mail">
            <div className="mail-list" role="tablist" aria-label="Parties">
              {mails.map((x, i) => <button key={x.firm} type="button" role="tab" aria-selected={i === pick} className={i === pick ? 'on' : ''} onClick={() => setPick(i)}><RoleDot role={x.role} /> <span className="grow">{x.firm}</span><b>{x.count}</b></button>)}
            </div>
            <div className="mail-body">
              <div className="row between wrap gap-sm"><strong className="break">{m.subject}</strong>
                <div className="row gap-sm">
                  <CopyButton text={`Subject: ${m.subject}\n\n${m.body}`} label="Copy email" />
                  <a className="btn primary sm" href={`mailto:?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`}>Open in mail app</a>
                </div>
              </div>
              <pre className="mail-text">{m.body}</pre>
            </div>
          </div>
        )}
      </div>

      <div className="panel" id="evidence">
        <div className="panel-head"><h2>Delay-notice evidence log</h2>{log.length > 0 && <button type="button" className="btn outline sm" onClick={() => download(`${slug(project.name)}-review-delays-${toIso(a.asOf)}.csv`, delayCsv(log))}>Download CSV</button>}</div>
        <p className="muted small">Every reviewer hold that ran past the contract period, open or closed. Dates are when the reviewer received it, the contractual due date and when it came back. Check against your contract&rsquo;s notice provisions before relying on it.</p>
        {log.length === 0 ? <p className="muted">No review has run past its period.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Held by</th><th>Received</th><th>Due</th><th>Returned</th><th className="num">Late</th><th>Impact</th></tr></thead>
              <tbody>{log.slice(0, 300).map((e, i) => (
                <tr key={i}><th scope="row" className="break">{e.label} <small className="muted">{e.title}</small></th><td><RoleDot role={e.role} /> {e.firm}</td><td className="nowrap">{fmtShort(e.sent)}</td><td className="nowrap">{fmtShort(e.due)}</td><td className="nowrap">{e.returned === undefined ? <span className="error">Still open</span> : fmtShort(e.returned)}</td><td className="num strong">{e.late}</td><td>{[e.cost && 'Cost', e.schedule && 'Schedule'].filter(Boolean).join(', ')}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ---------- History ----------

const CHANGE: Record<Change['kind'], [string, string]> = {
  new: ['New', 'Opened since the earlier snapshot'], closed: ['Closed', 'Answered or approved and closed'], moved: ['Moved', 'Ball changed hands'],
  'newly-overdue': ['Newly overdue', 'Went past the contract period'], stuck: ['Stuck', 'Same holder, still past due'], 'float-lost': ['Float lost', 'Schedule float shrank'],
}

function History({ project, a, update }: Props) {
  const snaps = [...project.snapshots].sort((x, y) => x.asOf - y.asOf || x.at - y.at)
  const [ia, setA] = useState(Math.max(0, snaps.length - 2))
  const [ib, setB] = useState(snaps.length - 1)
  if (snaps.length === 0) return (
    <div className="panel"><Empty title="No snapshots yet"><p className="muted">Save a snapshot each week (press <kbd>S</kbd>) before the OAC meeting. Then compare any two to see what moved and what got stuck.</p><button type="button" className="btn primary" onClick={() => saveSnapshot(project, a, update)}>Save this week&rsquo;s snapshot</button></Empty></div>
  )
  const A = snaps[Math.min(ia, snaps.length - 1)], B = snaps[Math.min(ib, snaps.length - 1)]
  const changes = A && B && A.id !== B.id ? compare(A, B) : []
  const groups = (Object.keys(CHANGE) as Change['kind'][]).map(k => [k, changes.filter(c => c.kind === k)] as const).filter(([, xs]) => xs.length)
  const remove = (id: string) => {
    const before = project.snapshots
    update({ snapshots: before.filter(s => s.id !== id) })
    void deleteSnapshotCloud(id)
    toast('Snapshot deleted', { undo: () => update({ snapshots: before }) })
  }
  const d = (k: 'open' | 'overdue' | 'threats' | 'newThisWeek') => B.summary[k] - A.summary[k]
  return (
    <>
      <div className="panel">
        <div className="panel-head"><h2>Snapshots</h2><button type="button" className="btn outline sm" onClick={() => saveSnapshot(project, a, update)}>Save snapshot for {fmtShort(a.asOf)}</button></div>
        <div className="table-wrap">
          <table className="compact">
            <thead><tr><th>Snapshot</th><th className="num">Open</th><th className="num">Overdue</th><th className="num">Threats</th><th className="num">Median age</th><th /></tr></thead>
            <tbody>{[...snaps].reverse().map(s => <tr key={s.id}><th scope="row">{s.label}</th><td className="num">{s.summary.open}</td><td className="num">{s.summary.overdue}</td><td className="num">{s.summary.threats}</td><td className="num">{fmtN(s.summary.medianAge)}</td><td className="num"><button type="button" className="btn danger-ghost sm" onClick={() => remove(s.id)} aria-label={`Delete ${s.label}`}>Delete</button></td></tr>)}</tbody>
          </table>
        </div>
      </div>
      {snaps.length > 1 && (
        <div className="panel">
          <div className="panel-head"><h2>Compare</h2>
            <div className="row gap-sm wrap">
              <select value={ia} onChange={e => setA(Number(e.target.value))} aria-label="Earlier snapshot">{snaps.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}</select>
              <span className="muted">to</span>
              <select value={ib} onChange={e => setB(Number(e.target.value))} aria-label="Later snapshot">{snaps.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}</select>
            </div>
          </div>
          {A.id === B.id ? <p className="muted">Pick two different snapshots.</p> : <>
            <div className="kpis small-kpis">
              {(['open', 'overdue', 'threats'] as const).map(k => <div key={k} className="kpi"><small>{k === 'threats' ? 'Critical threats' : k[0].toUpperCase() + k.slice(1)}</small><b>{B.summary[k]}<span className={`delta ${d(k) > 0 ? 'up' : 'down'}`}>{d(k) ? `${d(k) > 0 ? '+' : '−'}${Math.abs(d(k))}` : ''}</span></b><p className="muted">was {A.summary[k]}</p></div>)}
              <div className="kpi"><small>Changes</small><b>{changes.length}</b><p className="muted">{fmtShort(A.asOf)} to {fmtShort(B.asOf)}</p></div>
            </div>
            {groups.length === 0 ? <p className="muted">Nothing changed between these snapshots.</p> : groups.map(([k, xs]) => (
              <div key={k} className="change-group">
                <h3 className={`change-h ${k}`}>{CHANGE[k][0]} <span className="muted small">{xs.length} &middot; {CHANGE[k][1]}</span></h3>
                <ul className="change-list">{xs.map(c => (
                  <li key={c.key + k}>
                    <b>{c.key.startsWith('rfi') ? 'RFI' : 'SUB'} {c.item.n}</b> <span className="break">{c.item.t}</span>
                    <span className="muted small">
                      {k === 'moved' && <>{c.before!.firm} &rarr; {c.item.firm}</>}
                      {(k === 'stuck' || k === 'newly-overdue') && <>with {c.item.firm}, {c.item.late} workday{c.item.late === 1 ? '' : 's'} late{c.before && c.before.late ? ` (was ${c.before.late})` : ''}</>}
                      {k === 'new' && c.item.firm && <>with {c.item.firm}</>}
                      {k === 'float-lost' && <>float {c.before!.float} &rarr; {c.item.float}</>}
                    </span>
                  </li>
                ))}</ul>
              </div>
            ))}
          </>}
        </div>
      )}
    </>
  )
}

