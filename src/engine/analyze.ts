import { Calendar, todayDay } from './calendar.ts'
import { REVIEWERS, ROLES, type Activity, type Config, type Dataset, type Day, type Item, type Role } from './types.ts'

export const DEFAULT_REVIEW_DAYS: Record<Role, number> = { Architect: 10, Engineer: 10, Owner: 5, Subcontractor: 5, GC: 3 }

/** Guesses a firm's role from its name. The project's firm table overrides it. */
export function guessRole(firm: string, gcName = ''): Role {
  const f = firm.toLowerCase()
  if (gcName && f.includes(gcName.toLowerCase())) return 'GC'
  if (/\b(gc|general contractor|builders?|construction|constructors|project manager|project engineer|superintendent)\b/.test(f)) return 'GC'
  if (/architect|design|\baia\b|studio|partners/.test(f)) return 'Architect'
  if (/engineer|structural|\bmep\b|mechanical|civil|\bpe\b|consult/.test(f)) return 'Engineer'
  if (/owner|developer|health|district|school|hospital|county|city of|university|properties|realty|client|facilities/.test(f)) return 'Owner'
  return 'Subcontractor'
}

export const roleOf = (firm: string | undefined, cfg: Config): Role => !firm ? 'GC' : cfg.firms[firm] ?? guessRole(firm, cfg.gcName)

export const asOfDay = (cfg: Config): Day => cfg.asOf ?? todayDay()
export const calendarFor = (cfg: Config) => new Calendar(cfg.holidays)

// ---------- Ball in court ----------

export interface Segment { firm: string; role: Role; from: Day; to: Day; open: boolean; days: number; allowed: number; dueAt: Day; late: number }

/**
 * Splits an item's life into hand-offs. With status history, each event starts a segment. Without it, dates stand in:
 * created to sent is the contractor side, sent (or created) to responded is the reviewer, responded to closed is back with the GC.
 */
export function segments(item: Item, cfg: Config, cal = calendarFor(cfg), asOf = asOfDay(cfg)): Segment[] {
  const end = item.open ? asOf : item.closed ?? asOf
  const raw: { firm: string; from: Day }[] = []
  if (item.history?.length) {
    if (item.history[0].at > item.created) raw.push({ firm: cfg.gcName || 'GC', from: item.created })
    for (const e of item.history) raw.push({ firm: e.bic || raw.at(-1)?.firm || cfg.gcName || 'GC', from: e.at })
  } else {
    const gc = cfg.gcName || 'GC'
    const bicRole = item.bic ? roleOf(item.bic, cfg) : undefined
    const withContractor = item.open && !!item.bic && !REVIEWERS.includes(bicRole!)
    const reviewer = item.reviewer ?? (item.bic && !withContractor ? item.bic : 'Reviewer')
    if (item.sent === undefined && item.responded === undefined && withContractor) {
      // Never sent and not with a reviewer: still being written or prepared.
      raw.push({ firm: item.bic!, from: item.created })
    } else {
      if (item.sent !== undefined && item.sent > item.created) raw.push({ firm: gc, from: item.created })
      raw.push({ firm: reviewer, from: item.sent ?? item.created })
      if (item.responded !== undefined) raw.push({ firm: withContractor ? item.bic! : gc, from: item.responded })
      // Back with the contractor but no response date exported: assume it came back on its due date.
      else if (withContractor) raw.push({ firm: item.bic!, from: Math.min(asOf, Math.max(item.sent ?? item.created, item.due ?? item.sent ?? item.created)) })
    }
  }
  const out: Segment[] = []
  const sorted = raw.filter(r => r.from <= end).sort((a, b) => a.from - b.from)
  const roleAt = (f: string): Role => f === 'Reviewer' ? 'Architect' : roleOf(f, cfg)
  let lastRev = -1
  sorted.forEach((r, i) => { if (REVIEWERS.includes(roleAt(r.firm))) lastRev = i })
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const to = i + 1 < sorted.length ? sorted[i + 1].from : end
    const role = roleAt(s.firm)
    const allowed = cfg.reviewDays[role] ?? DEFAULT_REVIEW_DAYS[role]
    const isLast = i === sorted.length - 1
    // The exported due date is the contractual one for the reviewer segment it belongs to.
    const dueAt = i === lastRev && item.due !== undefined && item.due > s.from ? item.due : cal.add(s.from, allowed)
    const days = cal.between(s.from, to)
    const open = isLast && item.open
    const late = to > dueAt ? cal.between(dueAt, to) : 0
    if (out.length && out.at(-1)!.firm === s.firm) { const p = out.at(-1)!; p.to = to; p.days += days; p.open = open; p.late = to > p.dueAt ? cal.between(p.dueAt, to) : 0; continue }
    out.push({ firm: s.firm, role, from: s.from, to, open, days, allowed, dueAt, late })
  }
  return out
}

export interface ItemState {
  item: Item
  segs: Segment[]
  holder?: Segment         // current segment when open
  age: number              // workdays since created (to close or as-of)
  inCourt: number          // workdays with the current holder
  overdue: boolean
  daysLate: number
  linked?: Activity
  sched?: ScheduleCalc
}

export interface ScheduleCalc {
  needBy: Day              // required on site (submittals) or activity start (RFIs)
  submitBy?: Day           // submittals only
  forecast: Day            // forecast on-site date (submittals) or forecast answer (RFIs)
  float: number            // workdays between forecast and need-by; negative = late
  threat: 'delays' | 'at-risk' | null
  stage: 'not submitted' | 'in review' | 'approved' | 'answered' | 'open'
}

/** Activity for an item: manual link, then the exported activity ID, then a spec-section match in the activity name or ID. */
export function linkActivity(item: Item, acts: Activity[], cfg: Config): Activity | undefined {
  if (!acts.length) return undefined
  const id = cfg.links[item.key] ?? item.activity
  if (id) { const a = acts.find(x => x.id === id); if (a) return a }
  if (cfg.links[item.key] === '') return undefined
  if (item.spec) {
    const sec = item.spec.replace(/\s+/g, '').slice(0, 6)
    if (sec.length >= 4) return acts.filter(a => (a.id + ' ' + a.name).replace(/\s+/g, '').includes(sec)).sort((a, b) => a.start - b.start)[0]
  }
  return undefined
}

export function scheduleCalc(item: Item, act: Activity | undefined, segs: Segment[], cfg: Config, cal: Calendar, asOf: Day): ScheduleCalc | undefined {
  const need = item.kind === 'submittal' ? item.requiredOnSite ?? act?.start : act?.start
  if (need === undefined) return undefined
  const reviewer = segs.find(s => REVIEWERS.includes(s.role))?.role ?? 'Architect'
  const period = cfg.reviewDays[reviewer] ?? 10
  const tf = act?.totalFloat ?? (act?.critical ? 0 : undefined)
  let calc: ScheduleCalc
  if (item.kind === 'submittal') {
    const lead = item.leadDays ?? cfg.defaultLeadDays
    const cycles = Math.max(1, cfg.reviewCycles - Math.min(item.revision, cfg.reviewCycles - 1))
    const submitBy = cal.add(need - lead, -cycles * period)
    const approved = !item.open || (item.responded !== undefined && !/revise|resubmit|reject/i.test(item.status))
    let forecast: Day, stage: ScheduleCalc['stage']
    if (approved) { stage = 'approved'; forecast = (item.responded ?? item.closed ?? asOf) + lead }
    else if (item.sent !== undefined || segs.some(s => REVIEWERS.includes(s.role) && s.open)) {
      // In review: assume it comes back by its due date (or tomorrow if already late), then any remaining cycles.
      const cur = segs.at(-1)
      const back = Math.max(cur?.dueAt ?? asOf, cal.add(asOf, 1))
      stage = 'in review'; forecast = cal.add(back, (cycles - 1) * period) + lead
    } else {
      stage = 'not submitted'
      const submit = Math.max(cal.add(asOf, 0), submitBy)
      forecast = cal.add(submit, cycles * period) + lead
      // Not submitted yet: float is how long it can still wait before submit-by.
      const float = cal.signed(asOf, submitBy)
      return { needBy: need, submitBy, forecast, float, threat: threat(float, tf, act, cfg), stage }
    }
    const float = cal.signed(forecast, need)
    calc = { needBy: need, submitBy, forecast, float, threat: threat(float, tf, act, cfg), stage }
  } else {
    if (!item.open) return { needBy: need, forecast: item.responded ?? item.closed ?? asOf, float: cal.signed(item.responded ?? item.closed ?? asOf, need), threat: null, stage: 'answered' }
    const cur = segs.at(-1)
    const forecast = Math.max(cur?.dueAt ?? asOf, cal.add(asOf, 1))
    const float = cal.signed(forecast, need)
    calc = { needBy: need, forecast, float, threat: threat(float, tf, act, cfg), stage: 'open' }
  }
  return calc
}

function threat(float: number, tf: number | undefined, act: Activity | undefined, cfg: Config): ScheduleCalc['threat'] {
  if (!act) return float < 0 ? 'at-risk' : null
  // Late by more than the activity's own float pushes completion.
  if (float + (tf ?? 0) < 0 && (act.critical || tf !== undefined)) return 'delays'
  if (act.critical && float < cfg.riskFloat) return 'at-risk'
  if (float < 0) return 'at-risk'
  return null
}

/** The item as it stood on `asOf`, so snapshots and the hero replay can look back in time. */
export function atDate(i: Item, asOf: Day): Item {
  const after = (d?: Day) => d !== undefined && d > asOf
  if (!after(i.closed) && !after(i.responded) && !after(i.sent) && !i.history?.some(e => e.at > asOf)) return i
  const history = i.history?.filter(e => e.at <= asOf)
  const rewound = after(i.responded) || after(i.closed)
  return {
    ...i, history,
    open: i.open || after(i.closed), closed: after(i.closed) ? undefined : i.closed,
    status: after(i.closed) ? 'Open' : i.status,
    sent: after(i.sent) ? undefined : i.sent, responded: after(i.responded) ? undefined : i.responded,
    bic: history?.length ? history.at(-1)!.bic : rewound ? i.responded !== undefined && !after(i.responded) ? undefined : after(i.sent) ? undefined : i.reviewer : i.bic,
  }
}

export function itemStates(ds: Dataset, cfg: Config): ItemState[] {
  const cal = calendarFor(cfg), asOf = asOfDay(cfg)
  return ds.items.filter(i => i.created <= asOf).map(raw => {
    const item = atDate(raw, asOf)
    const segs = segments(item, cfg, cal, asOf)
    const holder = item.open ? segs.at(-1) : undefined
    const linked = linkActivity(item, ds.activities, cfg)
    const dueLate = holder ? holder.late : 0
    return {
      item, segs, holder, linked,
      age: cal.between(item.created, item.open ? asOf : item.closed ?? asOf),
      inCourt: holder?.days ?? 0,
      overdue: dueLate > 0,
      daysLate: dueLate,
      sched: item.open || linked ? scheduleCalc(item, linked, segs, cfg, cal, asOf) : undefined,
    }
  })
}

// ---------- Rollups ----------

export const median = (xs: number[]) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface PartyTime { role: Role; days: number; holding: number; overdue: number }
/** Workdays each party has held items, summed over all segments. */
export function timeByRole(states: ItemState[]): PartyTime[] {
  const m = new Map<Role, PartyTime>(ROLES.map(r => [r, { role: r, days: 0, holding: 0, overdue: 0 }]))
  for (const s of states) {
    for (const g of s.segs) m.get(g.role)!.days += g.days
    if (s.holder) { const p = m.get(s.holder.role)!; p.holding++; if (s.overdue) p.overdue++ }
  }
  return [...m.values()]
}

export interface Scorecard { firm: string; role: Role; reviews: number; returned: number; median: number; p90: number; pctLate: number; holding: number; overdue: number; worstLate: number }
/** Reviewer responsiveness: one entry per firm that held items in a reviewer role. Open reviews count toward % late once past due. */
export function scorecards(states: ItemState[]): Scorecard[] {
  const by = new Map<string, Segment[]>()
  for (const s of states) for (const g of s.segs) if (REVIEWERS.includes(g.role) || g.role === 'Subcontractor') by.set(g.firm, [...(by.get(g.firm) ?? []), g])
  return [...by.entries()].map(([firm, segs]) => {
    const done = segs.filter(g => !g.open).map(g => g.days).sort((a, b) => a - b)
    const open = segs.filter(g => g.open)
    const counted = segs.filter(g => !g.open || g.late > 0)
    return {
      firm, role: segs[0].role, reviews: segs.length, returned: done.length,
      median: median(done), p90: done.length ? done[Math.min(done.length - 1, Math.ceil(done.length * 0.9) - 1)] : NaN,
      pctLate: counted.length ? counted.filter(g => g.late > 0).length / counted.length : NaN,
      holding: open.length, overdue: open.filter(g => g.late > 0).length, worstLate: Math.max(0, ...open.map(g => g.late)),
    }
  }).sort((a, b) => (b.pctLate || 0) - (a.pctLate || 0) || b.holding - a.holding)
}

export interface ImpactRollup { kind: string; cost: number; schedule: number; both: number; openCost: number; openSchedule: number; costValue: number; byRole: Record<Role, number> }
export function impactRollup(states: ItemState[]): ImpactRollup[] {
  return (['rfi', 'submittal'] as const).map(k => {
    const xs = states.filter(s => s.item.kind === k)
    const byRole = Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>
    for (const s of xs) if (s.holder && (s.item.costImpact || s.item.scheduleImpact)) byRole[s.holder.role]++
    return {
      kind: k === 'rfi' ? 'RFIs' : 'Submittals',
      cost: xs.filter(s => s.item.costImpact).length, schedule: xs.filter(s => s.item.scheduleImpact).length,
      both: xs.filter(s => s.item.costImpact && s.item.scheduleImpact).length,
      openCost: xs.filter(s => s.item.open && s.item.costImpact).length, openSchedule: xs.filter(s => s.item.open && s.item.scheduleImpact).length,
      costValue: xs.reduce((a, s) => a + (s.item.costValue ?? 0), 0), byRole,
    }
  })
}

export const resubmittalLoops = (states: ItemState[], min = 1) =>
  states.filter(s => s.item.kind === 'submittal' && s.item.revision >= min).sort((a, b) => b.item.revision - a.item.revision || b.age - a.age)

export const criticalThreats = (states: ItemState[]) =>
  states.filter(s => s.item.open && s.sched?.threat).sort((a, b) => (a.sched!.threat === 'delays' ? 0 : 1) - (b.sched!.threat === 'delays' ? 0 : 1) || a.sched!.float - b.sched!.float)

// ---------- Burn-down ----------

export interface BurnPoint { week: Day; open: number; opened: number; closed: number; projected?: number }
export interface BurnDown { history: BurnPoint[]; forecast: BurnPoint[]; netPerWeek: number; openedPerWeek: number; closedPerWeek: number; zeroWeek: Day | null }

/** Weekly open count for the last `weeks` weeks, then a straight-line projection from the average net close rate. */
export function burnDown(items: Item[], asOf: Day, weeks = 8, ahead = 12): BurnDown {
  const openAt = (d: Day) => items.filter(i => i.created <= d && (i.open || (i.closed ?? Infinity) > d)).length
  const history: BurnPoint[] = []
  for (let w = weeks; w >= 0; w--) {
    const end = asOf - w * 7
    history.push({ week: end, open: openAt(end), opened: items.filter(i => i.created > end - 7 && i.created <= end).length, closed: items.filter(i => i.closed !== undefined && i.closed > end - 7 && i.closed <= end).length })
  }
  const recent = history.slice(1)
  const openedPerWeek = recent.reduce((a, p) => a + p.opened, 0) / recent.length
  const closedPerWeek = recent.reduce((a, p) => a + p.closed, 0) / recent.length
  const netPerWeek = closedPerWeek - openedPerWeek
  const now = history.at(-1)!.open
  const forecast: BurnPoint[] = []
  let zeroWeek: Day | null = null
  for (let w = 1; w <= ahead; w++) {
    const projected = Math.max(0, now - netPerWeek * w)
    forecast.push({ week: asOf + w * 7, open: projected, opened: 0, closed: 0, projected })
    if (zeroWeek === null && projected === 0 && now > 0) zeroWeek = asOf + w * 7
  }
  if (now === 0) zeroWeek = asOf
  else if (netPerWeek > 0 && zeroWeek === null) zeroWeek = asOf + Math.ceil(now / netPerWeek) * 7
  return { history, forecast, netPerWeek, openedPerWeek, closedPerWeek, zeroWeek }
}

// ---------- Summary + snapshots ----------

export interface Summary { open: number; openRfis: number; openSubmittals: number; overdue: number; medianAge: number; threats: number; delays: number; minFloat: number | null; newThisWeek: number; closedThisWeek: number }
export function summarize(states: ItemState[], asOf: Day): Summary {
  const open = states.filter(s => s.item.open)
  const floats = open.map(s => s.sched?.float).filter((x): x is number => x !== undefined && s0(x))
  return {
    open: open.length, openRfis: open.filter(s => s.item.kind === 'rfi').length, openSubmittals: open.filter(s => s.item.kind === 'submittal').length,
    overdue: open.filter(s => s.overdue).length, medianAge: median(open.map(s => s.age)),
    threats: open.filter(s => s.sched?.threat).length, delays: open.filter(s => s.sched?.threat === 'delays').length,
    minFloat: floats.length ? Math.min(...floats) : null,
    newThisWeek: states.filter(s => s.item.created > asOf - 7).length,
    closedThisWeek: states.filter(s => !s.item.open && s.item.closed !== undefined && s.item.closed > asOf - 7).length,
  }
}
const s0 = (x: number) => Number.isFinite(x)

export interface SnapItem { n: string; t: string; firm: string; role: Role | ''; open: boolean; age: number; inCourt: number; late: number; float?: number }
export interface Snapshot { id: string; label: string; asOf: Day; at: number; summary: Summary; items: Record<string, SnapItem> }

export function snapshot(states: ItemState[], asOf: Day, id: string, label: string): Snapshot {
  const items: Record<string, SnapItem> = {}
  for (const s of states) items[s.item.key] = { n: s.item.number, t: s.item.title.slice(0, 80), firm: s.holder?.firm ?? '', role: s.holder?.role ?? '', open: s.item.open, age: s.age, inCourt: s.inCourt, late: s.daysLate, float: s.sched?.float }
  return { id, label, asOf, at: Date.now(), summary: summarize(states, asOf), items }
}

export interface Change { key: string; item: SnapItem; before?: SnapItem; kind: 'new' | 'closed' | 'moved' | 'stuck' | 'newly-overdue' | 'float-lost' }
/** What moved and what got stuck between two snapshots. Stuck = still with the same firm and now past due. */
export function compare(a: Snapshot, b: Snapshot): Change[] {
  const out: Change[] = []
  for (const [key, now] of Object.entries(b.items)) {
    const was = a.items[key]
    if (!was) { out.push({ key, item: now, kind: now.open ? 'new' : 'closed' }); continue }
    if (was.open && !now.open) { out.push({ key, item: now, before: was, kind: 'closed' }); continue }
    if (!now.open) continue
    if (was.firm !== now.firm) out.push({ key, item: now, before: was, kind: 'moved' })
    else if (now.late > 0 && was.late === 0) out.push({ key, item: now, before: was, kind: 'newly-overdue' })
    else if (now.late > 0) out.push({ key, item: now, before: was, kind: 'stuck' })
    if (now.float !== undefined && was.float !== undefined && now.float < was.float && now.float < 10) out.push({ key, item: now, before: was, kind: 'float-lost' })
  }
  return out
}
