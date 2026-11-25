import { test } from 'node:test'
import assert from 'node:assert/strict'
import { todayDay, toIso } from './calendar.ts'

test('today is the local calendar date', () => {
  const before = process.env.TZ
  try {
    for (const [tz, now, want] of [['America/New_York', '2026-11-07T01:00:00Z', '2026-11-06'], ['Asia/Tokyo', '2026-11-06T20:00:00Z', '2026-11-07'], ['Pacific/Kiritimati', '2026-12-31T11:00:00Z', '2027-01-01'], ['UTC', '2026-11-06T23:59:59Z', '2026-11-06'], ['America/New_York', '2026-03-08T07:30:00Z', '2026-03-08']]) {
      process.env.TZ = tz
      assert.equal(toIso(todayDay(new Date(now))), want, tz)
    }
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before }
})
