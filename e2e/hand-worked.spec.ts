import { cells, download, expect, handProject, kpi, logRow, openTab, panel, readCsv, table, test } from './fixtures.ts'

// Every expected number is derived on paper in fixtures.ts.
test.beforeEach(async ({ page }) => { await handProject(page) })

test('overview counts', async ({ page }) => {
  await openTab(page, 'Overview')
  await expect(kpi(page, 'Open items')).toHaveText('2')
  await expect(kpi(page, 'Past contract period')).toHaveText('1')
  await expect(kpi(page, 'Median age, open')).toHaveText('15workdays')
  await expect(kpi(page, 'Critical path threats')).toHaveText('1')
  await expect(panel(page, 'Threatening the schedule').locator('li')).toHaveText([/SUB 08 44 13-001.*Curtain wall install \(08 44 13\).*-9d/])
  await expect(panel(page, 'Most overdue').locator('li')).toHaveText([/RFI 1.*Ray Architects.*15d late/])
})

test('log: workdays in court, age, due and late', async ({ page }) => {
  await openTab(page, 'Log')
  await page.getByLabel('Status', { exact: true }).selectOption('all')
  await expect.poll(async () => (await cells(logRow(page, 'RFI 1'))).slice(2, 8)).toEqual(['Ray Architects', '25', '26', 'Oct 16', '15', ''])
  await expect.poll(async () => (await cells(logRow(page, 'RFI 2'))).slice(2, 7)).toEqual(['Closed Sep 23', '', '15', '', ''])
  await expect.poll(async () => (await cells(logRow(page, 'SUB 08 44 13-001'))).slice(2, 8)).toEqual(['Apex Glass', '4', '4', 'Nov 9', '', '-9'])
  await logRow(page, 'RFI 2').click()
  await expect.poll(() => table(page.locator('.detail table'))).toEqual([
    ['Ray Architects Architect', 'Sep 1', 'Sep 22', '14 (93%)', '10', '4'],
    ['GC GC', 'Sep 22', 'Sep 23', '1 (7%)', '—', ''],
  ])
})

test('log CSV carries the same numbers', async ({ page }) => {
  await openTab(page, 'Log')
  const [name, buf] = await download(page, page.getByRole('button', { name: 'Download CSV' }))
  expect(name).toBe('project-1-log-2026-11-06.csv')
  const rows = readCsv(buf)
  expect(rows).toHaveLength(3)
  expect(rows[1]).toEqual(['rfi', '1', 'Embed conflict, grid C/4', 'Open', 'Ray Architects', 'Architect', '25', '26', '2026-10-16', '15', '', '0', 'Yes', 'No'])
  expect(rows[2]).toEqual(['submittal', '08 44 13-001', 'Curtain wall shop drawings', 'Draft', 'Apex Glass', 'Subcontractor', '4', '4', '2026-11-09', '0', '-9', '0', 'No', 'No'])
})

test('reviewer scorecard', async ({ page }) => {
  await openTab(page, 'Parties')
  const ray = async () => (await table(panel(page, 'Reviewer responsiveness').locator('table'))).find(r => r[0].startsWith('Ray Architects'))
  await expect.poll(ray).toEqual(['Ray Architects Architect', '2', '14', '14', '10', '100%', '1', '1', '15d'])
})

test('submittal register: submit-by, forecast and float, on screen and in both downloads', async ({ page }) => {
  await openTab(page, 'Schedule')
  await expect.poll(async () => (await table(panel(page, 'Submittal register').locator('table').first()))[0]?.slice(3)).toEqual(['Dec 14', '21', 'Oct 26', 'not submitted', 'Dec 29', '-9CP'])
  const want = ['08 44 13', 'Glazed aluminum curtain walls', '08 44 13-001', 'Curtain wall shop drawings', '0', 'Draft', 'Apex Glass', 'Subcontractor', 'A1310 Curtain wall install (08 44 13)', '2026-12-14', 'Yes', '2026-12-14', '21', '2026-10-26', '2026-12-29', '-9', 'Delays completion']
  const [, csv] = await download(page, page.getByRole('button', { name: 'CSV', exact: true }))
  expect(readCsv(csv)[1]).toEqual(want)
  const [name, xlsx] = await download(page, page.getByRole('button', { name: 'XLSX', exact: true }))
  expect(name).toBe('project-1-submittal-register-2026-11-06.xlsx')
  const XLSX = await import('xlsx')
  const wb = XLSX.read(xlsx)
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets['Submittal register'], { header: 1 })
  expect(rows[1].map(String)).toEqual(want)
})

test('a longer contract period moves the due date and the lateness', async ({ page }) => {
  // 12 workdays from 1 Sep: 16 Sep + Sep 17, 18. Held 14, so 2 late.
  await openTab(page, 'Parties')
  await panel(page, 'Contract review periods').getByRole('spinbutton', { name: 'Architect' }).fill('12')
  await openTab(page, 'Actions')
  await expect.poll(async () => (await table(panel(page, 'Delay-notice evidence log').locator('table'))).map(r => r.slice(0, 6))).toEqual([
    ['RFI 1 Embed conflict, grid C/4', 'Ray Architects', 'Oct 2', 'Oct 16', 'Still open', '15'],
    ['RFI 2 Beam pocket', 'Ray Architects', 'Sep 1', 'Sep 18', 'Sep 22', '2'],
  ])
})

test('evidence CSV and reminder email', async ({ page }) => {
  await openTab(page, 'Actions')
  const [name, buf] = await download(page, page.getByRole('button', { name: 'Download CSV' }))
  expect(name).toBe('project-1-review-delays-2026-11-06.csv')
  expect(readCsv(buf).slice(1)).toEqual([
    ['RFI 1', 'Embed conflict, grid C/4', 'Ray Architects', 'Architect', '2026-10-02', '10', '2026-10-16', 'Still open', '15', 'Yes', 'No', ''],
    ['RFI 2', 'Beam pocket', 'Ray Architects', 'Architect', '2026-09-01', '10', '2026-09-16', '2026-09-22', '4', 'No', 'No', ''],
  ])
  await expect(page.locator('.mail-text')).toContainText('- RFI 1: Embed conflict, grid C/4\n  With you since Oct 2, 2026; due Oct 16, 2026 (10 working days); now 15 working days late. Flagged for potential cost impact.')
  const href = await page.getByRole('link', { name: 'Open in mail app' }).getAttribute('href')
  expect(decodeURIComponent(href!)).toContain('subject=Project 1: 1 overdue RFI with Ray Architects')
})

test('removing a holiday adds that working day back', async ({ page }) => {
  // Without Labor Day the 10th workday after 1 Sep is 15 Sep, so RFI 2 is 5 late.
  const box = page.getByLabel(/^Holidays/)
  await box.fill((await box.inputValue()).replace('2026-09-07\n', ''))
  await box.blur()
  await openTab(page, 'Actions')
  await expect.poll(async () => (await table(panel(page, 'Delay-notice evidence log').locator('table')))[1]?.slice(3, 6)).toEqual(['Sep 15', 'Sep 22', '5'])
})

test('an earlier as-of date rewinds the log', async ({ page }) => {
  // On Fri 18 Sep RFI 2 was open with Ray: in court Sep 2 to 18 = 12 workdays, 2 past 16 Sep. Nothing else existed yet.
  await page.getByLabel('As of').fill('2026-09-18')
  await openTab(page, 'Log')
  const rows = page.locator('table.log tbody tr')
  await expect(rows).toHaveCount(1)
  await expect.poll(async () => (await cells(rows.first())).slice(0, 7)).toEqual(['RFI 2', 'Beam pocketOpen', 'Ray Architects', '12', '12', 'Sep 16', '2'])
})
