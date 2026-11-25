import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, toCsv } from './parse.ts'
import { delayCsv, registerCsv, type Evidence } from './actions.ts'
import type { ItemState } from './analyze.ts'

test('text that starts like a formula is kept as text', () => {
  for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1', '\r=1', '=HYPERLINK("http://x.example","Open")', '-']) {
    assert.deepEqual(parseCsv(toCsv([['a', s]])).rows, [['a', `'${s}`]], JSON.stringify(s))
  }
})

test('numbers and other text are unchanged', () => {
  assert.equal(toCsv([[-5, -0.256, 0, 12, 'a=b', '2-3', 'a,b', 'say "x"', "'=1", '']]), '-5,-0.26,0,12,a=b,2-3,"a,b","say ""x""",\'=1,\n')
})

test('a lone CR is quoted', () => {
  assert.equal(toCsv([['a\rb', 'c']]), '"a\rb",c\n')
  assert.deepEqual(parseCsv(toCsv([['a\rb', 'c']])).rows, [['a\rb', 'c']])
})

test('register and evidence CSVs', () => {
  const s = { item: { kind: 'submittal', number: '1', title: '=1+1', status: '@x', revision: 0 }, age: 0, inCourt: 0, sched: { needBy: 20000, forecast: 20000, float: -9 } } as unknown as ItemState
  const reg = parseCsv(registerCsv([s], [])).rows[1]
  assert.deepEqual([reg[3], reg[5], reg[15]], ["'=1+1", "'@x", '-9'])
  const ev = parseCsv(delayCsv([{ label: 'RFI 1', title: '+x', firm: '=y', role: 'Architect', sent: 20000, due: 20000, allowed: 5, late: 3 } as Evidence])).rows[1]
  assert.deepEqual([ev[1], ev[2], ev[8]], ["'+x", "'=y", '3'])
})
