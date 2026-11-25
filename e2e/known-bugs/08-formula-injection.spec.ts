import { download, expect, H, logOf, readCsv, test } from '../fixtures.ts'

// Regression: issue #8
test('exported CSV cells cannot start a formula', async ({ page }) => {
  await logOf(page, H + '1,"=HYPERLINK(""http://x.example"",""Open"")",Open,Ray Architects,Ray Architects,2026-10-01,,,\n')
  const [, buf] = await download(page, page.getByRole('button', { name: 'Download CSV' }))
  expect(readCsv(buf)[1][2]).toBe(`'=HYPERLINK("http://x.example","Open")`)
})
