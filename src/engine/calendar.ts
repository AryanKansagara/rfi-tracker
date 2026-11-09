import type { Day } from './types.ts'

const MS = 86_400_000
export const dayOf = (y: number, m: number, d: number): Day => Math.floor(Date.UTC(y, m - 1, d) / MS)
export const toIso = (d: Day) => new Date(d * MS).toISOString().slice(0, 10)
export const fromIso = (s: string): Day => dayOf(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10))
export const weekday = (d: Day) => (d + 4) % 7 // 1970-01-01 was a Thursday; 0 = Sunday
export const todayDay = (): Day => Math.floor(Date.now() / MS)

const nthWeekday = (y: number, m: number, wd: number, n: number) => {
  const first = dayOf(y, m, 1)
  return first + ((wd - weekday(first) + 7) % 7) + (n - 1) * 7
}
const lastWeekday = (y: number, m: number, wd: number) => {
  const last = dayOf(y, m + 1, 1) - 1
  return last - ((weekday(last) - wd + 7) % 7)
}
/** Fixed-date holidays falling on a weekend are observed on the nearest weekday. */
const observed = (d: Day) => weekday(d) === 6 ? d - 1 : weekday(d) === 0 ? d + 1 : d

/** Typical US commercial construction holidays: New Year, Memorial Day, July 4, Labor Day, Thanksgiving + Friday, Christmas. */
export function constructionHolidays(year: number): Day[] {
  const thanks = nthWeekday(year, 11, 4, 4)
  return [
    observed(dayOf(year, 1, 1)), lastWeekday(year, 5, 1), observed(dayOf(year, 7, 4)),
    nthWeekday(year, 9, 1, 1), thanks, thanks + 1, observed(dayOf(year, 12, 25)),
  ]
}

export class Calendar {
  private hol: Set<Day>
  constructor(holidays: Day[] = []) { this.hol = new Set(holidays) }
  isWorkday(d: Day) { const w = weekday(d); return w !== 0 && w !== 6 && !this.hol.has(d) }

  /** Workdays elapsed after `a` up to and including `b` (0 when b <= a). Same-day hand-offs age 0. */
  between(a: Day, b: Day): number {
    if (b <= a) return 0
    let n = 0
    // Whole weeks first, then the remainder, then subtract holidays in range.
    const span = b - a
    const weeks = Math.floor(span / 7)
    n += weeks * 5
    for (let d = a + weeks * 7 + 1; d <= b; d++) { const w = weekday(d); if (w !== 0 && w !== 6) n++ }
    for (const h of this.hol) { const w = weekday(h); if (h > a && h <= b && w !== 0 && w !== 6) n-- }
    return n
  }

  /** Signed workdays from a to b: negative when b is before a. */
  signed(a: Day, b: Day) { return b >= a ? this.between(a, b) : -this.between(b, a) }

  /** Moves n workdays from d (n may be negative). n = 0 rolls forward to a workday. */
  add(d: Day, n: number): Day {
    if (n === 0) { while (!this.isWorkday(d)) d++; return d }
    const step = n > 0 ? 1 : -1
    let left = Math.abs(n)
    while (left > 0) { d += step; if (this.isWorkday(d)) left-- }
    return d
  }
}
