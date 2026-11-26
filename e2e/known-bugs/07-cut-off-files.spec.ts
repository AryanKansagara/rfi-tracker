import { choose, expect, fixture, H, newProject, pending, soon, test } from '../fixtures.ts'

// Issue #7
test.fail('a CSV that ends inside quotes is refused', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'cut.csv', body: 'ID,Title,Created on,Location\n1,A,2026-10-01,"Level 4\n2,B,2026-10-01,Level 5\n3,C,2026-10-02,Level 6\n' })
  await soon(page.locator('.toast.error')).toContainText('line 2')
  await expect(page.locator('.panel.pending')).toHaveCount(0)
})

test.fail('a last row cut short is reported and skipped', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'cut.csv', body: H + '1,A,Open,Ray,Ray,2026-10-01,2026-10-15,,\n2,B,Open,Ray,Ray,2026-10-01' })
  await soon(pending(page, 'cut.csv')).toContainText('1 items ready from 2 rows, 1 skipped')
  await soon(pending(page, 'cut.csv').getByRole('log')).toContainText('line 3')
})

test.fail('an XER without its end marker is refused', async ({ page }) => {
  const xer = await fixture('p6-mob-excerpt.xer')
  await newProject(page)
  await choose(page, { name: 'cut.xer', body: xer.subarray(0, xer.indexOf('LOE-GC')) })
  await soon(page.locator('.toast.error')).toContainText('%E')
  await expect(page.locator('.panel.pending')).toHaveCount(0)
})
