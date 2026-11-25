import { choose, H, newProject, pending, soon, test } from '../fixtures.ts'

// Regression: issue #9
test('dates that fit both day-first and month-first carry a warning', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'log.csv', body: H + '1,A,Open,Ray,Ray,05/10/2026,09/10/2026,,\n' })
  await soon(pending(page, 'log.csv').getByRole('log')).toContainText('month/day')
})
