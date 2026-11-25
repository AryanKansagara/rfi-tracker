import { cells, choose, commit, download, expect, fixture, importedRow, importFile, logRow, newProject, openTab, panel, pending, RFIS, table, test } from './fixtures.ts'

const LATIN1 = Buffer.from('ID,Title,Status,Ball in court,Created on,Due date\n1,Fa\xe7ade joint \x96 level 2,Open,Ray Architects,2026-10-01,2026-10-16\n', 'latin1')
const ready = (page: Parameters<typeof pending>[0], name: string) => pending(page, name).locator('p.small').filter({ hasText: 'ready' })

// ---------- Formats ----------

test('Procore RFI export', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'rfis.csv', body: await fixture('procore-rfis-excerpt.csv') })
  const p = pending(page, 'rfis.csv')
  await expect(p.getByLabel('Detected as')).toHaveValue('procore-rfi')
  await expect(ready(page, 'rfis.csv')).toContainText('3 items ready from 3 rows')
  await expect(ready(page, 'rfis.csv')).toContainText('3 RFIs, 0 submittals, 2 open.')
  await commit(page, 'rfis.csv')
  await openTab(page, 'Log')
  // Due 1 Oct, with the architect: 1 Oct to 6 Nov is 26 workdays late.
  await expect.poll(async () => (await cells(logRow(page, 'RFI 14'))).slice(2, 7)).toEqual(['Kessler Ray Architects', '36', '36', 'Oct 1', '26'])
})

test('Autodesk Build RFI export from a UK account is read day-first and says so', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'acc.csv', body: await fixture('acc-rfis-uk-excerpt.csv') })
  await expect(pending(page, 'acc.csv').getByLabel('Detected as')).toHaveValue('acc-rfi')
  await expect(pending(page, 'acc.csv').getByRole('log')).toContainText('read as day/month/year')
  await commit(page, 'acc.csv')
  await openTab(page, 'Log')
  await expect.poll(async () => (await cells(logRow(page, 'RFI 21')))[5]).toBe('Oct 19')
})

test('Procore submittal log: revisions collapse to one item', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'sub.csv', 'Spec Section,#,Rev.,Title,Status,Ball In Court,Submittal Manager,Issue Date\n08 44 13,08-1,0,Curtain wall,Revise and Resubmit,Apex Glass,Pat,2026-07-20\n08 44 13,08-1,1,Curtain wall,Open,Ray Architects,Pat,2026-09-21\n')
  await openTab(page, 'Schedule')
  await expect.poll(() => table(panel(page, 'Resubmittal loops').locator('table'))).toHaveLength(1)
  await expect(panel(page, 'Resubmittal loops')).toContainText('08-1 Curtain wall')
})

test('P6 XER: current project only, float by calendar, Windows-1252 text', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'mob.xer', body: await fixture('p6-mob-excerpt.xer') })
  await expect(pending(page, 'mob.xer').getByLabel('Detected as')).toHaveValue('p6')
  await expect(ready(page, 'mob.xer')).toContainText('5 activities ready from 5 rows.')
  await commit(page, 'mob.xer')
  await importFile(page, 'sub.csv', 'Number,Title,Spec section,Status,Ball in court,Created on,Required on job date\n07-1,Air barrier,07 27 26,Open,Ray Architects,2026-11-02,\n')
  await openTab(page, 'Schedule')
  await expect(page.getByLabel('Activity for 07-1')).toHaveValue('A1300')
  await expect(page.getByLabel('Activity for 07-1').locator('option:checked')).toHaveText('A1300 Façade air barrier 07 27 26')
})

test('Microsoft Project and P6 spreadsheet schedules', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'msp.csv', body: 'ID,Name,Duration,Start,Finish,Total Slack,Critical\n1,Steel,5 days,Mon 12/14/26,Fri 12/18/26,0 days,Yes\n' }, { name: 'p6.csv', body: 'task_code,task_name,target_start_date,target_end_date,total_float_hr_cnt\nA1,Steel,14-Dec-26 A,05-Mar-27,80\n' })
  await expect(pending(page, 'msp.csv').getByLabel('Detected as')).toHaveValue('msp')
  await expect(pending(page, 'p6.csv').getByLabel('Detected as')).toHaveValue('p6')
  await commit(page, 'msp.csv')
  await commit(page, 'p6.csv')
  await expect(panel(page, 'Imported data')).toContainText('1 activities')
})

test('status history splits time between firms', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', 'ID,Title,Status,Ball in court,Assigned to,Created on\n14,Slab edge,Open,Ray Architects,Ray Architects,2026-10-01\n')
  await importFile(page, 'history.csv', 'Number,Type,Changed on,Ball in court,Status\n14,RFI,2026-10-02,Ray Architects,Open\n14,RFI,2026-10-09,Bolt Structural,Open\n14,RFI,2026-10-16,Ray Architects,Open\n99,RFI,2026-10-16,Ray Architects,Open\n')
  await expect(page.getByText('1 numbers not in the log')).toBeVisible()
  await openTab(page, 'Log')
  await logRow(page, 'RFI 14').click()
  // Thu 1 Oct to Fri 2 (1), a week (5), a week (5), then 16 Oct to 6 Nov (15).
  await expect.poll(async () => (await table(page.locator('.detail table'))).map(r => [r[0], r[3].split(' ')[0]])).toEqual([['GC GC', '1'], ['Ray Architects Architect', '5'], ['Bolt Structural Engineer', '5'], ['Ray Architects Architect', '15']])
})

test('history before any log is refused', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'h.csv', body: 'Number,Type,Changed on,Ball in court\n1,RFI,2026-10-02,Ray Architects\n' })
  await page.getByRole('button', { name: 'Import 1 events' }).click()
  await expect(page.getByText('Import the RFI or submittal log first')).toBeVisible()
  await expect(panel(page, 'Imported data')).toHaveCount(0)
})

test('XLSX workbook: the sheet with a known header is used, title block skipped', async ({ page }) => {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Cover'], ['Riverside']]), 'Cover')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['RFI log'], [], ['ID', 'Title', 'Status', 'Ball in court', 'Created on', 'Due date'], ['1', 'Embed', 'Open', 'Ray Architects', '2026-10-01', '2026-10-16']]), 'Log')
  await newProject(page)
  await choose(page, { name: 'log.xlsx', body: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) })
  await expect(pending(page, 'log.xlsx').getByLabel('Detected as')).toHaveValue('acc-rfi')
  await commit(page, 'log.xlsx')
  await openTab(page, 'Log')
  await expect.poll(async () => (await cells(logRow(page, 'RFI 1'))).slice(4, 7)).toEqual(['26', 'Oct 16', '15'])
})

for (const [label, body] of [
  ['BOM and CRLF', '﻿' + RFIS.replace(/\n/g, '\r\n')],
  ['semicolons', RFIS.replace('"Embed conflict, grid C/4"', 'Embed conflict').replace(/,/g, ';')],
  ['tabs', RFIS.replace('"Embed conflict, grid C/4"', 'Embed conflict').replace(/,/g, '\t')],
] as const) test(`delimited text: ${label}`, async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', body)
  await openTab(page, 'Log')
  await expect.poll(async () => (await cells(logRow(page, 'RFI 1'))).slice(2, 7)).toEqual(['Ray Architects', '25', '26', 'Oct 16', '15'])
})

test('Windows-1252 text', async ({ page }) => {
  await newProject(page)
  await importFile(page, 'log.csv', LATIN1)
  await openTab(page, 'Log')
  await expect(logRow(page, 'RFI 1')).toContainText('Façade joint – level 2')
})

test('manual column mapping and row type', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'odd.csv', body: 'Key,What,When\nS-1,Door hardware,2026-10-01\n' })
  const p = pending(page, 'odd.csv')
  await expect(p.getByRole('button', { name: /^Import 0/ })).toBeDisabled()
  await p.getByLabel('Number / ID *').selectOption({ label: 'Key' })
  await p.getByLabel('Title / subject *').selectOption({ label: 'What' })
  await p.getByLabel('Created / initiated *').selectOption({ label: 'When' })
  await p.getByLabel('Rows are').selectOption('submittal')
  await commit(page, 'odd.csv')
  await openTab(page, 'Log')
  await expect(logRow(page, 'SUB S-1')).toContainText('Door hardware')
})

test('every template downloads and imports back', async ({ page }) => {
  await newProject(page)
  for (const t of ['rfi log', 'submittal log', 'status history', 'schedule', 'spec sections']) {
    const [name, buf] = await download(page, page.getByRole('button', { name: t, exact: true }))
    await importFile(page, name, buf)
    await expect(importedRow(page, name).locator('td').nth(2)).toHaveText('0')
  }
  await expect(panel(page, 'Imported data')).toContainText('1 RFIs · 1 submittals · 1 with history · 1 activities · 1 spec sections')
})

test('re-importing updates by number and keeps history', async ({ page }) => {
  const log = (t: string) => `ID,Title,Status,Ball in court,Created on\n7,${t},Open,Ray Architects,2026-10-01\n`
  await newProject(page)
  await importFile(page, 'one.csv', log('First'))
  await importFile(page, 'hist.csv', 'Number,Type,Changed on,Ball in court\n7,RFI,2026-10-02,Ray Architects\n')
  await importFile(page, 'two.csv', log('Second'))
  await expect(panel(page, 'Imported data')).toContainText('1 RFIs · 0 submittals · 1 with history')
  await openTab(page, 'Log')
  await expect(page.locator('table.log tbody tr')).toHaveText([/Second/])
})

// ---------- Wrong, empty and broken files ----------

for (const [name, body, message] of [
  ['empty.csv', '', 'empty.csv has no data rows.'],
  ['blank.csv', '\n\n , \n', 'blank.csv has no data rows.'],
  ['header.csv', 'ID,Title,Created on\n', 'header.csv has no data rows.'],
  ['notask.xer', 'ERMHDR\t22.12\n%T\tPROJECT\n%F\tproj_id\n%R\t1\n%E\n', 'No TASK table in this XER file'],
  ['not.xer', 'hello\n', 'No TASK table in this XER file'],
] as const) test(`refused with a message: ${name}`, async ({ page }) => {
  await newProject(page)
  await choose(page, { name, body })
  await expect(page.locator('.toast.error')).toContainText(message)
  await expect(page.locator('.panel.pending')).toHaveCount(0)
})

test('a workbook cut off half way is refused', async ({ page }) => {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'Title', 'Created on'], ...Array.from({ length: 200 }, (_, i) => [i, 'Title ' + i, '2026-10-01'])]), 'Log')
  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  await newProject(page)
  await choose(page, { name: 'cut.xlsx', body: buf.subarray(0, buf.length / 2) })
  await expect(page.locator('.toast.error')).toContainText('cut.xlsx')
  await expect(page.locator('.panel.pending')).toHaveCount(0)
})

for (const [name, body] of [
  ['photo.csv', Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 10, 1, 2, 3, 10])],
  ['page.csv', '<html><body>\n<h1>Sign in</h1>\n</body></html>\n'],
  ['data.csv', '{"items":[\n{"id":1}\n]}\n'],
] as const) test(`nothing importable from an unrelated file: ${name}`, async ({ page }) => {
  await newProject(page)
  await choose(page, { name, body })
  const p = pending(page, name)
  await expect(p.getByRole('log')).toContainText('is not mapped')
  await expect(p.getByRole('button', { name: /^Import 0/ })).toBeDisabled()
})

test('bad rows are listed by line and skipped, unreadable dates are named', async ({ page }) => {
  await newProject(page)
  await choose(page, { name: 'bad.csv', body: 'ID,Title,Status,Ball in court,Created on,Due date\n1,A,Open,Ray Architects,2026-10-01,soon\n,B,Open,Ray Architects,2026-10-02,\n3,C,Open,Ray Architects,2026-02-30,\n4,D,Open,,2026-10-02,\n' })
  const log = pending(page, 'bad.csv').getByRole('log')
  await expect(log.locator('> div')).toHaveText([/line 2.*Due date "soon" is not a date; ignored/, /line 3.*Number is empty/, /line 4.*Created date "2026-02-30" is not a date/, /line 5.*no ball in court/])
  await expect(ready(page, 'bad.csv')).toContainText('2 items ready from 4 rows, 2 skipped, 2 warnings')
  await commit(page, 'bad.csv')
  await expect(importedRow(page, 'bad.csv').locator('td').nth(2)).toHaveText('2')
})
