import { useEffect, useMemo, useState } from 'react'
import { FloatGauge, narrow, ROLE_VAR, Swimlane } from './charts.tsx'
import { itemStates, scorecards, summarize } from './engine/analyze.ts'
import { generateSample, sampleConfig } from './engine/sample.ts'
import { ROLES } from './engine/types.ts'
import { fmtN, fmtShort, Link } from './ui.tsx'

const ds = generateSample('mob')
const cfg = sampleConfig('mob')
const END = cfg.asOf!
const START = END - 49
const CW = ds.items.find(i => i.spec === '08 44 13' && i.kind === 'submittal')!.key

function useReplay() {
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const [day, setDay] = useState(reduce ? END : START)
  const [playing, setPlaying] = useState(!reduce)
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setDay(d => d >= END ? START : d + 1), day >= END ? 3200 : 150)
    return () => clearTimeout(t)
  }, [day, playing])
  return { day, playing, setPlaying, setDay }
}

export function Landing() {
  const { day, playing, setPlaying, setDay } = useReplay()
  const c = useMemo(() => ({ ...cfg, asOf: day }), [day])
  const states = useMemo(() => itemStates(ds, c), [c])
  const sum = summarize(states, day)
  const cw = states.find(s => s.item.key === CW)
  const arch = scorecards(states).find(s => s.role === 'Architect')

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow gold">RFI and submittal log intelligence</div>
            <h1>Every RFI is in somebody&rsquo;s court. <span className="hl">Know whose, and for how long.</span></h1>
            <p className="lede">Import your Autodesk Build or Procore logs. Ball in Court counts working days with each party, flags what is past the contract review period, back-calculates submit-by dates from your schedule, and writes the weekly OAC report for you.</p>
            <div className="hero-ctas">
              <Link href="/app?sample=mob" className="btn primary lg">Try the sample project</Link>
              <Link href="/app" className="btn outline-inv lg">Import your logs</Link>
            </div>
            <p className="hero-note">Runs in your browser. No account needed. Sample data is synthetic.</p>
          </div>

          <div className="live" aria-label="Live replay of a synthetic project">
            <div className="live-bar">
              <span className="live-tag"><i />Live engine</span>
              <span className="live-title">Riverside MOB <em>(synthetic)</em> &middot; as of {fmtShort(day)}</span>
              <button type="button" className="live-btn" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? 'Pause' : 'Play'}</button>
            </div>
            <Swimlane ds={ds} cfg={c} asOf={day} weeks={7} states={states} focus={CW} height={300} width={narrow() ? 460 : 620} />
            <input type="range" className="scrub" min={START} max={END} value={day} aria-label="Replay date" onChange={e => { setPlaying(false); setDay(Number(e.target.value)) }} />
            <div className="live-foot">
              <FloatGauge value={cw?.sched?.float ?? null} label="days of float left" sub="Curtain wall shop drawings, Rev 2" />
              <dl className="live-kpis">
                <div><dt>Open</dt><dd>{sum.open}</dd></div>
                <div className={sum.overdue ? 'bad' : ''}><dt>Past contract period</dt><dd>{sum.overdue}</dd></div>
                <div><dt>Architect median</dt><dd>{arch ? `${fmtN(arch.median, 0)}d` : '—'}<small> vs 10</small></dd></div>
                <div className={sum.delays ? 'bad' : ''}><dt>Threatening the critical path</dt><dd>{sum.threats}</dd></div>
              </dl>
            </div>
            <div className="legend">{ROLES.map(r => <span key={r}><i style={{ background: ROLE_VAR[r] }} />{r === 'Subcontractor' ? 'Subs' : r}</span>)}<span><i className="late-key" />Past due</span></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div className="eyebrow">What project teams say</div>
          <h2>The log is not the problem. Knowing who is sitting on it is.</h2>
        </div>
        <div className="quotes">
          {[
            ['r/civilengineering', 'Logging in on Monday to twenty RFI emails, with no idea which ones are actually urgent.'],
            ['r/ConstructionMNGT', 'After RFI chaos on a VA job, one PM built his own spreadsheet tracker just to see what was stuck where.'],
            ['r/Architects', 'How are you supposed to organise and track RFIs during construction without it becoming a second job?'],
            ['r/ConstructionManagers', 'Who owns an RFI, the GC or the sub? And reviews and submittals in ACC still need a lot of chasing.'],
          ].map(([src, q]) => <figure key={src} className="quote"><blockquote>&ldquo;{q}&rdquo;</blockquote><figcaption className="src">Paraphrased from {src}</figcaption></figure>)}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div className="eyebrow">What it does</div>
          <h2>From an exported log to the documents you need on Friday.</h2>
        </div>
        <div className="features">
          {[
            ['01', 'Ball-in-court accounting', 'Working days with the architect, engineers, owner, subs and GC, from status history or from the dates in the log. Holidays excluded.'],
            ['02', 'Contract review periods', 'Set 10 working days for the architect, 5 for the owner, or what your contract says. Everything past it is flagged, by party.'],
            ['03', 'Submit-by dates and float', 'Required on site minus lead time minus review cycles, from your P6 or MS Project dates. Items eating the critical path rise to the top.'],
            ['04', 'Reviewer scorecards', 'Median turnaround and percent late per firm, resubmittal loops, and a burn-down forecast for the open log.'],
            ['05', 'Weekly OAC report', 'New items, overdue by party, decisions needed and upcoming submit-by dates, ready to print. Reminder emails written per firm.'],
            ['06', 'Claims-ready evidence', 'Every review that ran past the contract period, with sent, due and returned dates. Weekly snapshots show what moved and what got stuck.'],
          ].map(([n, h, p]) => <article key={n} className="feature"><span className="ico">{n}</span><h3>{h}</h3><p>{p}</p></article>)}
        </div>
      </section>

      <section className="section">
        <div className="cta-band">
          <div className="cta-inner">
            <div>
              <div className="eyebrow gold">Five minutes</div>
              <h2>Export the RFI log, drop it in, walk into the OAC meeting with a list.</h2>
              <p>Autodesk Build, Procore or any CSV/XLSX. <Link href="/docs">Exact export steps</Link>.</p>
            </div>
            <div className="row gap wrap">
              <Link href="/app?sample=mob" className="btn primary lg">Open the sample</Link>
              <Link href="/docs" className="btn outline-inv lg">Read the docs</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
