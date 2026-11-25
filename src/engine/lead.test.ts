import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLead } from './parse.ts'

const all = (cases: [string, number, string?][]) => { for (const [raw, want, head] of cases) assert.equal(parseLead(raw, head), want, `${raw} under "${head ?? ''}"`) }

test('units', () => all([
  ['10 weeks', 70], ['8 wks', 56], ['8 wks.', 56], ['6w', 42], ['6wks', 42], ['12 weeks ARO', 84], ['2.5 weeks', 18], ['1,5 weeks', 11],
  ['45', 45], ['30d', 30], ['30 days', 30], ['30 calendar days', 30], ['1,000 days', 1000],
  ['10 working days', 14], ['10 workdays', 14], ['10 work days', 14], ['15 business days', 21], ['10 wd', 14], ['3 working days', 5],
  ['3 months', 90], ['3 mos', 90], ['1 month', 30], ['0', 0], ['45 (estimate)', 45], ['~6 weeks', 42], ['6-week', 42], ['3-month', 90], ['10+ weeks', 70], ['8 weeks (2-3 for samples)', 56], ['8 week(s)', 56],
]))

test('ranges use the longer end', () => all([['6-8 weeks', 56], ['6 – 8 wks', 56], ['6 to 8 weeks', 56], ['6 wks to 8 wks', 56], ['30-45', 45], ['8-6 weeks', 56], ['30 days to 6 weeks', 42], ['6 weeks - 50 days', 50]]))

test('a bare number takes the column unit; a stated unit wins', () => all([
  ['10', 70, 'Lead time (weeks)'], ['10', 70, 'Lead time weeks'], ['10', 14, 'Lead Time (Working Days)'], ['2', 60, 'Lead time (months)'], ['10', 10, 'Lead time (days)'], ['10', 10, 'Lead Time'],
  ['10 days', 10, 'Lead time (weeks)'], ['6-8', 56, 'Lead time (weeks)'],
]))

test('anything else is unknown', () => { for (const s of ['', 'ask sub', '-5', '10 fortnights', '5 hours', 'two weeks', 'TBD', '12 ARO']) assert.ok(Number.isNaN(parseLead(s)), s) })
