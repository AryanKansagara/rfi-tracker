import { expect, newProject, soon, test } from '../fixtures.ts'

// Regression: issue #14
test('unreadable holidays are reported, not invented', async ({ page }) => {
  await newProject(page)
  const box = page.getByLabel(/^Holidays/)
  await box.fill('12/25/2026\n2026-02-31\n20261225')
  await box.blur()
  await soon(page.locator('.toast')).toContainText('2026-02-31')
  await expect(page.locator('.toast')).toContainText('20261225')
  await soon(box).toHaveValue('2026-12-25')
})

test('a list with nothing new still drops what it cannot read', async ({ page }) => {
  await newProject(page)
  const box = page.getByLabel(/^Holidays/)
  const before = await box.inputValue()
  await box.fill(before + '\nChristmas')
  await box.blur()
  await soon(page.locator('.toast')).toContainText('Christmas')
  await soon(box).toHaveValue(before)
})
