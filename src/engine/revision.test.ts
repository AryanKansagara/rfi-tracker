import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectFormat, FORMATS, parseCsv, parseTable } from './parse.ts'

const read = (...revs: string[]) => {
  const t = parseCsv('Spec Section,#,Rev.,Title,Status,Ball In Court,Submittal Manager,Issue Date\n' + revs.map((r, i) => `08 44 13,S-${i},"${r}",Wall,Open,Ray,Pat,2026-07-20\n`).join(''))
  const f = detectFormat(t.rows[0])
  assert.equal(f, 'procore-submittal')
  const r = parseTable(t, autoMap(t.rows[0], FORMATS[f].kind, t.rows), f)
  return { revs: r.items.map(i => i.revision), warned: r.issues.filter(i => i.message.startsWith('Revision')).map(i => i.line) }
}

test('labels around the number', () => {
  const cases: [string, number][] = [['Rev 1', 1], ['R2', 2], ['Rev. 03', 3], ['rev.4', 4], ['Revision 5', 5], ['REV-6', 6], ['#7', 7], ['Rev No. 8', 8], ['Rev 0', 0], ['Rev 1 (resubmitted)', 1], ['Rev 2.0', 2]]
  assert.deepEqual(read(...cases.map(c => c[0])), { revs: cases.map(c => c[1]), warned: [] })
})

test('plain numbers and blanks are unchanged', () => {
  assert.deepEqual(read('0', '1', '02', '1.0', '2 of 3', '-1', '', 'N/A', '-'), { revs: [0, 1, 2, 1, 2, 0, 0, 0, 0], warned: [] })
})

test('a label without a number warns', () => {
  assert.deepEqual(read('A', 'Rev B', 'Original', 'R1A', 'Review 2'), { revs: [0, 0, 0, 0, 0], warned: [2, 3, 4, 5, 6] })
})

test('the later revision of a number wins without a duplicate warning', () => {
  const t = parseCsv('Number,Title,Spec section,Rev,Status,Ball in court,Submittal manager,Created on\n1,A,08,Rev 0,Revise,Ray,P,2026-07-20\n1,A,08,Rev 1,Open,Ray,P,2026-09-21\n')
  const r = parseTable(t, autoMap(t.rows[0], 'items', t.rows), 'procore-submittal')
  assert.deepEqual(r.items.map(i => i.revision), [1])
  assert.ok(!r.issues.some(i => i.message.includes('appears twice')))
})
