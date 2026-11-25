import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectFormat, FORMATS, parseCsv, parseTable } from './parse.ts'
import { toIso } from './calendar.ts'

const read = (head: string, ...rows: string[]) => {
  const t = parseCsv([head, ...rows].join('\n') + '\n')
  const f = detectFormat(t.rows[0])
  const r = parseTable(t, autoMap(t.rows[0], FORMATS[f].kind, t.rows), f)
  return { issues: r.issues.map(i => i.message), got: r.items.map(i => [i.open, i.status, i.closed === undefined ? '' : toIso(i.closed)]) }
}
const H = 'Number,Title,Created,Ball in court,Closed'

test('a Closed column of dates is the close date', () => {
  assert.deepEqual(read(H, '1,A,2026-10-01,Ray,2026-10-20', '2,B,2026-10-02,Ray,', '3,C,2026-10-02,Ray,20-Oct-2026'), { issues: [], got: [[false, 'Closed', '2026-10-20'], [true, 'Open', ''], [false, 'Closed', '2026-10-20']] })
  assert.deepEqual(read(H, '1,A,01/10/2026,Ray,20/10/2026').got, [[false, 'Closed', '2026-10-20']])
  assert.deepEqual(read('Number,Title,Created,Ball in court,Closed?', '1,A,2026-10-01,Ray,2026-10-20').got, [[false, 'Closed', '2026-10-20']])
})

test('beside a Status column it still sets the date', () => {
  assert.deepEqual(read('Number,Title,Created,Status,Ball in court,Closed', '1,A,2026-10-01,Closed,,2026-10-20', '2,B,2026-10-01,Open,Ray,').got, [[false, 'Closed', '2026-10-20'], [true, 'Open', '']])
})

test('a Closed? column of words is the status', () => {
  assert.deepEqual(read('Number,Title,Created,Ball in court,Closed?', '1,A,2026-10-01,Ray,Yes', '2,B,2026-10-01,Ray,No').got, [[false, 'Closed', ''], [true, 'Open', '']])
  assert.deepEqual(read(H, '1,A,2026-10-01,Ray,').got, [[true, 'Open', '']])
})

test('words mixed with dates keep their meaning', () => {
  assert.deepEqual(read(H, '1,A,2026-10-01,Ray,2026-10-20', '2,B,2026-10-01,Ray,No', '3,C,2026-10-01,Ray,Yes', '4,D,2026-10-01,Ray,Void').got.map(x => [x[0], x[1]]), [[false, 'Closed'], [true, 'Open'], [false, 'Closed'], [false, 'Void']])
})

test('a date that cannot be read is named', () => {
  const r = read(H, '1,A,2026-10-01,Ray,2026-10-20', '2,B,2026-10-01,Ray,2026-13-45', '3,C,2026-10-01,Ray,31 Feb 2026')
  assert.ok(r.issues.some(m => m.includes('31 Feb 2026')))
  assert.ok(r.issues.some(m => m.includes('2026-13-45')))
})
