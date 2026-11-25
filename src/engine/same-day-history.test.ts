import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attachHistory, autoMap, parseCsv, parseTable } from './parse.ts'
import type { Item } from './types.ts'

const item: Item = { key: 'rfi:7', kind: 'rfi', number: '7', title: 'A', open: true, status: 'Open', created: 20000, revision: 0, costImpact: false, scheduleImpact: false }
const add = (items: Item[], ...rows: string[]) => {
  const t = parseCsv('Number,Type,Changed on,Ball in court\n' + rows.map(r => `7,RFI,${r}\n`).join(''))
  return attachHistory(items, parseTable(t, autoMap(t.rows[0], 'history', t.rows), 'history').history).items
}
const holders = (items: Item[]) => items[0].history!.map(e => e.bic).join()
const order = (...rows: string[]) => holders(add([item], ...rows))

test('events on one day follow their times', () => {
  for (const [a, b] of [['2026-10-06 09:00', '2026-10-06 15:00'], ['10/6/2026 9:00 AM', '10/6/2026 3:00 PM'], ['10/6/2026 12:30 AM', '10/6/2026 12:30 PM'], ['10/6/2026 11:59 a.m.', '10/6/2026 12:00 p.m.'], ['2026-10-06T09:00:00Z', '2026-10-06T15:00:00.5Z'], ['06-Oct-2026 09:00:01', '06-Oct-2026 09:00:02'], ['46301.375', '46301.625']]) {
    assert.equal(order(`${a},Ray`, `${b},Owner`), 'Ray,Owner', a)
    assert.equal(order(`${b},Owner`, `${a},Ray`), 'Ray,Owner', b)
  }
  assert.equal(order('2026-10-06 15:00,C', '2026-10-06 09:00,A', '2026-10-06 12:00,B'), 'A,B,C')
})

test('a newest-first file without times is read in reverse', () => {
  assert.equal(order('2026-10-08,D', '2026-10-06,C', '2026-10-06,B', '2026-10-01,A'), 'A,B,C,D')
  assert.equal(order('2026-10-01,A', '2026-10-06,B', '2026-10-06,C', '2026-10-08,D'), 'A,B,C,D')
  assert.equal(order('2026-10-06,B', '2026-10-06,C'), 'B,C', 'no evidence: file order')
})

test('the direction can come from other items', () => {
  const t = parseCsv('Number,Type,Changed on,Ball in court\n7,RFI,2026-10-06,Owner\n7,RFI,2026-10-06,Ray\n8,RFI,2026-10-05,Ray\n')
  const h = parseTable(t, autoMap(t.rows[0], 'history', t.rows), 'history').history
  assert.equal(holders(attachHistory([item], h).items), 'Ray,Owner')
})

test('files grouped by item are judged within items', () => {
  const t = parseCsv('Number,Type,Changed on,Ball in court\n9,RFI,2026-10-20,A\n9,RFI,2026-10-21,B\n8,RFI,2026-10-10,A\n8,RFI,2026-10-11,B\n7,RFI,2026-10-01,A\n7,RFI,2026-10-06,B\n7,RFI,2026-10-06,C\n')
  const h = parseTable(t, autoMap(t.rows[0], 'history', t.rows), 'history').history
  assert.equal(holders(attachHistory([item], h).items), 'A,B,C')
})

test('importing again with times repairs and does not repeat', () => {
  const stored = [{ ...item, history: [{ at: 20732, bic: 'Owner' }, { at: 20732, bic: 'Ray' }] }]
  const rows = ['2026-10-06 15:00,Owner', '2026-10-06 09:00,Ray']
  const once = add(stored, ...rows)
  assert.equal(holders(once), 'Ray,Owner')
  assert.equal(holders(add(once, ...rows)), 'Ray,Owner')
})

test('impossible times are ignored, and untimed events keep their place', () => {
  assert.equal(order('2026-10-06 25:00,B', '2026-10-06 09:00,A'), 'B,A')
  assert.equal(order('2026-10-06 15:00,C', '2026-10-06,X', '2026-10-06 09:00,A'), 'A,X,C')
})
