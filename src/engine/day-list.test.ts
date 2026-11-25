import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDayList } from './parse.ts'
import { toIso } from './calendar.ts'

const read = (s: string) => { const r = parseDayList(s); return [r.days.map(toIso), r.bad] }
const XMAS = [['2026-12-25'], []]

test('one date in each format the importer reads', () => {
  for (const s of ['2026-12-25', '2026/12/25', '12/25/2026', '25/12/2026', '12/25/26', 'Dec 25, 2026', 'December 25 2026', '25-Dec-2026', '25 Dec 26', 'Fri 12/25/26', 'Friday, December 25, 2026', '2026-12-25T00:00:00Z', '2026-12-25 00:00', '46381', ' 2026-12-25 ', '2026-12-25,']) assert.deepEqual(read(s), XMAS, s)
})

test('lists by line, comma, semicolon or space, sorted and without repeats', () => {
  const two = [['2026-12-25', '2027-01-01'], []]
  for (const s of ['2027-01-01\n2026-12-25', '2026-12-25\r\n2027-01-01', '2026-12-25, 2027-01-01', '2026-12-25;2027-01-01', '2026-12-25 2027-01-01 2026-12-25', 'Dec 25, 2026, Jan 1, 2027', '25/12/2026 01/01/2027', '2026-12-25,2027-01-01']) assert.deepEqual(read(s), two, s)
  assert.deepEqual(read(' \n,\n'), [[], []])
})

test('anything else is named and kept out', () => {
  for (const s of ['2026-02-31', '20261225', '2026-13-01', '12-25-2026', '2026-12-251', '1/2/3/2026', '12/2026', 'Christmas', '99999', '0026-12-25']) assert.deepEqual(read(s), [[], [s]], s)
  assert.deepEqual(read('2026-12-25 Christmas Day\n2026-02-31, 2027-01-01'), [['2026-12-25', '2027-01-01'], ['Christmas Day', '2026-02-31']])
})

test('slash dates that fit both orders are flagged', () => {
  assert.equal(parseDayList('05/06/2026').order, 'either')
  assert.equal(parseDayList('25/12/2026\n05/06/2026').order, 'dmy')
})
