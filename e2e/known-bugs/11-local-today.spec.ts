import { newProject, soon, test } from '../fixtures.ts'

// Issue #11
test.use({ timezoneId: 'America/New_York' })
test.fail('today is the date where the user is', async ({ page, context }) => {
  await context.clock.setFixedTime(new Date('2026-11-07T01:00:00Z')) // 8 pm on 6 Nov in New York
  await newProject(page)
  await soon(page.getByLabel('As of')).toHaveValue('2026-11-06')
})
