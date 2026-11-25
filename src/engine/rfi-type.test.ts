import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, detectFormat, parseCsv, parseTable, type Format } from './parse.ts'

const read = (head: string, want: Format, ...types: string[]) => {
  const t = parseCsv(`${head}\n` + types.map((x, i) => `${i + 1},A,${x},Open,Ray,2026-10-01\n`).join(''))
  assert.equal(detectFormat(t.rows[0]), want)
  const r = parseTable(t, autoMap(t.rows[0], 'items', t.rows), want)
  return { kinds: r.items.map(i => i.kind), warned: r.issues.filter(i => i.message.startsWith('Type')).map(i => i.line) }
}
const ACC = 'ID,Title,Type,Status,Ball in court,Created on'

test('an RFI log keeps its rows as RFIs', () => {
  const types = ['Substitution request', 'Subcontractor question', 'Sample question', 'Submittal question', 'RFI', '', 'Design']
  assert.deepEqual(read(ACC, 'acc-rfi', ...types), { kinds: types.map(() => 'rfi'), warned: [] })
  assert.deepEqual(read('Number,Subject,Type,Status,Ball in Court,Date Initiated,RFI Manager', 'procore-rfi', 'Substitution request').kinds, ['rfi'])
})

test('a row that says Submittal is one', () => {
  assert.deepEqual(read(ACC, 'acc-rfi', 'Submittal', 'submittals', 'Action submittal', 'RFI').kinds, ['submittal', 'submittal', 'submittal', 'rfi'])
})

test('submittal types in an RFI log are named', () => {
  assert.deepEqual(read(ACC, 'acc-rfi', 'Shop drawings', 'Product data sheet', 'Mock-up', 'SUB'), { kinds: ['rfi', 'rfi', 'rfi', 'rfi'], warned: [2, 3, 4, 5] })
})

test('other formats still use the type column', () => {
  assert.deepEqual(read('No,Name,Type,Status,With,Opened', 'generic-items', 'Shop drawing', 'Sub', 'RFI').kinds, ['submittal', 'submittal', 'rfi'])
})
