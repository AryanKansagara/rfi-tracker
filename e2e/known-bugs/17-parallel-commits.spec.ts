import { choose, expect, newProject, panel, RFIS, soon, SUBMITTALS, test } from '../fixtures.ts'

// Issue #17
test.fail('two files committed together are both kept', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'a.csv', body: RFIS }, { name: 'b.csv', body: SUBMITTALS })
  await expect(page.locator('.panel.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.panel.pending .btn.primary').forEach(b => b.click()))
  await expect(page.locator('.panel.pending')).toHaveCount(0)
  await page.reload()
  await soon(panel(page, 'Imported data')).toContainText('2 RFIs · 1 submittals')
})
