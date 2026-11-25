import { download, expect, newProject, soon, test } from '../fixtures.ts'

// Regression: issue #11
for (const [timezoneId, now, want] of [
  ['America/New_York', '2026-11-07T01:00:00Z', '2026-11-06'], // 8 pm on 6 Nov
  ['Australia/Sydney', '2026-11-06T20:00:00Z', '2026-11-07'], // 7 am on 7 Nov
] as const) test.describe(timezoneId, () => {
  test.use({ timezoneId })
  test('today is the date where the user is', async ({ page, context }) => {
    await context.clock.setFixedTime(new Date(now))
    await newProject(page)
    await soon(page.getByLabel('As of')).toHaveValue(want)
    await page.goto('/settings')
    const [name] = await download(page, page.getByRole('button', { name: 'Export all my data (JSON)' }))
    expect(name).toBe(`ball-in-court-export-${want}.json`)
  })
})
