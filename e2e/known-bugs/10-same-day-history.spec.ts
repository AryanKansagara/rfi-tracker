import { expect, H, held, importFile, logRow, newProject, openTab, soon, test } from '../fixtures.ts'

// Regression: issue #10
test('same-day hand-offs follow their times in a newest-first file', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', H + '7,A,Open,Cedar Owner LLC,Ray Architects,2026-10-01,,,\n')
  await importFile(page, 'history.csv', 'Number,Type,Changed on,Ball in court\n7,RFI,2026-10-06 15:00,Cedar Owner LLC\n7,RFI,2026-10-06 09:00,Ray Architects\n')
  await openTab(page, 'Log')
  await expect(logRow(page, 'RFI 7')).toBeVisible()
  await soon.poll(() => held(page, 'RFI 7')).toBe('Cedar Owner LLC')
})

test('times in a workbook count too', async ({ page }) => {
  const XLSX = await import('xlsx')
  // 46301 is 6 Oct 2026.
  const ws = XLSX.utils.aoa_to_sheet([['Number', 'Type', 'Changed on', 'Ball in court'], [7, 'RFI', 46301.625, 'Cedar Owner LLC'], [7, 'RFI', 46301.375, 'Ray Architects']])
  ws.C2.z = ws.C3.z = 'dd/mm/yyyy hh:mm'
  await newProject(page)
  await importFile(page, 'log.csv', H + '7,A,Open,Cedar Owner LLC,Ray Architects,2026-10-01,,,\n')
  await importFile(page, 'history.xlsx', XLSX.write({ SheetNames: ['H'], Sheets: { H: ws } }, { type: 'buffer', bookType: 'xlsx' }))
  await openTab(page, 'Log')
  await expect(logRow(page, 'RFI 7')).toBeVisible()
  await soon.poll(() => held(page, 'RFI 7')).toBe('Cedar Owner LLC')
})
