import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoMap, decodeText, findHeaderRow, parseCsv, parseTable, readXer } from './parse.ts'

const read = (text: string) => { const t = findHeaderRow(parseCsv(text)); return parseTable(t, autoMap(t.rows[0], 'items'), 'acc-rfi') }
const H = 'ID,Title,Status,Ball in court,Created on,Due date\n'

test('an unclosed quote names the line it opened on', () => {
  assert.throws(() => parseCsv('a,b\n1,"x\ny"\n2,"z\n3,w\n'), /line 4/)
  assert.throws(() => parseCsv('a,b\n1,"'), /line 2/)
  assert.deepEqual(parseCsv('a,b\n1,"x"').rows, [['a', 'b'], ['1', 'x']])
  assert.deepEqual(parseCsv('a,b\n1,3" pipe\n').rows[1], ['1', '3" pipe'])
})

test('a short last row with no line break is skipped with its line', () => {
  const p = read('Title block\n\n' + H + '1,A,Open,Ray,2026-10-01,\n2,B,Open,Ray,2026-10-0')
  assert.deepEqual([p.items.length, p.skipped, p.issues[0].line], [1, 1, 5])
  assert.match(p.issues[0].message, /ends in the middle/)
})

test('complete files still import: no final line break, or trailing cells left out', () => {
  assert.equal(read(H + '1,A,Open,Ray,2026-10-01,\n2,B,Open,Ray,2026-10-02,').items.length, 2)
  assert.equal(read(H + '1,A,Open,Ray,2026-10-01\n2,B,Open,Ray,2026-10-02').items.length, 2)
  assert.equal(read(H + '1,A,Open,Ray,2026-10-01,\n2,B,Open,Ray,2026-10-02\n').items.length, 2)
  assert.equal(read(H + '1,A,Open,Ray,2026-10-01').items.length, 1)
})

test('an XER needs its end marker', () => {
  const xer = decodeText(readFileSync(new URL('./fixtures/p6-mob-excerpt.xer', import.meta.url)))
  assert.equal(readXer(xer).rows.length, 6)
  assert.equal(readXer(xer.trimEnd()).rows.length, 6)
  for (const at of ['LOE-GC', 'TASKPRED']) assert.throws(() => readXer(xer.slice(0, xer.indexOf(at))), /%E/)
})
