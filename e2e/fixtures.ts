import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/** Web fonts in index.html: answered with an empty stylesheet. */
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])

/** Friday 6 November 2026, noon UTC. The app reads "today" and the default holiday years from the clock. */
export const NOW = new Date('2026-11-06T12:00:00Z')

export const test = base.extend<{ external: string[] }>({
  external: async ({}, use) => { await use([]) },

  // Only the app is reachable: a request to any other host (Supabase included) fails the test, and so does an uncaught page error.
  context: async ({ context, baseURL, external }, use) => {
    const errors: string[] = []
    const origin = new URL(baseURL!).origin
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      if (url.origin === origin) return route.continue()
      if (FONT_HOSTS.has(url.host)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' })
      external.push(url.host)
      return route.abort('blockedbyclient')
    })
    context.on('weberror', e => errors.push(String(e.error())))
    await context.clock.setFixedTime(NOW)
    await use(context)
    expect(errors, 'uncaught page errors').toEqual([])
    expect(external, 'requests to hosts other than the app').toEqual([])
  },
})

export { expect }

export interface FileInput { name: string; body: string | Buffer }

/*
 * The hand-worked job, as of Friday 6 November 2026. Working days skip weekends and the default US construction
 * holidays, of which Labor Day (Mon 7 Sep) and Thanksgiving (Thu 26 and Fri 27 Nov) fall in range.
 *
 * RFI 1: created Thu 1 Oct, sent Fri 2 Oct, due Fri 16 Oct, still with Ray Architects.
 *   age      1 Oct -> 6 Nov = 5 weeks and the Friday         26 workdays
 *   in court 2 Oct -> 6 Nov = 5 weeks                        25
 *   late    16 Oct -> 6 Nov = 3 weeks                        15
 * RFI 2: sent to Ray Tue 1 Sep, answered Tue 22 Sep, closed Wed 23 Sep, no due date, so the architect's 10 workdays count.
 *   due: Sep 2 3 4 (7 off) 8 9 10 11 14 15 16                16 Sep
 *   held: those 10 plus Sep 17 18 21 22                      14 workdays, 4 late
 * Ray Architects: 2 reviews, 1 returned, median 14, 2 of 2 late (100%), holding 1.
 * Submittal 08 44 13-001: created Mon 2 Nov, with Apex Glass, not sent. Needed Mon 14 Dec (the critical activity's start),
 *   lead 3 weeks = 21 days, 2 cycles of 10 workdays.
 *   submit by: 14 Dec - 21 days = Mon 23 Nov, less 20 workdays (no holiday in between) = Mon 26 Oct
 *   float: 26 Oct -> 6 Nov = Oct 27-30 (4) + Nov 2-6 (5) = 9 workdays ago, so -9. The activity has no float: completion slips.
 *   forecast: 6 Nov + 20 workdays = Nov 9-13 (5) 16-20 (10) 23-25 (13) 30-Dec 4 (18) Dec 7, 8 (20) = 8 Dec, + 21 days = 29 Dec
 *   age: 2 Nov -> 6 Nov = 4
 * Open 2, overdue 1, median open age (26 + 4) / 2 = 15, threats 1.
 */
export const RFIS = `Number,Title,Status,Ball in court,Assigned to,Created on,Sent date,Due date,Responded on,Closed on,Cost impact,Schedule impact
1,"Embed conflict, grid C/4",Open,Ray Architects,Ray Architects,2026-10-01,2026-10-02,2026-10-16,,,Yes,No
2,Beam pocket,Closed,,Ray Architects,2026-09-01,2026-09-01,,2026-09-22,2026-09-23,No,No
`
export const SUBMITTALS = `Number,Title,Spec section,Revision,Status,Ball in court,Created on,Required on job date,Lead time
08 44 13-001,Curtain wall shop drawings,08 44 13,0,Draft,Apex Glass,2026-11-02,2026-12-14,3 weeks
`
export const SCHEDULE = `Activity ID,Activity name,Start,Finish,Total float,Critical
A1310,Curtain wall install (08 44 13),2026-12-14,2027-03-05,0,Yes
`
export const SPECS = 'Section,Title\n08 44 13,Glazed aluminum curtain walls\n'

// ---------- Driving the app ----------

/** A blank project, on its Data tab. */
export async function newProject(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: /^(Import your data|New project)$/ }).click()
  await expect(page.getByRole('heading', { name: 'Import', exact: true })).toBeVisible()
}

export const pending = (page: Page, name: string) => page.locator('.panel.pending').filter({ has: page.getByRole('heading', { name, exact: true }) })

/** Chooses files on the Data tab; nothing is committed. */
export async function choose(page: Page, ...files: FileInput[]) {
  await page.locator('input[type=file]').setInputFiles(files.map(f => ({ name: f.name, mimeType: 'application/octet-stream', buffer: Buffer.from(f.body as string) })))
}

export async function commit(page: Page, name: string) {
  const p = pending(page, name)
  await p.getByRole('button', { name: /^Import \d+/ }).click()
  await expect(p).toHaveCount(0)
  await expect(importedRow(page, name)).toBeVisible()
}
export const importedRow = (page: Page, name: string) => page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Imported data' }) }).locator('tbody tr').filter({ hasText: name })

export async function importFile(page: Page, name: string, body: string | Buffer) {
  await choose(page, { name, body })
  await commit(page, name)
}

/** New project with the given RFI log imported, on the Log tab showing every item. */
export async function logOf(page: Page, csv: string | Buffer, name = 'rfi-log.csv') {
  await newProject(page)
  await importFile(page, name, csv)
  await openTab(page, 'Log')
  await page.getByLabel('Status', { exact: true }).selectOption('all')
}

export async function handProject(page: Page) {
  await newProject(page)
  await importFile(page, 'rfi-log.csv', RFIS)
  await importFile(page, 'submittal-log.csv', SUBMITTALS)
  await importFile(page, 'schedule.csv', SCHEDULE)
  await importFile(page, 'specs.csv', SPECS)
}

export async function openTab(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Project sections' }).getByRole('link', { name: new RegExp(`^${name}`) })
  await link.click()
  await expect(link).toHaveAttribute('aria-current', 'page')
}

export const panel = (page: Page, heading: string | RegExp) => page.locator('.panel').filter({ has: page.getByRole('heading', { name: heading }) })
export const kpi = (page: Page, name: string) => page.locator('.kpi').filter({ has: page.locator('small', { hasText: name }) }).locator('b').first()

/** One row of the Log tab as its cell texts: item, title, ball in court, in court, age, due, late, float, flags. */
export const logRow = (page: Page, item: string) => page.locator('table.log tbody tr').filter({ has: page.getByRole('button', { name: item, exact: true }) })
export const cells = (row: Locator) => row.locator('th,td').evaluateAll(cs => cs.map(c => (c.textContent ?? '').trim().replace(/\s+/g, ' ')))
/** Every body row of a table as its trimmed cell texts. */
export const table = (t: Locator) => t.locator('tbody tr').evaluateAll(rs => rs.map(r => [...r.querySelectorAll('th,td')].map(c => (c.textContent ?? '').trim().replace(/\s+/g, ' '))))

export async function download(page: Page, trigger: Locator): Promise<[string, Buffer]> {
  const [d] = await Promise.all([page.waitForEvent('download'), trigger.click()])
  return [d.suggestedFilename(), await readFile((await d.path())!)]
}

/** RFC 4180 reader, independent of the app's own. */
export function readCsv(buf: Buffer): string[][] {
  const rows: string[][] = [[]]
  for (const m of buf.toString('utf8').matchAll(/("(?:[^"]|"")*"|[^",\r\n]*)(,|\r?\n|$)/g)) {
    if (!m[0]) break
    rows.at(-1)!.push(m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1])
    if (m[2] !== ',') rows.push([])
  }
  return rows.filter(r => r.length)
}
export const fixture = (n: string) => readFile(new URL(`../src/engine/fixtures/${n}`, import.meta.url))

// ---------- Reported bugs ----------

/** For tests that are expected to fail: gives up sooner than the suite's default. */
export const soon = expect.configure({ timeout: 15_000 })
export const H = 'ID,Title,Status,Ball in court,Assigned to,Created on,Due date,Responded on,Closed on\n'
export const held = async (page: Page, item: string) => (await cells(logRow(page, item)))[2]
