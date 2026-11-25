import { expect, H, logOf, soon, test } from '../fixtures.ts'

// Regression: issue #2
test('refused and unfinished statuses stay open', async ({ page }) => {
  const open = ['Not approved', 'Not accepted', 'Not yet answered', 'To be reviewed', 'Partially approved']
  const closed = ['No exceptions taken', 'Approved as noted', 'Closed - not approved', 'Void', 'Answered']
  await logOf(page, H + [...open, ...closed].map((s, i) => `${i + 1},${s} item,${s},Ray Architects,Ray Architects,2026-10-01,,2026-10-05,\n`).join(''))
  const rows = page.locator('table.log tbody tr')
  await expect(rows).toHaveCount(10)
  await page.getByLabel('Status', { exact: true }).selectOption('open')
  await soon(rows).toHaveCount(5)
  for (const s of open) await soon(rows.filter({ hasText: `${s} item` })).toHaveCount(1)
})
