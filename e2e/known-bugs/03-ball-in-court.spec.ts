import { cells, expect, H, held, importFile, logOf, logRow, newProject, openTab, soon, test } from '../fixtures.ts'

// Issue #3
test.fail('the ball-in-court cell decides who holds an open item', async ({ page }) => {
  await logOf(page, H + '1,A,Open,Cedar Owner LLC,Ray Architects,2026-10-01,2026-10-16,,\n2,B,Open,Ray Architects,Ray Architects,2026-10-01,2026-10-30,2026-10-12,\n')
  // RFI 2: with Ray since 1 Oct (26 workdays), due 30 Oct, a week (5) late.
  await soon.poll(() => cells(logRow(page, 'RFI 2')).then(c => c.slice(2, 7))).toEqual(['Ray Architects', '26', '26', 'Oct 30', '5'])
  await soon.poll(() => held(page, 'RFI 1')).toBe('Cedar Owner LLC')
})

test.fail('a status change with the same holder keeps the exported due date', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', H + '3,C,Open,Ray Architects,Ray Architects,2026-10-01,2026-11-20,,\n')
  await importFile(page, 'history.csv', 'Number,Type,Changed on,Ball in court,Status\n3,RFI,2026-10-02,Ray Architects,Open\n3,RFI,2026-10-06,Ray Architects,In review\n')
  await openTab(page, 'Log')
  await expect(logRow(page, 'RFI 3')).toBeVisible()
  await soon.poll(() => cells(logRow(page, 'RFI 3')).then(c => c.slice(2, 7))).toEqual(['Ray Architects', '25', '26', 'Nov 20', ''])
})

test.fail('a submittal back with the reviewer is in review', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'sub.csv', 'Number,Title,Spec section,Status,Ball in court,Reviewer,Created on,Submitted on,Due date,Returned on,Required on job date,Lead time\nS1,Doors,08 11 13,Open,Ray Architects,Ray Architects,2026-10-01,2026-10-01,2026-11-20,2026-10-12,2027-02-01,28\n')
  await openTab(page, 'Schedule')
  await soon(page.locator('tbody tr').filter({ hasText: 'Doors' }).first()).toContainText('in review')
})
