import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectFormat, FORMATS, parseCsv, parseTable } from './parse.ts'

const read = (csv: string) => {
  const t = parseCsv(csv)
  const f = detectFormat(t.rows[0])
  return parseTable(t, autoMap(t.rows[0], FORMATS[f].kind, t.rows), f)
}
const log = (...dates: string[]) => read('ID,Title,Status,Ball in court,Created on\n' + dates.map((d, i) => `${i + 1},A,Open,Ray,${d}\n`).join(''))
const about = (r: ReturnType<typeof read>) => r.issues.filter(i => i.level === 'warning' && i.message.includes('month/day')).map(i => [i.line, /fits both/.test(i.message) ? 'either' : 'mixed'])

test('slash dates that all fit both orders warn once', () => {
  assert.deepEqual(about(log('05/10/2026', '09/10/2026')), [[1, 'either']])
  assert.deepEqual(about(log('2026-10-05', '5/6/26')), [[1, 'either']])
  assert.deepEqual(about(read('Number,Type,Changed on,Ball in court\n1,RFI,05/10/2026 09:00,Ray\n')), [[1, 'either']])
  assert.deepEqual(about(read('Activity ID,Activity name,Start\nA1,Steel,05/10/2026\n')), [[1, 'either']])
})

test('dates that fit only one order each way warn', () => {
  assert.deepEqual(about(log('05/10/2026', '13/10/2026', '10/19/2026')), [[1, 'mixed']])
})

test('dates with one reading do not warn', () => {
  for (const d of [['05/10/2026', '10/13/2026'], ['05/10/2026', '13/10/2026'], ['2026-10-05'], ['05/05/2026'], ['5-Oct-2026']]) assert.deepEqual(about(log(...d)), [], d.join())
})
