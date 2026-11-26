import { logOf, logRow, soon, test } from '../fixtures.ts'

// Issue #12
test.fail('a Closed column of dates closes items', async ({ page }) => {
  await logOf(page, 'Number,Title,Created,Ball in court,Closed\n1,A,2026-10-01,Ray Architects,2026-10-20\n')
  await soon(logRow(page, 'RFI 1')).toContainText('Closed Oct 20')
})
