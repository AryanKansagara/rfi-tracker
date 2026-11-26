import { newProject, soon, test } from '../fixtures.ts'

// Issue #14
test.fail('unreadable holidays are reported, not invented', async ({ page }) => {
  await newProject(page)
  const box = page.getByLabel(/^Holidays/)
  await box.fill('12/25/2026\n2026-02-31')
  await box.blur()
  await soon(page.locator('.toast')).toContainText('2026-02-31')
  await soon(box).toHaveValue('2026-12-25')
})
