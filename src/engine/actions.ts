import { toIso } from './calendar.ts'
import { asOfDay, calendarFor, criticalThreats, type ItemState } from './analyze.ts'
import { toCsv } from './parse.ts'
import { REVIEWERS, type Config, type Day, type Role, type SpecSection } from './types.ts'

const label = (s: ItemState) => `${s.item.kind === 'rfi' ? 'RFI' : 'Submittal'} ${s.item.number}`
export const fmtDay = (d: Day | undefined) => d === undefined ? '' : new Date(d * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// ---------- Weekly OAC report ----------

export interface OacReport {
  asOf: Day
  newItems: ItemState[]
  closedItems: ItemState[]
  overdueByParty: { firm: string; role: Role; items: ItemState[] }[]
  decisions: ItemState[]
  submitBy: ItemState[]
  threats: ItemState[]
}

/** New this week, overdue grouped by who holds them, decisions needed (with the owner or carrying an impact), and submit-by dates in the next three weeks. */
export function oacReport(states: ItemState[], cfg: Config, horizonDays = 15): OacReport {
  const asOf = asOfDay(cfg), cal = calendarFor(cfg)
  const groups = new Map<string, ItemState[]>()
  for (const s of states) if (s.item.open && s.overdue && s.holder) groups.set(s.holder.firm, [...(groups.get(s.holder.firm) ?? []), s])
  const horizon = cal.add(asOf, horizonDays)
  return {
    asOf,
    newItems: states.filter(s => s.item.created > asOf - 7).sort((a, b) => a.item.created - b.item.created),
    closedItems: states.filter(s => !s.item.open && s.item.closed !== undefined && s.item.closed > asOf - 7),
    overdueByParty: [...groups.entries()].map(([firm, items]) => ({ firm, role: items[0].holder!.role, items: items.sort((a, b) => b.daysLate - a.daysLate) }))
      .sort((a, b) => b.items.length - a.items.length || b.items[0].daysLate - a.items[0].daysLate),
    decisions: states.filter(s => s.item.open && s.holder && (s.holder.role === 'Owner' || ((s.item.costImpact || s.item.scheduleImpact) && REVIEWERS.includes(s.holder.role))))
      .sort((a, b) => b.inCourt - a.inCourt),
    submitBy: states.filter(s => s.item.kind === 'submittal' && s.item.open && s.sched?.stage === 'not submitted' && s.sched.submitBy !== undefined && s.sched.submitBy <= horizon)
      .sort((a, b) => a.sched!.submitBy! - b.sched!.submitBy!),
    threats: criticalThreats(states),
  }
}

// ---------- Reminder emails ----------

export interface Reminder { firm: string; role: Role; subject: string; body: string; count: number }

/** One polite, specific email per party holding overdue items, oldest first, with the contract period they were given. */
export function reminders(states: ItemState[], cfg: Config, project: string, sender = ''): Reminder[] {
  const rep = oacReport(states, cfg)
  return rep.overdueByParty.map(g => {
    const lines = g.items.map(s => `- ${label(s)}: ${s.item.title}\n  With you since ${fmtDay(s.holder!.from)}; due ${fmtDay(s.holder!.dueAt)} (${s.holder!.allowed} working days); now ${s.daysLate} working day${s.daysLate === 1 ? '' : 's'} late.${s.sched && s.sched.float < 5 ? ` Needed for ${s.linked ? `"${s.linked.name}" starting ` : ''}${fmtDay(s.sched.needBy)}.` : ''}${s.item.costImpact || s.item.scheduleImpact ? ' Flagged for potential ' + [s.item.costImpact && 'cost', s.item.scheduleImpact && 'schedule'].filter(Boolean).join(' and ') + ' impact.' : ''}`)
    const urgent = g.items.filter(s => s.sched?.threat)
    return {
      firm: g.firm, role: g.role, count: g.items.length,
      subject: `${project}: ${g.items.length} overdue ${g.items.every(s => s.item.kind === 'rfi') ? 'RFI' : g.items.every(s => s.item.kind === 'submittal') ? 'submittal' : 'item'}${g.items.length > 1 ? 's' : ''} with ${g.firm}`,
      body: [
        `Hi ${g.firm} team,`,
        '',
        `As of ${fmtDay(rep.asOf)}, the following ${g.items.length === 1 ? 'item is' : `${g.items.length} items are`} past the review period in the contract and still with you on ${project}:`,
        '',
        ...lines,
        '',
        urgent.length ? `${urgent.map(label).join(', ')} ${urgent.length === 1 ? 'is' : 'are'} now driving schedule dates, so ${urgent.length === 1 ? 'it is' : 'they are'} the priority.\n` : '',
        'Could you send a response, or a date we can expect one, by the end of this week? If anything is waiting on information from us, reply and we will turn it around.',
        '',
        'Thanks,',
        sender || '[Your name]',
      ].join('\n').replace(/\n{3,}/g, '\n\n'),
    }
  })
}

// ---------- Submittal register ----------

export const REGISTER_HEADERS = ['Spec section', 'Spec title', 'Number', 'Title', 'Rev', 'Status', 'Ball in court', 'Party', 'Linked activity', 'Activity start', 'Critical', 'Required on site', 'Lead time (days)', 'Submit by', 'Forecast on site', 'Float (workdays)', 'Risk']

export function registerRows(states: ItemState[], specs: SpecSection[]): (string | number)[][] {
  const specTitle = (sec?: string) => sec ? specs.find(s => s.section.replace(/\s/g, '') === sec.replace(/\s/g, ''))?.title ?? '' : ''
  return states.filter(s => s.item.kind === 'submittal')
    .sort((a, b) => (a.item.spec ?? '').localeCompare(b.item.spec ?? '') || a.item.number.localeCompare(b.item.number, undefined, { numeric: true }))
    .map(s => [
      s.item.spec ?? '', specTitle(s.item.spec), s.item.number, s.item.title, s.item.revision, s.item.status, s.holder?.firm ?? '', s.holder?.role ?? '',
      s.linked ? `${s.linked.id} ${s.linked.name}` : '', s.linked ? toIso(s.linked.start) : '', s.linked?.critical ? 'Yes' : s.linked ? 'No' : '',
      s.sched ? toIso(s.sched.needBy) : '', s.item.leadDays ?? '', s.sched?.submitBy !== undefined ? toIso(s.sched.submitBy) : '',
      s.sched ? toIso(s.sched.forecast) : '', s.sched ? s.sched.float : '', s.sched?.threat === 'delays' ? 'Delays completion' : s.sched?.threat === 'at-risk' ? 'At risk' : '',
    ])
}
export const registerCsv = (states: ItemState[], specs: SpecSection[]) => toCsv([REGISTER_HEADERS, ...registerRows(states, specs)])

// ---------- Delay-notice evidence log ----------

export interface Evidence { key: string; label: string; title: string; firm: string; role: Role; sent: Day; due: Day; returned?: Day; allowed: number; late: number; cost: boolean; schedule: boolean; activity?: string }

/** Every reviewer hold that ran past its contractual period, open or closed, with the dates a claims consultant asks for. */
export function delayLog(states: ItemState[]): Evidence[] {
  const out: Evidence[] = []
  for (const s of states) for (const g of s.segs) {
    if (!REVIEWERS.includes(g.role) || g.late <= 0) continue
    out.push({ key: s.item.key, label: label(s), title: s.item.title, firm: g.firm, role: g.role, sent: g.from, due: g.dueAt, returned: g.open ? undefined : g.to, allowed: g.allowed, late: g.late, cost: s.item.costImpact, schedule: s.item.scheduleImpact, activity: s.linked ? `${s.linked.id} ${s.linked.name}` : undefined })
  }
  return out.sort((a, b) => b.late - a.late)
}

export function delayCsv(log: Evidence[]): string {
  return toCsv([['Item', 'Title', 'Held by', 'Party', 'Received by reviewer', 'Contract period (workdays)', 'Contractual due', 'Returned', 'Workdays beyond period', 'Cost impact', 'Schedule impact', 'Linked activity'],
    ...log.map(e => [e.label, e.title, e.firm, e.role, toIso(e.sent), e.allowed, toIso(e.due), e.returned !== undefined ? toIso(e.returned) : 'Still open', e.late, e.cost ? 'Yes' : 'No', e.schedule ? 'Yes' : 'No', e.activity ?? ''])])
}
