import { useState } from 'react'
import { ROLES } from './engine/types.ts'
import { deleteProject, getDefaults, getProjects, setDefaults, type Defaults } from './store.ts'
import { exportAll, RAW_SYNC_LIMIT, useSync } from './sync.ts'
import { ask, download, setTheme, toast, useDark } from './ui.tsx'

export default function Settings() {
  const [d, setD] = useState<Defaults>(getDefaults)
  const dark = useDark()
  const sync = useSync()
  const save = (p: Partial<Defaults>) => { const next = { ...d, ...p }; setD(next); setDefaults(next); toast('Saved', { tone: 'ok', ttl: 1500 }) }

  return (
    <section className="page narrow settings">
      <div className="eyebrow">Settings</div>
      <h1>Settings</h1>

      <div className="panel">
        <h2>Defaults for new projects</h2>
        <p className="muted small">Existing projects keep their own settings; change those on the project&rsquo;s Data tab.</p>
        <div className="inline-fields">
          <label className="field"><span>Your company (GC)</span><input value={d.gcName} placeholder="e.g. Halvorsen Builders" onChange={e => save({ gcName: e.target.value })} /></label>
          <label className="field"><span>Sign reminder emails as</span><input value={d.sender} placeholder="Your name, title" onChange={e => save({ sender: e.target.value })} /></label>
          <label className="field"><span>Review cycles assumed</span><input type="number" min="1" max="4" value={d.reviewCycles} onChange={e => save({ reviewCycles: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} /></label>
          <label className="field"><span>Default lead time (calendar days)</span><input type="number" min="0" max="365" value={d.defaultLeadDays} onChange={e => save({ defaultLeadDays: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label className="field"><span>At-risk float threshold (workdays)</span><input type="number" min="0" max="60" value={d.riskFloat} onChange={e => save({ riskFloat: Math.max(0, Number(e.target.value) || 0) })} /></label>
        </div>
        <h3 className="small strong">Contract review periods (working days)</h3>
        <div className="inline-fields">
          {ROLES.map(r => <label key={r} className="field"><span>{r}</span><input type="number" min="1" max="60" value={d.reviewDays[r]} onChange={e => save({ reviewDays: { ...d.reviewDays, [r]: Math.max(1, Number(e.target.value) || 1) } })} /></label>)}
        </div>
      </div>

      <div className="panel">
        <h2>Appearance</h2>
        <div className="seg-control" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
          <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>

      <div className="panel">
        <h2>Your data</h2>
        <p>Projects live in this browser (IndexedDB). {sync.user ? <>Signed in as <b>{sync.user.email}</b>: firm roles, review periods, links, snapshots and logs under {(RAW_SYNC_LIMIT / 1e6).toFixed(1)} MB per project sync to your account.</> : 'Sign in from the account menu (top right) to sync across devices. It is optional.'}</p>
        <div className="row gap wrap">
          <button type="button" className="btn ghost" onClick={async () => download(`ball-in-court-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAll())}>Export all my data (JSON)</button>
          <button type="button" className="btn danger-ghost" onClick={async () => {
            const list = getProjects()
            if (!list.length) { toast('Nothing to delete'); return }
            if (!(await ask('Delete all local projects?', `Removes ${list.length} project${list.length > 1 ? 's' : ''} from this browser${sync.user ? ' and from your cloud account' : ''}. You can undo for a few seconds.`, 'Delete everything'))) return
            const undos = await Promise.all(list.map(p => deleteProject(p.id)))
            toast(`Deleted ${list.length} projects`, { undo: () => { for (const u of undos) void u() } })
          }}>Delete all projects</button>
        </div>
      </div>

      <div className="panel">
        <h2>Keyboard shortcuts</h2>
        <dl className="shortcuts">
          <div><dt><kbd>1</kbd>&ndash;<kbd>7</kbd></dt><dd>Switch project sections</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>Search the log</dd></div>
          <div><dt><kbd>S</kbd></dt><dd>Save a weekly snapshot</dd></div>
          <div><dt><kbd>P</kbd></dt><dd>Printable OAC report</dd></div>
          <div><dt><kbd>&#8984;</kbd>/<kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo the last delete</dd></div>
        </dl>
      </div>
    </section>
  )
}
