import { choose, expect, newProject, panel, RFIS, soon, SUBMITTALS, test } from '../fixtures.ts'

// Regression: issue #17
test('two files committed together are both kept', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'a.csv', body: RFIS }, { name: 'b.csv', body: SUBMITTALS })
  await expect(page.locator('.panel.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.panel.pending .btn.primary').forEach(b => b.click()))
  await expect(page.locator('.panel.pending')).toHaveCount(0)
  await page.reload()
  await soon(panel(page, 'Imported data')).toContainText('2 RFIs · 1 submittals')
})

test('two files committed together from a sample land in one new project', async ({ page }) => {
  await page.goto('/app?sample=mob&tab=data')
  await expect(page.getByText('This is a synthetic sample')).toBeVisible()
  await choose(page, { name: 'a.csv', body: RFIS }, { name: 'b.csv', body: SUBMITTALS })
  await expect(page.locator('.panel.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.panel.pending .btn.primary').forEach(b => b.click()))
  await soon(panel(page, 'Imported data')).toContainText('2 RFIs · 1 submittals')
})

test('a log and its history committed together are both kept', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'a.csv', body: RFIS }, { name: 'h.csv', body: 'Number,Type,Changed on,Ball in court\n1,RFI,2026-10-02,Ray Architects\n' })
  await expect(page.locator('.panel.pending')).toHaveCount(2)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.panel.pending .btn.primary').forEach(b => b.click()))
  await soon(panel(page, 'Imported data')).toContainText('2 RFIs · 0 submittals · 1 with history')
})
