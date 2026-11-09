import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Calendar, constructionHolidays, fromIso, toIso, weekday } from './calendar.ts'
import { attachHistory, autoMap, detectFormat, findHeaderRow, isClosedStatus, parseCsv, parseDate, parseLead, parseTable } from './parse.ts'
import { burnDown, compare, guessRole, itemStates, median, scorecards, segments, snapshot, summarize, timeByRole, DEFAULT_REVIEW_DAYS } from './analyze.ts'
import { delayCsv, delayLog, oacReport, registerCsv, reminders } from './actions.ts'
import { generateSample, sampleConfig, SAMPLES } from './sample.ts'
import type { Config, Dataset, Item } from './types.ts'

const d = fromIso
const cfg = (p: Partial<Config> = {}): Config => ({
  asOf: d('2026-11-06'), gcName: 'Acme GC', firms: { 'Acme GC': 'GC', 'Ray Architects': 'Architect', 'Bolt Structural': 'Engineer', 'Owner Co': 'Owner', 'Glass Sub': 'Subcontractor' },
  reviewDays: { ...DEFAULT_REVIEW_DAYS }, holidays: [], reviewCycles: 2, defaultLeadDays: 28, riskFloat: 10, links: {}, ...p,
})
const item = (p: Partial<Item>): Item => ({ key: `rfi:${p.number ?? '1'}`, kind: 'rfi', number: '1', title: 'Q', open: true, status: 'Open', created: d('2026-10-01'), revision: 0, costImpact: false, scheduleImpact: false, ...p })
const ds = (items: Item[], extra: Partial<Dataset> = {}): Dataset => ({ items, activities: [], specs: [], ...extra })

// ---------- Calendar ----------

test('business days skip weekends: Fri to next Fri is 5', () => {
  const cal = new Calendar()
  assert.equal(weekday(d('2026-11-06')), 5)
  assert.equal(cal.between(d('2026-10-30'), d('2026-11-06')), 5)
  assert.equal(cal.between(d('2026-11-06'), d('2026-11-09')), 1) // Fri -> Mon
  assert.equal(cal.between(d('2026-11-06'), d('2026-11-06')), 0)
  assert.equal(cal.signed(d('2026-11-09'), d('2026-11-06')), -1)
})

test('holidays are excluded from aging and from due-date math', () => {
  const hol = constructionHolidays(2026)
  assert.ok(hol.includes(d('2026-11-26')) && hol.includes(d('2026-11-27')), 'Thanksgiving and the Friday after')
  const cal = new Calendar(hol)
  assert.equal(cal.between(d('2026-11-20'), d('2026-11-30')), 4) // Mon-Wed + Mon; Thu/Fri off
  assert.equal(toIso(cal.add(d('2026-11-24'), 2)), '2026-11-30')
  assert.equal(toIso(cal.add(d('2026-11-30'), -2)), '2026-11-24')
})

test('fixed-date holidays on a weekend are observed on the nearest weekday', () => {
  const h = constructionHolidays(2027).map(toIso)
  assert.ok(h.includes('2027-12-24'), 'Christmas 2027 is a Saturday, observed Friday')
  assert.ok(h.includes('2027-07-05'), 'July 4 2027 is a Sunday, observed Monday')
  assert.ok(h.includes('2027-05-31') && h.includes('2027-09-06'), 'Memorial Day and Labor Day')
})

// ---------- Parsing ----------

test('parseDate reads the formats ACC, Procore, P6, MS Project and Excel produce', () => {
  assert.equal(toIso(parseDate('2026-11-03')), '2026-11-03')
  assert.equal(toIso(parseDate('2026-11-03T14:22:00.000Z')), '2026-11-03')
  assert.equal(toIso(parseDate('11/3/2026')), '2026-11-03')
  assert.equal(toIso(parseDate('Nov 3, 2026')), '2026-11-03')
  assert.equal(toIso(parseDate('03-Nov-26')), '2026-11-03')
  assert.equal(toIso(parseDate('14-Dec-26 A')), '2026-12-14')
  assert.equal(toIso(parseDate('Mon 12/14/26')), '2026-12-14')
  assert.equal(toIso(parseDate('46329')), '2026-11-03')
  assert.ok(Number.isNaN(parseDate('2026-02-30')))
  assert.ok(Number.isNaN(parseDate('TBD')))
})

test('lead times in weeks, days and months become calendar days', () => {
  assert.equal(parseLead('10 weeks'), 70)
  assert.equal(parseLead('8 wks'), 56)
  assert.equal(parseLead('45'), 45)
  assert.equal(parseLead('3 months'), 90)
  assert.ok(Number.isNaN(parseLead('ask sub')))
})

test('status words: approved-as-noted closes, revise-and-resubmit stays open', () => {
  assert.equal(isClosedStatus('Closed'), true)
  assert.equal(isClosedStatus('Approved as noted'), true)
  assert.equal(isClosedStatus('No exceptions taken'), true)
  assert.equal(isClosedStatus('Revise and resubmit'), false)
  assert.equal(isClosedStatus('Rejected'), false)
  assert.equal(isClosedStatus('Open'), false)
  assert.equal(isClosedStatus('In review'), false)
})

test('format detection from header signatures', () => {
  assert.equal(detectFormat(['#', 'Created By', 'Initiated At', 'RFI Manager', 'Assigned', 'Due Date', 'Subject', 'Ball In Court', 'Closed?']), 'procore-rfi')
  assert.equal(detectFormat(['Spec Section', '#', 'Rev.', 'Title', 'Status', 'Submittal Manager', 'Ball In Court', 'Final Due Date']), 'procore-submittal')
  assert.equal(detectFormat(['ID', 'Title', 'Status', 'Ball in court', 'Due date', 'Created on', 'Assigned to']), 'acc-rfi')
  assert.equal(detectFormat(['Number', 'Title', 'Spec section', 'Status', 'Ball in court', 'Required on job date', 'Lead time']), 'acc-submittal')
  assert.equal(detectFormat(['Number', 'Title', 'Status', 'Ball in court', 'Assigned to', 'Created on', 'Spec section']), 'acc-rfi', 'a spec column alone does not make it a submittal log')
  assert.equal(detectFormat(['task_code', 'task_name', 'target_start_date', 'target_end_date', 'total_float_hr_cnt']), 'p6')
  assert.equal(detectFormat(['ID', 'Name', 'Duration', 'Start', 'Finish', 'Total Slack', 'Critical']), 'msp')
  assert.equal(detectFormat(['RFI number', 'Changed on', 'Ball in court', 'Status']), 'history')
  assert.equal(detectFormat(['Section', 'Title']), 'specs')
})

test('a title block above the header is skipped and line numbers stay true', () => {
  const t = findHeaderRow(parseCsv('Riverside MOB RFI log\nExported 2026-11-06\n\nID,Title,Status,Ball in court,Created on,Due date\n1,Embed conflict,Open,Ray Architects,2026-10-01,2026-10-15\n'))
  assert.equal(t.rows[0][0], 'ID')
  assert.equal(t.lines[1], 5)
})

test('validation reports bad rows by line number and skips only fatal ones', () => {
  const csv = parseCsv('ID,Title,Status,Ball in court,Created on,Due date\n1,A,Open,Ray Architects,2026-10-01,soon\n,B,Open,,2026-10-02,\n3,C,Closed,,not a date,\n4,D,Open,,2026-10-03,\n')
  const map = autoMap(csv.rows[0], 'items')
  const p = parseTable(csv, map, 'acc-rfi')
  assert.equal(p.items.length, 2)
  assert.equal(p.skipped, 2)
  assert.deepEqual(p.issues.filter(i => i.level === 'error').map(i => i.line), [3, 4])
  assert.ok(p.issues.some(i => i.line === 2 && /Due date "soon"/.test(i.message)))
  assert.ok(p.issues.some(i => i.line === 5 && /no ball in court/.test(i.message)))
})

test('missing required columns are a single header error', () => {
  const csv = parseCsv('Subject,Status\nA,Open\n')
  const p = parseTable(csv, autoMap(csv.rows[0], 'items'), 'generic-items')
  assert.equal(p.items.length, 0)
  assert.ok(p.issues.every(i => i.line === 1 && i.level === 'error'))
})

test('Procore submittal revisions collapse to one item with the revision count', () => {
  const csv = parseCsv('Spec Section,#,Rev.,Title,Status,Ball In Court,Submittal Manager,Issue Date\n08 44 13,08 44 13-1,0,Curtain wall,Revise and Resubmit,Glass Sub,Pat,2026-07-20\n08 44 13,08 44 13-1,1,Curtain wall,Revise and Resubmit,Glass Sub,Pat,2026-08-20\n08 44 13,08 44 13-1,2,Curtain wall,Open,Ray Architects,Pat,2026-09-20\n')
  const p = parseTable(csv, autoMap(csv.rows[0], 'items'), 'procore-submittal')
  assert.equal(p.items.length, 1)
  assert.equal(p.items[0].revision, 2)
  assert.equal(p.items[0].kind, 'submittal')
  assert.equal(toIso(p.items[0].created), '2026-07-20')
  assert.equal(p.items[0].bic, 'Ray Architects')
})

test('P6 float in hours converts to days and zero float marks critical', () => {
  const csv = parseCsv('task_code,task_name,target_start_date,target_end_date,total_float_hr_cnt\nA1310,Curtain wall install,14-Dec-26,05-Mar-27,0\nA1600,Drywall,18-Jan-27,30-Apr-27,80\n')
  const p = parseTable(csv, autoMap(csv.rows[0], 'schedule'), 'p6')
  assert.deepEqual(p.activities.map(a => [a.id, a.totalFloat, a.critical]), [['A1310', 0, true], ['A1600', 10, false]])
})

test('history attaches by number and de-duplicates repeated events', () => {
  const items = [item({ number: '7', key: 'rfi:7' })]
  const csv = parseCsv('RFI number,Changed on,Ball in court\n7,2026-10-01,Acme GC\n7,2026-10-02,Ray Architects\n7,2026-10-02,Ray Architects\n9,2026-10-02,Ray Architects\n')
  const p = parseTable(csv, autoMap(csv.rows[0], 'history'), 'history')
  const r = attachHistory(items, p.history)
  assert.equal(r.items[0].history!.length, 2)
  assert.deepEqual(r.unmatched, ['9'])
})

// ---------- Ball in court ----------

test('time by party comes from status history, including bounces to the engineer', () => {
  const c = cfg()
  const it = item({ history: [
    { at: d('2026-10-01'), bic: 'Acme GC' }, { at: d('2026-10-02'), bic: 'Ray Architects' },
    { at: d('2026-10-09'), bic: 'Bolt Structural' }, { at: d('2026-10-16'), bic: 'Ray Architects' }, { at: d('2026-10-21'), bic: 'Acme GC' },
  ] })
  const segs = segments(it, c)
  assert.deepEqual(segs.map(s => [s.role, s.days]), [['GC', 1], ['Architect', 5], ['Engineer', 5], ['Architect', 3], ['GC', 12]])
  const by = Object.fromEntries(timeByRole(itemStates(ds([it]), c)).map(p => [p.role, p.days]))
  assert.equal(by.Architect, 8)
  assert.equal(by.Engineer, 5)
})

test('without history, dates stand in: GC until sent, reviewer until responded, GC until closed', () => {
  const it = item({ open: false, status: 'Closed', reviewer: 'Ray Architects', sent: d('2026-10-02'), responded: d('2026-10-16'), closed: d('2026-10-20') })
  const segs = segments(it, cfg())
  assert.deepEqual(segs.map(s => [s.firm, s.days]), [['Acme GC', 1], ['Ray Architects', 10], ['Acme GC', 2]])
  assert.equal(segs[1].late, 0)
})

test('overdue uses the exported due date when present, the party period otherwise', () => {
  const c = cfg()
  const withDue = itemStates(ds([item({ reviewer: 'Ray Architects', bic: 'Ray Architects', sent: d('2026-10-01'), due: d('2026-10-08') })]), c)[0]
  assert.equal(withDue.overdue, true)
  assert.equal(withDue.daysLate, 21) // Oct 8 -> Nov 6
  const byPeriod = itemStates(ds([item({ reviewer: 'Owner Co', bic: 'Owner Co', created: d('2026-10-30'), sent: d('2026-10-30') })]), c)[0]
  assert.equal(byPeriod.holder!.allowed, 5)
  assert.equal(byPeriod.overdue, false)
  const longer = itemStates(ds([item({ reviewer: 'Owner Co', bic: 'Owner Co', created: d('2026-10-30'), sent: d('2026-10-30') })]), cfg({ reviewDays: { ...DEFAULT_REVIEW_DAYS, Owner: 3 } }))[0]
  assert.equal(longer.daysLate, 2, 'editable period: 3 days for the owner')
})

test('unknown firms get a role from their name; the firm table wins', () => {
  assert.equal(guessRole('Kessler Ray Architects'), 'Architect')
  assert.equal(guessRole('Northline MEP Engineers'), 'Engineer')
  assert.equal(guessRole('Lincoln Unified School District'), 'Owner')
  assert.equal(guessRole('Apex Curtainwall'), 'Subcontractor')
  assert.equal(guessRole('Halvorsen Builders'), 'GC')
  assert.equal(segments(item({ bic: 'Studio Nine', reviewer: 'Studio Nine' }), cfg({ firms: { 'Studio Nine': 'Owner' } }))[0].role, 'Owner')
})

test('scorecards: median turnaround of returned reviews and % late including open ones past due', () => {
  const c = cfg()
  const mk = (n: string, sent: string, back?: string) => item({ number: n, key: `rfi:${n}`, reviewer: 'Ray Architects', bic: back ? undefined : 'Ray Architects', open: !back, status: back ? 'Closed' : 'Open', created: d(sent), sent: d(sent), responded: back ? d(back) : undefined, closed: back ? d(back) : undefined })
  const st = itemStates(ds([mk('1', '2026-09-01', '2026-09-08'), mk('2', '2026-09-01', '2026-09-22'), mk('3', '2026-09-01', '2026-09-15'), mk('4', '2026-10-01')]), c)
  const ray = scorecards(st).find(s => s.firm === 'Ray Architects')!
  assert.equal(ray.median, 10)
  assert.equal(ray.returned, 3)
  assert.equal(ray.holding, 1)
  assert.equal(ray.pctLate, 0.5) // #2 late, #4 open and past due; #1 and #3 on time
  assert.equal(median([1, 2, 3, 4]), 2.5)
})

// ---------- Schedule ----------

const act = { id: 'A1310', name: 'Curtain wall install (08 44 13)', start: d('2026-12-14'), critical: true, totalFloat: 0 }

test('submit-by = required on site minus lead time minus review cycles, in workdays', () => {
  const c = cfg()
  const s = item({ kind: 'submittal', key: 'submittal:CW', number: 'CW', spec: '08 44 13', bic: 'Glass Sub', leadDays: 28, created: d('2026-11-02') })
  const st = itemStates(ds([s], { activities: [act] }), c)[0]
  assert.equal(st.linked?.id, 'A1310', 'linked by spec section in the activity name or code')
  // Dec 14 - 28 days = Nov 16; minus 2 cycles x 10 workdays = Oct 19
  assert.equal(toIso(st.sched!.submitBy!), '2026-10-19')
  assert.equal(st.sched!.stage, 'not submitted')
  assert.equal(st.sched!.float, -14)
  assert.equal(st.sched!.threat, 'delays')
})

test('an in-review submittal forecasts on-site from its due date plus lead time', () => {
  const c = cfg()
  const s = item({ kind: 'submittal', key: 'submittal:CW', number: 'CW', reviewer: 'Ray Architects', bic: 'Ray Architects', sent: d('2026-10-30'), created: d('2026-10-28'), leadDays: 21, revision: 1, requiredOnSite: d('2026-12-14') })
  const st = itemStates(ds([s], { activities: [act] }), cfg({ links: { 'submittal:CW': 'A1310' } }))[0]
  assert.equal(toIso(st.holder!.dueAt), '2026-11-13')
  // Rev 1 of 2 cycles: this is the last review. Back Nov 13 + 21 days = Dec 4, 6 workdays before Dec 14.
  assert.equal(toIso(st.sched!.forecast), '2026-12-04')
  assert.equal(st.sched!.float, 6)
  assert.equal(st.sched!.threat, 'at-risk', 'critical activity and float under the 10-day threshold')
  void c
})

test('a manual link of "" unlinks an item even when the spec matches', () => {
  const s = item({ kind: 'submittal', key: 'submittal:CW', number: 'CW', spec: '08 44 13' })
  assert.equal(itemStates(ds([s], { activities: [act] }), cfg({ links: { 'submittal:CW': '' } }))[0].linked, undefined)
})

// ---------- Burn-down, snapshots ----------

test('burn-down projects open items to zero from the net weekly close rate', () => {
  const asOf = d('2026-11-06')
  const items: Item[] = []
  for (let i = 0; i < 20; i++) items.push(item({ number: String(i), key: `rfi:${i}`, created: asOf - 70, open: i >= 16, closed: i < 16 ? asOf - 55 + Math.floor(i / 2) * 7 : undefined }))
  const b = burnDown(items, asOf, 8)
  assert.equal(b.history.at(-1)!.open, 4)
  assert.equal(b.closedPerWeek, 2)
  assert.equal(b.openedPerWeek, 0)
  assert.equal(b.forecast[1].projected, 0)
  assert.equal(toIso(b.zeroWeek!), toIso(asOf + 14))
})

test('snapshot compare finds new, closed, moved and stuck items', () => {
  const c1 = cfg({ asOf: d('2026-10-30') }), c2 = cfg()
  const items = [
    item({ number: '1', key: 'rfi:1', reviewer: 'Ray Architects', bic: 'Ray Architects', sent: d('2026-10-01') }),
    item({ number: '2', key: 'rfi:2', reviewer: 'Ray Architects', sent: d('2026-10-20'), responded: d('2026-11-03'), bic: 'Acme GC' }),
    item({ number: '3', key: 'rfi:3', reviewer: 'Ray Architects', sent: d('2026-10-20'), open: false, status: 'Closed', closed: d('2026-11-04'), responded: d('2026-11-04') }),
    item({ number: '4', key: 'rfi:4', created: d('2026-11-03'), reviewer: 'Bolt Structural', bic: 'Bolt Structural' }),
  ]
  const a = snapshot(itemStates(ds(items), c1), c1.asOf!, 'a', 'Oct 30')
  const b = snapshot(itemStates(ds(items), c2), c2.asOf!, 'b', 'Nov 6')
  const kinds = Object.fromEntries(compare(a, b).filter(x => x.kind !== 'float-lost').map(x => [x.item.n, x.kind]))
  assert.deepEqual(kinds, { 1: 'stuck', 2: 'moved', 3: 'closed', 4: 'new' })
})

// ---------- Actions ----------

test('OAC report, reminders and delay log agree on who is late', () => {
  const c = cfg()
  const items = [
    item({ number: '1', key: 'rfi:1', reviewer: 'Ray Architects', bic: 'Ray Architects', sent: d('2026-10-01'), scheduleImpact: true }),
    item({ number: '2', key: 'rfi:2', reviewer: 'Ray Architects', bic: 'Ray Architects', sent: d('2026-10-15') }),
    item({ number: '3', key: 'rfi:3', reviewer: 'Owner Co', bic: 'Owner Co', sent: d('2026-11-04'), created: d('2026-11-04') }),
    item({ number: '4', key: 'rfi:4', reviewer: 'Bolt Structural', open: false, status: 'Closed', sent: d('2026-09-01'), responded: d('2026-09-29'), closed: d('2026-09-30') }),
  ]
  const st = itemStates(ds(items), c)
  const rep = oacReport(st, c)
  assert.deepEqual(rep.overdueByParty.map(g => [g.firm, g.items.map(s => s.item.number)]), [['Ray Architects', ['1', '2']]])
  assert.deepEqual(rep.decisions.map(s => s.item.number).sort(), ['1', '3'])
  assert.deepEqual(rep.newItems.map(s => s.item.number), ['3'])
  const mail = reminders(st, c, 'Riverside MOB', 'Sam Lee')
  assert.equal(mail.length, 1)
  assert.match(mail[0].subject, /2 overdue RFIs with Ray Architects/)
  assert.match(mail[0].body, /RFI 1: Q\n  With you since Oct 1, 2026; due Oct 15, 2026 \(10 working days\); now 16 working days late\./)
  assert.ok(mail[0].body.trim().endsWith('Sam Lee'))
  const log = delayLog(st)
  assert.deepEqual(log.map(e => [e.label, e.late, e.returned === undefined]), [['RFI 1', 16, true], ['RFI 4', 10, false], ['RFI 2', 6, true]])
  assert.match(delayCsv(log), /RFI 4,Q,Bolt Structural,Engineer,2026-09-01,10,2026-09-15,2026-09-29,10,No,No,/)
})

test('submittal register CSV carries submit-by, float and risk per row', () => {
  const s = item({ kind: 'submittal', key: 'submittal:CW', number: '08 44 13-001', spec: '08 44 13', bic: 'Glass Sub', leadDays: 28, created: d('2026-11-02') })
  const csv = registerCsv(itemStates(ds([s], { activities: [act] }), cfg()), [{ section: '08 44 13', title: 'Glazed aluminum curtain walls' }])
  const [head, row] = csv.trim().split('\n')
  assert.match(head, /^Spec section,Spec title,Number/)
  assert.match(row, /^08 44 13,Glazed aluminum curtain walls,08 44 13-001,Q,0,Open,Glass Sub,Subcontractor,A1310 Curtain wall install \(08 44 13\),2026-12-14,Yes,2026-12-14,28,2026-10-19,/)
  assert.match(row, /-14,Delays completion$/)
})

// ---------- Samples ----------

test('samples are labelled synthetic and tell the intended story', () => {
  assert.ok(SAMPLES.every(s => s.name && s.blurb))
  const mob = generateSample('mob'), c = sampleConfig('mob')
  const st = itemStates(mob, c)
  const cw = st.find(s => s.item.spec === '08 44 13' && s.item.title.startsWith('Curtain wall shop'))!
  assert.equal(cw.sched?.threat, 'delays')
  assert.ok(cw.item.revision >= 2, 'curtain wall is in a resubmittal loop')
  const arch = scorecards(st).find(s => s.role === 'Architect')!
  const eng = scorecards(st).filter(s => s.role === 'Engineer')
  assert.ok(eng.every(e => e.median < arch.median), 'the architect is the slow reviewer')
  assert.ok(summarize(st, c.asOf!).overdue >= 3)
  const school = itemStates(generateSample('school'), sampleConfig('school'))
  assert.ok(school.every(s => !s.item.history), 'school sample exercises the dates-only path')
  assert.equal(scorecards(school)[0].role, 'Owner', 'the school district is the bottleneck')
})
