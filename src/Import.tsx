import { useMemo, useRef, useState } from 'react'
import { asOfDay, itemStates, snapshot } from './engine/analyze.ts'
import { constructionHolidays, fromIso, toIso } from './engine/calendar.ts'
import { attachHistory, autoMap, detectFormat, FIELDS, findHeaderRow, FORMATS, mergeItems, parseCsv, parseTable, type Format, type Mapping, type Table } from './engine/parse.ts'
import type { Config, Dataset, Kind } from './engine/types.ts'
import { createBlankProject } from './projectData.ts'
import { putData, saveProject, uuid, type Project } from './store.ts'
import { RAW_SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, fmtDay, go, Link, toast } from './ui.tsx'

interface Pending { id: string; name: string; format: Format; table: Table; map: Mapping; itemKind?: Kind }

const TEMPLATES: Record<string, string> = {
  'rfi-log-template.csv': 'Number,Title,Status,Ball in court,Assigned to,Created on,Sent date,Due date,Responded on,Closed on,Spec section,Activity ID,Cost impact,Schedule impact\n1,Embed conflict at grid C/4,Open,Example Architects,Example Architects,2026-10-01,2026-10-02,2026-10-16,,,03 30 00,A1010,No,Yes\n',
  'submittal-log-template.csv': 'Number,Title,Spec section,Revision,Status,Ball in court,Reviewer,Created on,Submitted on,Due date,Returned on,Closed on,Required on job date,Lead time,Activity ID\n08 44 13-001,Curtain wall shop drawings,08 44 13,1,In review,Example Architects,Example Architects,2026-07-20,2026-09-25,2026-10-09,,,2026-12-14,10 weeks,A1310\n',
  'status-history-template.csv': 'Number,Type,Changed on,Ball in court,Status\n1,RFI,2026-10-01,Your Company,Draft\n1,RFI,2026-10-02,Example Architects,Open\n1,RFI,2026-10-20,Your Company,Answered\n',
  'schedule-template.csv': 'Activity ID,Activity name,Start,Finish,Total float,Critical\nA1310,Curtain wall install (08 44 13),2026-12-14,2027-03-05,0,Yes\n',
  'spec-sections-template.csv': 'Section,Title\n08 44 13,Glazed aluminum curtain walls\n',
}

/** Workbooks: the first sheet whose header row we recognise, else the first sheet. */
async function readXlsx(f: File): Promise<Table> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await f.arrayBuffer(), { cellDates: false })
  let best: Table | null = null
  for (const n of wb.SheetNames) {
    const t = findHeaderRow(parseCsv(XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })))
    if (!best) best = t
    if (t.rows.length > 1 && detectFormat(t.rows[0]) !== 'generic-items') return t
  }
  return best ?? { rows: [], lines: [] }
}

export default function DataTab({ project, ds, update, setConfig }: { project: Project; ds: Dataset; update(p: Partial<Project>): void; setConfig(p: Partial<Config>): void }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const sync = useSync()
  const size = useMemo(() => project.sampleId ? 0 : JSON.stringify(ds).length, [ds, project.sampleId])
  const cfg = project.config

  const readFiles = async (files: FileList | File[]) => {
    setBusy(true)
    const next: Pending[] = []
    for (const f of [...files]) {
      if (f.size > 50_000_000) { toast(`${f.name} is over 50 MB. Export one log at a time.`, { tone: 'error' }); continue }
      try {
        const table = /\.xls[xm]?$/i.test(f.name) ? await readXlsx(f) : findHeaderRow(parseCsv(await f.text()))
        if (table.rows.length < 2) { toast(`${f.name} has no data rows.`, { tone: 'error' }); continue }
        const format = detectFormat(table.rows[0])
        next.push({ id: uuid(), name: f.name, format, table, map: autoMap(table.rows[0], FORMATS[format].kind), itemKind: FORMATS[format].itemKind ?? (/submittal/i.test(f.name) ? 'submittal' : /rfi/i.test(f.name) ? 'rfi' : undefined) })
      } catch (e) { toast(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}`, { tone: 'error' }) }
    }
    setPending(p => [...p, ...next])
    setBusy(false)
  }

  /** Samples are read-only: importing into one starts a new project. */
  const commit = async (p: Pending, parsed: ReturnType<typeof parseTable>) => {
    const kind = FORMATS[p.format].kind
    const t = project.sampleId ? await createBlankProject('My project') : project
    const base: Dataset = project.sampleId ? { items: [], activities: [], specs: [] } : ds
    let next: Dataset = base
    let rows = 0, note = ''
    if (kind === 'items') { next = { ...base, items: mergeItems(base.items, parsed.items) }; rows = parsed.items.length }
    if (kind === 'schedule') { next = { ...base, activities: parsed.activities }; rows = parsed.activities.length }
    if (kind === 'specs') { next = { ...base, specs: parsed.specs }; rows = parsed.specs.length }
    if (kind === 'history') {
      if (!base.items.length) { toast('Import the RFI or submittal log first, then its history.', { tone: 'error' }); return }
      const r = attachHistory(base.items, parsed.history)
      next = { ...base, items: r.items }; rows = parsed.history.length
      note = r.unmatched.length ? `; ${r.unmatched.length} numbers not in the log` : ''
    }
    await putData(t.id, next)
    const meta = { id: uuid(), format: p.format, fileName: p.name, rows, skipped: parsed.skipped, at: Date.now() }
    const tcfg = project.sampleId ? t.config : cfg
    // Each items import also records a dated snapshot, so History fills up without extra clicks.
    const snaps = project.sampleId ? [] : project.snapshots
    let snapshots = snaps
    if (kind === 'items' || kind === 'history') {
      const asOf = asOfDay(tcfg)
      const snap = snapshot(itemStates(next, tcfg), asOf, uuid(), `Import ${fmtDay(asOf)}`)
      snapshots = [...snaps.filter(s => s.asOf !== asOf), snap].sort((x, y) => x.asOf - y.asOf)
    }
    await saveProject({ ...t, config: tcfg, imports: [...(project.sampleId ? [] : project.imports), meta], snapshots, dataMissing: false })
    setPending(x => x.filter(y => y.id !== p.id))
    toast(`Imported ${rows.toLocaleString()} ${kind === 'items' ? 'items' : kind === 'schedule' ? 'activities' : kind === 'specs' ? 'spec sections' : 'history events'}${parsed.skipped ? `, skipped ${parsed.skipped}` : ''}${note}`, { tone: 'ok' })
    if (project.sampleId) go(`/app/p/${t.id}/data`)
  }

  const holidays = cfg.holidays.map(toIso).join('\n')
  const counts = { rfi: ds.items.filter(i => i.kind === 'rfi').length, sub: ds.items.filter(i => i.kind === 'submittal').length, hist: ds.items.filter(i => i.history?.length).length }

  return (
    <>
      {project.dataMissing && <div className="banner warn"><span><strong>This project&rsquo;s logs are on another device.</strong> Settings, links and snapshots synced; logs over {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB stay where they were imported. Re-import here to recompute.</span></div>}
      {!ds.items.length && !pending.length && (
        <div className="banner"><span><strong>Start here.</strong> Export the RFI log and the submittal log (<Link href="/docs">exact steps for Autodesk Build and Procore</Link>), then drop both files below. A schedule and a spec list are optional.</span></div>
      )}
      <div className="panel">
        <div className="panel-head"><h2>Import</h2><span className="muted small">Autodesk Build · Procore · P6 · MS Project · any CSV or XLSX</span></div>
        {project.sampleId && <p className="muted small">This is a synthetic sample, so its data is read-only. Importing here starts a new project.</p>}
        <div className={`drop${drag ? ' over' : ''}`} role="button" tabIndex={0} aria-label="Choose CSV or Excel files to import"
          onClick={() => input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); void readFiles(e.dataTransfer.files) }}>
          <h3>{busy ? 'Reading files' : 'Drop exports here, or click to choose'}</h3>
          <p className="muted small" style={{ margin: 0 }}>RFI log, submittal log, status history, schedule, spec sections. Parsed in your browser. Re-importing updates items by number instead of duplicating.</p>
          <input ref={input} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" multiple hidden onChange={e => { if (e.target.files) void readFiles(e.target.files); e.target.value = '' }} />
        </div>
        <p className="small muted">Templates: {Object.keys(TEMPLATES).map((n, i) => <span key={n}>{i ? ' · ' : ''}<button type="button" className="linkish" onClick={() => download(n, TEMPLATES[n])}>{n.replace('-template.csv', '').replace(/-/g, ' ')}</button></span>)}</p>
      </div>

      {pending.map(p => <PendingFile key={p.id} p={p} onChange={n => setPending(x => x.map(y => y.id === p.id ? n : y))} onCancel={() => setPending(x => x.filter(y => y.id !== p.id))} onCommit={commit} />)}

      <div className="panel">
        <div className="panel-head"><h2>Project settings</h2></div>
        <div className="inline-fields">
          <label className="field"><span>Your company (GC)</span><input defaultValue={cfg.gcName} key={cfg.gcName} onBlur={e => { const v = e.target.value.trim(); if (v !== cfg.gcName) setConfig({ gcName: v, firms: v ? { ...cfg.firms, [v]: 'GC' } : cfg.firms }) }} /></label>
          <label className="field"><span>Review cycles assumed</span><input type="number" min="1" max="4" value={cfg.reviewCycles} onChange={e => setConfig({ reviewCycles: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} /></label>
          <label className="field"><span>Default lead time (calendar days)</span><input type="number" min="0" max="365" value={cfg.defaultLeadDays} onChange={e => setConfig({ defaultLeadDays: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label className="field"><span>At-risk float (workdays)</span><input type="number" min="0" max="60" value={cfg.riskFloat} onChange={e => setConfig({ riskFloat: Math.max(0, Number(e.target.value) || 0) })} /></label>
        </div>
        <p className="muted small">Contract review periods per party and firm roles are on the <Link href={`/app/p/${project.id}/parties`}>Parties</Link> tab.</p>
        <label className="field"><span>Holidays (one date per line, excluded from working days)</span>
          <textarea rows={4} defaultValue={holidays} key={holidays} onBlur={e => {
            const days = e.target.value.split(/[\s,]+/).filter(Boolean).map(s => fromIso(s)).filter(d => Number.isFinite(d))
            setConfig({ holidays: [...new Set(days)].sort((x, y) => x - y) })
          }} />
        </label>
        <button type="button" className="btn ghost sm" onClick={() => { const y = new Date().getUTCFullYear(); setConfig({ holidays: [y - 1, y, y + 1].flatMap(constructionHolidays) }); toast('Reset to the US construction holidays', { tone: 'ok' }) }}>Reset to US construction holidays</button>
      </div>

      {(project.imports.length > 0 || ds.items.length > 0) && (
        <div className="panel">
          <div className="panel-head"><h2>Imported data</h2><span className="muted small">{counts.rfi} RFIs · {counts.sub} submittals · {counts.hist} with history · {ds.activities.length} activities · {ds.specs.length} spec sections{size ? ` · ${(size / 1e6).toFixed(2)} MB` : ''}</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>File</th><th>Format</th><th className="num">Rows</th><th className="num">Skipped</th><th>When</th></tr></thead>
              <tbody>{[...project.imports].reverse().map(i => <tr key={i.id}><th scope="row" className="break">{i.fileName}</th><td>{FORMATS[i.format]?.label ?? i.format}</td><td className="num">{i.rows.toLocaleString()}</td><td className="num">{i.skipped}</td><td className="small">{new Date(i.at).toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted small">{sync.user
            ? size > RAW_SYNC_LIMIT ? `These logs are over ${(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB, so they stay on this device. Settings, firm roles, links and snapshots still sync.` : 'Synced to your account with settings, firm roles, links and snapshots.'
            : 'Stored in this browser only. Sign in to sync across devices.'}</p>
          {!project.sampleId && <button type="button" className="btn sm danger-ghost" onClick={async () => {
            if (!(await ask('Clear imported data?', 'Removes the logs, schedule and spec list from this project on this device. Settings and snapshots stay. You can undo for a few seconds.', 'Clear data'))) return
            const before = ds, imports = project.imports
            await putData(project.id, { items: [], activities: [], specs: [] })
            update({ imports: [] })
            toast('Cleared imported data', { undo: async () => { await putData(project.id, before); update({ imports }) } })
          }}>Clear imported data</button>}
        </div>
      )}
    </>
  )
}

function PendingFile({ p, onChange, onCancel, onCommit }: { p: Pending; onChange(p: Pending): void; onCancel(): void; onCommit(p: Pending, parsed: ReturnType<typeof parseTable>): Promise<void> }) {
  const parsed = useMemo(() => parseTable(p.table, p.map, p.format, p.itemKind), [p])
  const [busy, setBusy] = useState(false)
  const kind = FORMATS[p.format].kind
  const headers = p.table.rows[0] ?? []
  const errors = parsed.issues.filter(i => i.level === 'error')
  const n = kind === 'items' ? parsed.items.length : kind === 'schedule' ? parsed.activities.length : kind === 'specs' ? parsed.specs.length : parsed.history.length
  const noun = kind === 'items' ? 'items' : kind === 'schedule' ? 'activities' : kind === 'specs' ? 'sections' : 'events'
  return (
    <div className="panel pending">
      <div className="panel-head">
        <h2 className="break">{p.name}</h2>
        <div className="row gap-sm wrap">
          <label className="row gap-sm small">Detected as
            <select value={p.format} style={{ width: 'auto' }} onChange={e => { const f = e.target.value as Format; onChange({ ...p, format: f, map: autoMap(headers, FORMATS[f].kind), itemKind: FORMATS[f].itemKind ?? p.itemKind }) }}>
              {(Object.keys(FORMATS) as Format[]).map(f => <option key={f} value={f}>{FORMATS[f].label}</option>)}
            </select>
          </label>
          {p.format === 'generic-items' && <label className="row gap-sm small">Rows are
            <select value={p.itemKind ?? ''} style={{ width: 'auto' }} onChange={e => onChange({ ...p, itemKind: (e.target.value || undefined) as Kind | undefined })}>
              <option value="">Auto (type column)</option><option value="rfi">RFIs</option><option value="submittal">Submittals</option>
            </select>
          </label>}
        </div>
      </div>
      <h3 className="small strong">Column mapping</h3>
      <div className="map-grid">
        {FIELDS[kind].map(f => (
          <label key={f.key} className="field"><span>{f.label}{f.required ? ' *' : ''}</span>
            <select value={p.map[f.key] ?? ''} onChange={e => { const map = { ...p.map }; if (e.target.value === '') delete map[f.key]; else map[f.key] = Number(e.target.value); onChange({ ...p, map }) }}>
              <option value="">Not mapped</option>
              {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <h3 className="small strong" style={{ marginTop: 8 }}>Validation</h3>
      <p className="small">
        <strong className="good-text">{n.toLocaleString()} {noun} ready</strong> from {parsed.total.toLocaleString()} rows
        {parsed.skipped > 0 && <>, <strong className="error">{parsed.skipped} skipped</strong></>}
        {parsed.issues.length > errors.length && <>, {parsed.issues.length - errors.length} warnings</>}.
        {kind === 'items' && parsed.items.length > 0 && <> {parsed.items.filter(i => i.kind === 'rfi').length} RFIs, {parsed.items.filter(i => i.kind === 'submittal').length} submittals, {parsed.items.filter(i => i.open).length} open.</>}
      </p>
      {parsed.issues.length > 0 && (
        <div className="issues" role="log" aria-label="Validation issues">
          {parsed.issues.slice(0, 200).map((i, k) => <div key={k} className={i.level === 'error' ? 'error-row' : ''}><span className="ln">line {i.line}</span><span>{i.message}</span></div>)}
          {parsed.issues.length > 200 && <div><span className="ln" /><span className="muted">and {parsed.issues.length - 200} more</span></div>}
        </div>
      )}
      <div className="row gap" style={{ marginTop: 14 }}>
        <button type="button" className="btn primary" disabled={!n || busy} onClick={async () => { setBusy(true); await onCommit(p, parsed); setBusy(false) }}>Import {n.toLocaleString()} {noun}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
