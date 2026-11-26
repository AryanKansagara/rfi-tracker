import { choose, commit, expect, newProject, openTab, pending, soon, test } from '../fixtures.ts'

// Regression: issue #6
test('lead times keep their unit', async ({ page }) => {
  const head = (unit: string) => `Number,Title,Spec section,Status,Ball in court,Created on,Required on job date,Lead time${unit}\n`
  await newProject(page)
  await choose(page,
    { name: 'weeks.csv', body: head(' (weeks)') + 'W1,Weeks,08,Draft,Apex Glass,2026-10-01,2027-02-01,10\n' },
    { name: 'mixed.csv', body: head('') + ['10 working days', '6-8 weeks', '"1,5 weeks"', '-5', '10 weeks', '45'].map((l, i) => `M${i},M,08,Draft,Apex Glass,2026-10-01,2027-02-01,${l}`).join('\n') + '\n' })
  await soon(pending(page, 'mixed.csv').getByRole('log')).toContainText('line 5Lead time "-5"')
  await commit(page, 'weeks.csv')
  await commit(page, 'mixed.csv')
  await openTab(page, 'Schedule')
  const lead = (n: string) => page.locator('tbody tr').filter({ has: page.getByRole('button', { name: n, exact: true }) }).locator('td').nth(3)
  await expect(lead('M4')).toHaveText('70')
  for (const [n, days] of [['W1', '70'], ['M0', '14'], ['M1', '56'], ['M2', '11'], ['M3', '28'], ['M5', '45']]) await soon(lead(n)).toHaveText(days)
})
