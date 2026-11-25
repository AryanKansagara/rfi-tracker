import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { dateCellsToIso } from './parse.ts'

const lib = ((XLSX as unknown as { default?: typeof XLSX }).default ?? XLSX)
const roundTrip = (v: string | number, z: string | undefined, date1904 = false, bookType: 'xlsx' | 'biff8' = 'xlsx') => {
  const ws = lib.utils.aoa_to_sheet([['h'], [v]])
  if (z) ws.A2.z = z
  const buf = lib.write({ SheetNames: ['s'], Sheets: { s: ws }, Workbook: { WBProps: { date1904 } } } as never, { type: 'buffer', bookType })
  const wb = lib.read(buf, { cellDates: false, cellNF: true })
  dateCellsToIso(wb, lib.SSF)
  return lib.utils.sheet_to_csv(wb.Sheets.s).trim().split('\n').at(-1)
}

test('date cells read as their date in any display format', () => {
  for (const z of ['dd/mm/yyyy', 'm/d/yy', 'mmm-yy', 'd mmmm', 'yyyy', 'dd/mm/yyyy hh:mm', '[$-809]dd mmmm yyyy;@']) assert.equal(roundTrip(46298, z), '2026-10-03', z)
  assert.equal(roundTrip(46298.75, 'dd/mm/yyyy hh:mm'), '2026-10-03')
  assert.equal(roundTrip(46298, 'dd/mm/yyyy', false, 'biff8'), '2026-10-03')
})

test('1904 workbooks count from 1904', () => {
  assert.equal(roundTrip(46298 - 1462, 'dd/mm/yyyy', true), '2026-10-03')
})

test('text, numbers and times keep their text', () => {
  assert.equal(roundTrip('03/10/2026', undefined), '03/10/2026')
  assert.equal(roundTrip(46298, undefined), '46298')
  assert.equal(roundTrip(46298, '#,##0.00'), '"46,298.00"')
  assert.equal(roundTrip(10, '0 "days"'), '10 days')
  assert.equal(roundTrip(0.5, 'h:mm'), '12:00')
})
