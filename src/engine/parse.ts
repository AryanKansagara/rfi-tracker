import { dayOf, toIso } from './calendar.ts'
import type { Activity, Day, HistoryEvent, Item, Kind, SpecSection } from './types.ts'

// ---------- CSV ----------

export interface Table { rows: string[][]; lines: number[] }

export function parseCsv(text: string): Table {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const delim = sniffDelimiter(text)
  const rows: string[][] = []
  const lines: number[] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let line = 1
  let rowLine = 1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else {
        if (c === '\n') line++
        field += c
      }
      continue
    }
    if (c === '"' && field === '') quoted = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v.trim() !== '')) { rows.push(row); lines.push(rowLine) }
      row = []
      line++
      rowLine = line
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    if (row.some(v => v.trim() !== '')) { rows.push(row); lines.push(rowLine) }
  }
  return { rows, lines }
}

function sniffDelimiter(text: string): string {
  const head = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'))
  const counts = [',', '\t', ';', '|'].map(d => [d, head.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

/** Exports from Autodesk Build and Procore often put a title block above the header row. Finds the header (the first row with at least 3 known column names) and drops what is above it. */
export function findHeader(t: Table, known: Set<string>): Table {
  for (let r = 0; r < Math.min(t.rows.length, 15); r++) {
    const hits = t.rows[r].filter(h => known.has(norm(h))).length
    if (hits >= 3) return r === 0 ? t : { rows: t.rows.slice(r), lines: t.lines.slice(r) }
  }
  return t
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** ISO dates and timestamps, US M/D/YYYY, "Nov 3, 2026", "03-Nov-2026" (P6), "Mon 11/3/26" (MS Project), Excel serials. Returns a day number or NaN. Time-of-day is dropped: aging is counted in whole workdays. */
export function parseDate(raw: string): Day {
  let s = raw.trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '').replace(/\s*[AB]$/, '') // P6 marks actual/started dates with " A"
  if (!s || /^(n\/?a|none|null|-+)$/i.test(s)) return NaN
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/)
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2])
  m = s.match(/^(\d{1,2})[-\s]([a-z]{3})[a-z]*[-\s,]+(\d{2}|\d{4})\b/i)
  if (m && MONTHS.includes(m[2].toLowerCase())) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1])
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i)
  if (m && MONTHS.includes(m[1].toLowerCase())) return valid(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])
  if (/^\d{5}(\.\d+)?$/.test(s)) { const n = Math.floor(Number(s)); if (n > 20000 && n < 80000) return n - 25569 } // Excel serial
  return NaN
}
function valid(y: number, mo: number, d: number): Day {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return NaN
  const day = dayOf(y, mo, d)
  return toIso(day) === `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? day : NaN
}

export function parseNum(raw: string): number {
  const s = raw.trim().replace(/[,\s$]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (s === '' || /^null$/i.test(s)) return NaN
  const m = s.match(/^-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : NaN
}

/** Lead times arrive as "6 weeks", "30d", "45", "8 wks". Returns calendar days. */
export function parseLead(raw: string): number {
  const s = raw.trim().toLowerCase()
  const n = parseNum(s)
  if (Number.isNaN(n)) return NaN
  if (/w/.test(s)) return Math.round(n * 7)
  if (/mo/.test(s)) return Math.round(n * 30)
  return Math.round(n)
}

/** "Yes", "Yes ($12,500)", "TBD" and "Unknown" count as a potential impact; "No", "N/A" and blank do not. */
export const isImpact = (raw: string) => /^(y|yes|true|tbd|unknown|possible|1)\b/i.test(raw.trim())

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(v => {
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n') + '\n'
}

export const norm = (h: string) => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/[?()]/g, '').replace(/[\s\-./#]+/g, '_').replace(/^_+|_+$/g, '') || (h.trim() === '#' ? 'number' : '')

// ---------- Formats ----------

export type FileKind = 'items' | 'history' | 'schedule' | 'specs'
export type Format = 'acc-rfi' | 'acc-submittal' | 'procore-rfi' | 'procore-submittal' | 'generic-items' | 'history' | 'p6' | 'msp' | 'generic-schedule' | 'specs'

export const FORMATS: Record<Format, { label: string; kind: FileKind; itemKind?: Kind }> = {
  'acc-rfi': { label: 'Autodesk Build RFI log', kind: 'items', itemKind: 'rfi' },
  'acc-submittal': { label: 'Autodesk Build submittal log', kind: 'items', itemKind: 'submittal' },
  'procore-rfi': { label: 'Procore RFIs CSV', kind: 'items', itemKind: 'rfi' },
  'procore-submittal': { label: 'Procore submittals CSV', kind: 'items', itemKind: 'submittal' },
  'generic-items': { label: 'Generic RFI / submittal CSV', kind: 'items' },
  history: { label: 'Status / ball-in-court history', kind: 'history' },
  p6: { label: 'Primavera P6 activities (from XER)', kind: 'schedule' },
  msp: { label: 'Microsoft Project tasks CSV', kind: 'schedule' },
  'generic-schedule': { label: 'Generic schedule CSV', kind: 'schedule' },
  specs: { label: 'Spec section list', kind: 'specs' },
}

export interface FieldSpec { key: string; label: string; required?: boolean; aliases: string[] }

/** Normalized column names (lowercase, punctuation to underscores) as Autodesk Build, Procore, P6 and MS Project export them. Order matters: first alias found wins. */
export const FIELDS: Record<FileKind, FieldSpec[]> = {
  items: [
    { key: 'number', label: 'Number / ID', required: true, aliases: ['number', 'id', 'rfi_number', 'rfi', 'submittal_number', 'custom_identifier', 'item_number', 'no', 'ref'] },
    { key: 'title', label: 'Title / subject', required: true, aliases: ['title', 'subject', 'name', 'question', 'description'] },
    { key: 'created', label: 'Created / initiated', required: true, aliases: ['created_on', 'created_at', 'initiated_at', 'date_initiated', 'created', 'date_created', 'issue_date', 'opened', 'date'] },
    { key: 'type', label: 'Type (RFI or submittal)', aliases: ['item_type', 'record_type', 'type'] },
    { key: 'status', label: 'Status', aliases: ['status', 'workflow_status', 'state', 'closed'] },
    { key: 'bic', label: 'Ball in court', aliases: ['ball_in_court', 'ballincourt', 'bic', 'current_assignee', 'waiting_on', 'with'] },
    { key: 'reviewer', label: 'Reviewer / assigned to', aliases: ['assigned_to', 'assigned', 'reviewer', 'reviewers', 'approvers', 'approver', 'architect_reviewer', 'responsible_party', 'design_reviewer'] },
    { key: 'due', label: 'Due date', aliases: ['due_date', 'final_due_date', 'due', 'response_due', 'required_by'] },
    { key: 'sent', label: 'Sent to reviewer / submitted', aliases: ['submitted_on', 'sent_date', 'submitted_date', 'date_submitted', 'sent_on', 'received_date', 'submitted'] },
    { key: 'responded', label: 'Responded / returned', aliases: ['responded_on', 'response_date', 'latest_assignee_response_date', 'returned_date', 'returned_on', 'answered_on', 'date_returned', 'reviewed_on'] },
    { key: 'closed', label: 'Closed', aliases: ['closed_on', 'closed_date', 'date_closed', 'closed_at', 'distributed_on', 'distributed_date'] },
    { key: 'requiredOnSite', label: 'Required on site', aliases: ['required_on_job_date', 'required_on_site_date', 'required_on_site', 'on_site_date', 'required_onsite'] },
    { key: 'lead', label: 'Lead time', aliases: ['lead_time', 'lead_time_days', 'lead_days', 'lead_time_weeks', 'fabrication_lead_time'] },
    { key: 'revision', label: 'Revision', aliases: ['revision', 'rev', 'rev_no', 'revision_number'] },
    { key: 'spec', label: 'Spec section', aliases: ['spec_section', 'specification_section', 'spec', 'section', 'csi_code'] },
    { key: 'activity', label: 'Schedule activity', aliases: ['activity_id', 'schedule_activity', 'activity', 'task_id', 'linked_activity'] },
    { key: 'costImpact', label: 'Cost impact', aliases: ['cost_impact', 'cost_impact_', 'potential_cost_impact'] },
    { key: 'costValue', label: 'Cost impact value', aliases: ['cost_impact_value', 'cost_value', 'estimated_cost'] },
    { key: 'scheduleImpact', label: 'Schedule impact', aliases: ['schedule_impact', 'potential_schedule_impact'] },
    { key: 'location', label: 'Location', aliases: ['location', 'area', 'level'] },
  ],
  history: [
    { key: 'number', label: 'Number / ID', required: true, aliases: ['number', 'id', 'rfi_number', 'submittal_number', 'item', 'item_number', 'ref'] },
    { key: 'date', label: 'Date of change', required: true, aliases: ['date', 'changed_on', 'changed_at', 'event_date', 'timestamp', 'created_at', 'at'] },
    { key: 'bic', label: 'Ball in court after the change', required: true, aliases: ['ball_in_court', 'bic', 'to', 'assigned_to', 'new_ball_in_court', 'with'] },
    { key: 'type', label: 'Type (RFI or submittal)', aliases: ['item_type', 'type', 'kind'] },
    { key: 'status', label: 'Status after the change', aliases: ['status', 'new_status', 'action'] },
  ],
  schedule: [
    { key: 'id', label: 'Activity ID', required: true, aliases: ['task_code', 'activity_id', 'id', 'unique_id', 'wbs', 'code'] },
    { key: 'name', label: 'Activity name', required: true, aliases: ['task_name', 'activity_name', 'name', 'task', 'description'] },
    { key: 'start', label: 'Start', required: true, aliases: ['early_start', 'target_start_date', 'start', 'start_date', 'planned_start', 'act_start_date', 'restart_date'] },
    { key: 'finish', label: 'Finish', aliases: ['early_finish', 'target_end_date', 'finish', 'finish_date', 'end', 'planned_finish'] },
    { key: 'critical', label: 'Critical', aliases: ['critical', 'is_critical', 'driving_path_flag', 'critical_flag'] },
    { key: 'float', label: 'Total float (days)', aliases: ['total_float', 'total_float_hr_cnt', 'total_slack', 'float', 'tf'] },
  ],
  specs: [
    { key: 'section', label: 'Section number', required: true, aliases: ['section', 'spec_section', 'number', 'section_number', 'code'] },
    { key: 'title', label: 'Section title', required: true, aliases: ['title', 'name', 'section_title', 'description'] },
  ],
}

const KNOWN = new Set(Object.values(FIELDS).flat().flatMap(f => f.aliases))
export const findHeaderRow = (t: Table) => findHeader(t, KNOWN)

/** Header signatures, most specific first. */
export function detectFormat(headers: string[]): Format {
  const h = new Set(headers.map(norm))
  const any = (...k: string[]) => k.some(x => h.has(x))
  if (any('task_code', 'total_float_hr_cnt', 'target_start_date')) return 'p6'
  if (any('total_slack', 'unique_id') || (h.has('critical') && h.has('duration') && h.has('start'))) return 'msp'
  if (any('rfi_manager', 'received_from') && h.has('ball_in_court') && !any('spec_section', 'rev')) return 'procore-rfi'
  if (any('submittal_manager', 'responsible_contractor', 'final_due_date') && any('spec_section', 'rev')) return 'procore-submittal'
  if (h.has('ball_in_court') && any('required_on_job_date', 'lead_time', 'submittal_type', 'revision', 'rev') && !h.has('question')) return 'acc-submittal'
  if (h.has('ball_in_court') && any('created_on', 'assigned_to', 'question', 'official_response', 'custom_identifier')) return 'acc-rfi'
  if (any('changed_on', 'changed_at', 'new_ball_in_court', 'event_date') || (headers.length <= 5 && any('to', 'ball_in_court') && h.has('date'))) return 'history'
  if (any('start', 'start_date', 'early_start', 'planned_start') && any('activity_id', 'activity_name', 'task', 'task_name', 'name', 'finish')) return 'generic-schedule'
  if (headers.length <= 3 && any('section', 'section_number', 'spec_section') && any('title', 'name', 'section_title')) return 'specs'
  return 'generic-items'
}

export type Mapping = Record<string, number>

export function autoMap(headers: string[], kind: FileKind): Mapping {
  const hs = headers.map(norm)
  const map: Mapping = {}
  const used = new Set<number>()
  for (const f of FIELDS[kind]) {
    for (const a of f.aliases) {
      const i = hs.indexOf(a)
      if (i >= 0 && !used.has(i)) { map[f.key] = i; used.add(i); break }
    }
  }
  return map
}

// ---------- Validation ----------

export interface Issue { line: number; level: 'error' | 'warning'; message: string }
export interface Parsed {
  items: Item[]; history: { key: string; number: string; kind?: Kind; event: HistoryEvent }[]; activities: Activity[]; specs: SpecSection[]
  issues: Issue[]; skipped: number; total: number
}

const CLOSED = /\b(closed|void|voided|approved|no exceptions?|reviewed|distributed|complete[d]?|answered|accepted|responded|for record)\b/i
const REOPEN = /\b(revise|resubmit|rejected|not approved|open|draft|pending|in review|submitted|returned)\b/i
/** Status words that mean the item is finished. "Approved as noted" closes; "Revise and resubmit" does not. */
export function isClosedStatus(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (/^(yes|true)$/i.test(t)) return true // Procore "Closed?" column
  if (/revise|resubmit|reject/i.test(t)) return false
  return CLOSED.test(t) && !(REOPEN.test(t) && !/approved|closed/i.test(t))
}

const first = (s: string) => s.replace(/^\[|\]$/g, '').split(/[;|\n]|,(?=\s*[A-Z])/)[0].trim()

export function parseTable(t: Table, map: Mapping, format: Format, itemKind?: Kind): Parsed {
  const kind = FORMATS[format].kind
  const out: Parsed = { items: [], history: [], activities: [], specs: [], issues: [], skipped: 0, total: Math.max(0, t.rows.length - 1) }
  for (const f of FIELDS[kind]) if (f.required && !(f.key in map)) out.issues.push({ line: t.lines[0] ?? 1, level: 'error', message: `Required column "${f.label}" is not mapped` })
  if (out.issues.length) { out.skipped = out.total; return out }
  const get = (rec: string[], k: string) => map[k] === undefined ? '' : (rec[map[k]] ?? '').trim()
  const seen = new Map<string, number>()
  for (let r = 1; r < t.rows.length; r++) {
    const rec = t.rows[r]
    const line = t.lines[r]
    const skip = (message: string) => { out.issues.push({ line, level: 'error', message }); out.skipped++ }
    const warn = (message: string) => out.issues.push({ line, level: 'warning', message })
    const date = (k: string, label: string): Day | undefined => {
      const raw = get(rec, k)
      if (!raw) return undefined
      const d = parseDate(raw)
      if (Number.isNaN(d)) { warn(`${label} "${raw.slice(0, 30)}" is not a date; ignored`); return undefined }
      return d
    }

    if (kind === 'specs') {
      const section = get(rec, 'section'), title = get(rec, 'title')
      if (!section) { skip('Section number is empty'); continue }
      out.specs.push({ section, title })
      continue
    }

    if (kind === 'schedule') {
      const id = get(rec, 'id'), name = get(rec, 'name')
      if (!id) { skip('Activity ID is empty'); continue }
      const startRaw = get(rec, 'start')
      const start = parseDate(startRaw)
      if (Number.isNaN(start)) { skip(`Start "${startRaw.slice(0, 30)}" is not a date`); continue }
      const finish = date('finish', 'Finish')
      const fl = parseNum(get(rec, 'float'))
      // P6 stores float in hours (total_float_hr_cnt); convert at 8 h per day.
      const totalFloat = Number.isNaN(fl) ? undefined : format === 'p6' && norm((t.rows[0][map.float] ?? '')).includes('hr') ? Math.round(fl / 8) : Math.round(fl)
      const critRaw = get(rec, 'critical')
      const critical = critRaw ? /^(y|yes|true|1)/i.test(critRaw) : totalFloat !== undefined && totalFloat <= 0
      if (seen.has(id)) warn(`Activity ${id} appears twice; the later row wins`)
      seen.set(id, r)
      out.activities.push({ id, name: name || id, start, finish, critical, totalFloat })
      continue
    }

    if (kind === 'history') {
      const number = get(rec, 'number')
      const at = parseDate(get(rec, 'date'))
      const bic = first(get(rec, 'bic'))
      if (!number) { skip('Number is empty'); continue }
      if (Number.isNaN(at)) { skip(`Date "${get(rec, 'date').slice(0, 30)}" is not a date`); continue }
      if (!bic && !get(rec, 'status')) { skip('Neither ball in court nor status is given'); continue }
      const tk = get(rec, 'type')
      const k: Kind | undefined = /sub/i.test(tk) ? 'submittal' : /rfi/i.test(tk) ? 'rfi' : undefined
      out.history.push({ key: k ? `${k}:${number}` : number, number, kind: k, event: { at, bic, status: get(rec, 'status') || undefined } })
      continue
    }

    // Items
    const number = get(rec, 'number')
    const title = get(rec, 'title')
    if (!number) { skip('Number is empty'); continue }
    const createdRaw = get(rec, 'created')
    const created = parseDate(createdRaw)
    if (Number.isNaN(created)) { skip(`Created date "${createdRaw.slice(0, 30)}" is not a date`); continue }
    const tk = get(rec, 'type')
    const k: Kind = /sub|shop|product data|sample|mock/i.test(tk) ? 'submittal' : /rfi|request/i.test(tk) ? 'rfi' : itemKind ?? FORMATS[format].itemKind ?? ('spec' in map || 'revision' in map ? 'submittal' : 'rfi')
    const statusRaw = get(rec, 'status')
    const status = /^(yes|true)$/i.test(statusRaw) ? 'Closed' : /^(no|false)$/i.test(statusRaw) ? 'Open' : statusRaw
    const closed = date('closed', 'Closed date')
    const revRaw = get(rec, 'revision')
    const revision = Math.max(0, Number.isNaN(parseNum(revRaw)) ? 0 : Math.round(parseNum(revRaw)))
    const lead = get(rec, 'lead') ? parseLead(get(rec, 'lead')) : NaN
    if (get(rec, 'lead') && Number.isNaN(lead)) warn(`Lead time "${get(rec, 'lead')}" is not a number; the project default is used`)
    const cv = parseNum(get(rec, 'costValue'))
    const item: Item = {
      key: `${k}:${number}`, kind: k, number, title: title || '(untitled)', status: status || (closed !== undefined ? 'Closed' : 'Open'),
      open: !(closed !== undefined || isClosedStatus(status)), created, revision,
      due: date('due', 'Due date'), bic: first(get(rec, 'bic')) || undefined, reviewer: first(get(rec, 'reviewer')) || undefined,
      sent: date('sent', 'Sent date'), responded: date('responded', 'Response date'), closed,
      requiredOnSite: date('requiredOnSite', 'Required-on-site date'), leadDays: Number.isNaN(lead) ? undefined : lead,
      spec: get(rec, 'spec') || undefined, activity: get(rec, 'activity') || undefined,
      costImpact: isImpact(get(rec, 'costImpact')) || (!Number.isNaN(cv) && cv > 0), scheduleImpact: isImpact(get(rec, 'scheduleImpact')),
      costValue: Number.isNaN(cv) ? undefined : cv, location: get(rec, 'location') || undefined,
    }
    if (!title) warn('Title is empty')
    if (item.closed !== undefined && item.closed < created) { warn('Closed before it was created; closed date ignored'); item.closed = undefined }
    if (item.responded !== undefined && item.responded < created) { warn('Responded before it was created; response date ignored'); item.responded = undefined }
    if (item.open && item.closed === undefined && !item.bic) warn('Open item has no ball in court; it is counted against the reviewer')
    if (!item.open && item.closed === undefined) item.closed = item.responded ?? item.due ?? created
    // Procore lists each submittal revision as its own row; keep the latest revision per number.
    const prev = seen.get(item.key)
    if (prev !== undefined) {
      const old = out.items[prev]
      if (item.revision >= old.revision) {
        out.items[prev] = { ...item, revision: Math.max(item.revision, old.revision), created: Math.min(old.created, item.created) }
        if (item.revision === old.revision) warn(`${k === 'rfi' ? 'RFI' : 'Submittal'} ${number} appears twice; the later row wins`)
      }
      continue
    }
    seen.set(item.key, out.items.length)
    out.items.push(item)
  }
  return out
}

/** Attaches imported history to items (by key, or by number when the history file has no type column). Events are sorted and de-duplicated. */
export function attachHistory(items: Item[], hist: Parsed['history']): { items: Item[]; matched: number; unmatched: string[] } {
  const byKey = new Map(items.map(i => [i.key, i]))
  const byNum = new Map<string, Item[]>()
  for (const i of items) byNum.set(i.number, [...(byNum.get(i.number) ?? []), i])
  const add = new Map<string, HistoryEvent[]>()
  const unmatched = new Set<string>()
  for (const h of hist) {
    const targets = h.kind ? [byKey.get(h.key)].filter(Boolean) as Item[] : byNum.get(h.number) ?? []
    if (!targets.length) { unmatched.add(h.number); continue }
    for (const t of targets) add.set(t.key, [...(add.get(t.key) ?? []), h.event])
  }
  const out = items.map(i => {
    const ev = add.get(i.key)
    if (!ev) return i
    const all = [...(i.history ?? []), ...ev].sort((a, b) => a.at - b.at)
    const dedup = all.filter((e, n) => n === 0 || e.at !== all[n - 1].at || e.bic !== all[n - 1].bic)
    return { ...i, history: dedup }
  })
  return { items: out, matched: add.size, unmatched: [...unmatched] }
}

/** Merges by key; incoming rows win but keep any history already attached. */
export function mergeItems(old: Item[], incoming: Item[]): Item[] {
  const m = new Map(old.map(i => [i.key, i]))
  for (const i of incoming) m.set(i.key, { ...i, history: i.history ?? m.get(i.key)?.history })
  return [...m.values()].sort((a, b) => a.created - b.created || a.number.localeCompare(b.number, undefined, { numeric: true }))
}
