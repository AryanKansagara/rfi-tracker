import { expect, H, held, importFile, logRow, newProject, openTab, soon, test } from '../fixtures.ts'

// Issue #10
test.fail('same-day hand-offs follow their times in a newest-first file', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', H + '7,A,Open,Cedar Owner LLC,Ray Architects,2026-10-01,,,\n')
  await importFile(page, 'history.csv', 'Number,Type,Changed on,Ball in court\n7,RFI,2026-10-06 15:00,Cedar Owner LLC\n7,RFI,2026-10-06 09:00,Ray Architects\n')
  await openTab(page, 'Log')
  await expect(logRow(page, 'RFI 7')).toBeVisible()
  await soon.poll(() => held(page, 'RFI 7')).toBe('Cedar Owner LLC')
})
