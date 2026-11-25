import { choose, expect, importFile, newProject, openTab, pending, soon, test } from '../fixtures.ts'

// Regression: issue #13
test('two weeks of slack absorb a delay of three days', async ({ page }) => {
  // Answer due Mon 14 Dec, activity starts Wed 9 Dec: 3 workdays late. Slack of 2 wks (10 days) covers it.
  await newProject(page)
  await importFile(page, 'msp.csv', 'ID,Name,Duration,Start,Finish,Total Slack,Critical\nT9,Frames,5 days,12/9/26,12/18/26,2 wks,No\n')
  await importFile(page, 'log.csv', 'ID,Title,Status,Ball in court,Assigned to,Created on,Due date,Activity ID\n1,A,Open,Ray Architects,Ray Architects,2026-11-02,2026-12-14,T9\n')
  await openTab(page, 'Overview')
  const li = page.locator('.risk-list li').filter({ hasText: 'RFI 1' }).first()
  await expect(li).toContainText('-3d')
  await soon(li).toHaveClass('at-risk')
})

test('slack in an unknown unit is named', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'msp.csv', body: 'ID,Name,Duration,Start,Finish,Total Slack,Critical\nT9,Frames,5 days,12/9/26,12/18/26,2 fortnights,No\n' })
  await soon(pending(page, 'msp.csv').getByRole('log')).toContainText('"2 fortnights" is not a duration')
})
