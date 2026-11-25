import { test } from 'node:test'
import assert from 'node:assert/strict'
import { burnDown, DEFAULT_REVIEW_DAYS, itemStates, scorecards, summarize } from './analyze.ts'
import { fromIso as d } from './calendar.ts'
import { autoMap, detectFormat, parseCsv, parseTable } from './parse.ts'
import type { Config } from './types.ts'

const cfg = (asOf: string): Config => ({ asOf: d(asOf), gcName: 'Acme GC', firms: { 'Ray Architects': 'Architect' }, reviewDays: { ...DEFAULT_REVIEW_DAYS }, holidays: [], reviewCycles: 2, defaultLeadDays: 28, riskFloat: 10, links: {} })
const read = (rows: string) => {
  const t = parseCsv('ID,Title,Status,Ball in court,Assigned to,Created on,Due date,Responded on,Closed on,Activity ID\n' + rows)
  const f = detectFormat(t.rows[0])
  return parseTable(t, autoMap(t.rows[0], 'items'), f)
}

test('a close date is not made up from the due or created date', () => {
  const p = read('1,A,Closed,,Ray Architects,2026-10-01,2026-12-15,,\n2,B,Closed,,Ray Architects,2026-10-01,2026-11-04,,\n3,C,Closed,,Ray Architects,2026-10-01,,2026-10-08,\n')
  assert.deepEqual(p.items.map(i => i.closed), [undefined, undefined, d('2026-10-08')])
  assert.deepEqual(p.issues.map(i => i.line), [2, 3])
  for (const asOf of ['2026-11-06', '2026-12-20']) {
    const st = itemStates({ items: p.items, activities: [], specs: [] }, cfg(asOf))
    assert.ok(st.every(s => !s.item.open && !s.overdue && !s.holder))
    const s = summarize(st, d(asOf))
    assert.equal(s.open, 0)
    assert.equal(s.closedThisWeek, 0)
    // Only RFI 3 is a measured review: 1 to 8 Oct, 5 workdays.
    assert.deepEqual(scorecards(st).map(c => [c.firm, c.reviews, c.median]), [['Ray Architects', 1, 5]])
  }
})

test('an undated closed item is never open in the burn-down and has no schedule forecast', () => {
  const p = read('1,A,Closed,,Ray Architects,2026-10-01,2026-12-15,,,A1\n')
  const b = burnDown(p.items, d('2026-11-06'))
  assert.deepEqual(b.history.map(h => [h.open, h.closed]), b.history.map(() => [0, 0]))
  const act = { id: 'A1', name: 'Steel', start: d('2026-10-05'), critical: true }
  assert.equal(itemStates({ items: p.items, activities: [act], specs: [] }, cfg('2026-11-06'))[0].sched, undefined)
})

test('holds that ended before an undated close are still measured', () => {
  const p = read('1,A,Closed,,Ray Architects,2026-10-01,,,\n')
  const item = { ...p.items[0], history: [{ at: d('2026-10-01'), bic: 'Ray Architects' }, { at: d('2026-10-08'), bic: 'Acme GC' }] }
  assert.deepEqual(itemStates({ items: [item], activities: [], specs: [] }, cfg('2026-11-06'))[0].segs.map(s => [s.firm, s.days]), [['Ray Architects', 5]])
})
