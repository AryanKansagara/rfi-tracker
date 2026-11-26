import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_REVIEW_DAYS, itemStates, segments } from './analyze.ts'
import { fromIso as d, toIso } from './calendar.ts'
import type { Config, Item } from './types.ts'

const cfg: Config = {
  asOf: d('2026-11-06'), gcName: 'Acme GC', firms: { 'Acme GC': 'GC', 'Ray Architects': 'Architect', 'Bolt Structural': 'Engineer', 'Owner Co': 'Owner', 'Glass Sub': 'Subcontractor' },
  reviewDays: { ...DEFAULT_REVIEW_DAYS }, holidays: [], reviewCycles: 2, defaultLeadDays: 28, riskFloat: 10, links: {},
}
const item = (p: Partial<Item>): Item => ({ key: 'rfi:1', kind: 'rfi', number: '1', title: 'Q', open: true, status: 'Open', created: d('2026-10-01'), revision: 0, costImpact: false, scheduleImpact: false, ...p })
const segs = (p: Partial<Item>) => segments(item(p), cfg).map(s => [s.firm, toIso(s.from), toIso(s.dueAt), s.late])

test('an open item is held by its ball-in-court firm, not the assigned reviewer', () => {
  assert.deepEqual(segs({ bic: 'Owner Co', reviewer: 'Ray Architects', due: d('2026-10-30') }), [['Owner Co', '2026-10-01', '2026-10-30', 5]])
})

test('after a response the ball goes to whoever the log says has it', () => {
  // Ray: 1 Oct + 10 workdays = 15 Oct, answered 12 Oct. Bolt holds it since, due 30 Oct, a week late.
  assert.deepEqual(segs({ bic: 'Bolt Structural', reviewer: 'Ray Architects', responded: d('2026-10-12'), due: d('2026-10-30') }), [['Ray Architects', '2026-10-01', '2026-10-15', 0], ['Bolt Structural', '2026-10-12', '2026-10-30', 5]])
  assert.deepEqual(segs({ bic: 'Ray Architects', reviewer: 'Ray Architects', responded: d('2026-10-12'), due: d('2026-10-30') }), [['Ray Architects', '2026-10-01', '2026-10-30', 5]])
  assert.deepEqual(segs({ bic: 'Glass Sub', reviewer: 'Ray Architects', responded: d('2026-10-12') }).map(s => s[0]), ['Ray Architects', 'Glass Sub'])
  assert.deepEqual(segs({ reviewer: 'Ray Architects', responded: d('2026-10-12') }).map(s => s[0]), ['Ray Architects', 'Acme GC'], 'no ball-in-court cell: back with the GC, as before')
})

test('a closed item is charged to its reviewer whatever the ball-in-court cell says', () => {
  assert.deepEqual(segs({ open: false, status: 'Closed', bic: 'Owner Co', reviewer: 'Ray Architects', responded: d('2026-10-12'), closed: d('2026-10-14') }).map(s => s[0]), ['Ray Architects', 'Acme GC'])
})

test('a status event with the same holder keeps the exported due date', () => {
  const history = [{ at: d('2026-10-02'), bic: 'Ray Architects' }, { at: d('2026-10-06'), bic: 'Ray Architects', status: 'In review' }, { at: d('2026-10-07'), bic: '' }]
  assert.deepEqual(segs({ due: d('2026-11-20'), history }), [['Acme GC', '2026-10-01', '2026-10-06', 0], ['Ray Architects', '2026-10-02', '2026-11-20', 0]])
})

test('a submittal back with a reviewer is in review, not approved', () => {
  const s = item({ key: 'submittal:S', kind: 'submittal', reviewer: 'Ray Architects', sent: d('2026-10-01'), responded: d('2026-10-12'), due: d('2026-11-20'), requiredOnSite: d('2027-02-01') })
  const stage = (bic?: string) => itemStates({ items: [{ ...s, bic }], activities: [], specs: [] }, cfg)[0].sched!.stage
  assert.equal(stage('Ray Architects'), 'in review')
  assert.equal(stage('Glass Sub'), 'approved')
  assert.equal(stage(), 'approved')
})
