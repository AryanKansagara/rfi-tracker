import { expect, logOf, logRow, soon, test, cells } from '../fixtures.ts'

// Regression: issue #5
test('Excel date cells keep their date whatever the display format', async ({ page }) => {
  const XLSX = await import('xlsx')
  // 46298 is 3 Oct 2026, 46310 is 15 Oct 2026.
  const ws = XLSX.utils.aoa_to_sheet([['ID', 'Title', 'Status', 'Ball in court', 'Created on', 'Due date'], [1, 'A', 'Open', 'Ray Architects', 46298, 46310]])
  ws.E2.z = 'dd/mm/yyyy'; ws.F2.z = 'd mmmm'
  await logOf(page, XLSX.write({ SheetNames: ['Log'], Sheets: { Log: ws } }, { type: 'buffer', bookType: 'xlsx' }), 'log.xlsx')
  await expect(logRow(page, 'RFI 1')).toBeVisible()
  // Sat 3 Oct to Fri 6 Nov: five working weeks. 15 Oct to 6 Nov: 16 workdays.
  await soon.poll(() => cells(logRow(page, 'RFI 1')).then(c => c.slice(4, 7))).toEqual(['25', 'Oct 15', '16'])
})
