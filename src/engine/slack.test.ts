import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectFormat, FORMATS, parseCsv, parseTable } from './parse.ts'

const read = (head: string, values: string[]) => {
  const t = parseCsv(`${head}\n` + values.map((v, i) => `T${i},Frames,12/13/26,12/18/26,"${v}"\n`).join(''))
  const f = detectFormat(t.rows[0])
  const r = parseTable(t, autoMap(t.rows[0], FORMATS[f].kind, t.rows), f)
  return { float: r.activities.map(a => a.totalFloat), issues: r.issues.filter(i => i.message.includes('float')).map(i => i.line) }
}
const MSP = 'Unique ID,Name,Start,Finish,Total Slack'

test('MS Project units', () => {
  const cases: [string, number][] = [['2 wks', 10], ['1 wk', 5], ['16 hrs', 2], ['1 mon', 20], ['2 mons', 40], ['1 mo', 20], ['960 mins', 2], ['3 days', 3], ['1 day?', 1], ['2 wks?', 10], ['2w', 10], ['0.5 wks', 3], ['1,5 wks', 8], ['-2 wks', -10], ['-3 days', -3], ['(3 days)', -3], ['0 hrs', 0], ['-1 hr', 0]]
  assert.deepEqual(read(MSP, cases.map(c => c[0])), { float: cases.map(c => c[1]), issues: [] })
})

test('plain numbers and days are unchanged', () => {
  assert.deepEqual(read(MSP, ['0', '12', '-5', '1,200', '1,200 days', '1 200 days', '2.6', '(5)', '3 d', '']), { float: [0, 12, -5, 1200, 1200, 1200, 3, -5, 3, undefined], issues: [] })
})

test('unknown units warn and leave the float blank', () => {
  assert.deepEqual(read(MSP, ['2 fortnights', '3 edays', '2 wks 3 days', 'soon', 'N/A']), { float: [undefined, undefined, undefined, undefined, undefined], issues: [2, 3, 4, 5] })
})

test('a P6 hour column stays in hours unless the cell says otherwise', () => {
  assert.deepEqual(read('task_code,task_name,target_start_date,target_end_date,total_float_hr_cnt', ['80', '-16', '80h', '10d']), { float: [10, -2, 10, 10], issues: [] })
})
