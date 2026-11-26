import { cells, expect, H, logOf, logRow, openTab, panel, soon, table, test } from '../fixtures.ts'

// Regression: issue #4
test('a closed item with no close date stays closed and is not timed', async ({ page }) => {
  await logOf(page, H + '1,A,Closed,,Ray Architects,2026-10-01,2026-12-15,,\n2,B,Closed,,Ray Architects,2026-10-01,2026-11-04,,\n3,C,Closed,,Ray Architects,2026-10-01,2026-10-15,2026-10-08,2026-10-09\n')
  await expect(logRow(page, 'RFI 3')).toContainText('Closed Oct 9')
  await soon(logRow(page, 'RFI 1')).toContainText('Closed —')
  await soon(logRow(page, 'RFI 2')).toContainText('Closed —')
  expect((await cells(logRow(page, 'RFI 1')))[4]).toBe('—')
  await openTab(page, 'Overview')
  await soon(page.locator('.kpi').filter({ hasText: 'Median age' })).toContainText('0 closed this week')
  await openTab(page, 'Parties')
  // Only RFI 3 is a measured review: 1 Oct to 8 Oct, 5 workdays.
  await soon.poll(async () => (await table(panel(page, 'Reviewer responsiveness').locator('table'))).map(r => r.slice(0, 3))).toEqual([['Ray Architects Architect', '1', '5']])
})
