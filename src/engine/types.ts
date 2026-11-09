/** Dates are whole UTC day numbers (days since 1970-01-01). */
export type Day = number

export type Role = 'Architect' | 'Engineer' | 'Owner' | 'Subcontractor' | 'GC'
export const ROLES: Role[] = ['Architect', 'Engineer', 'Owner', 'Subcontractor', 'GC']
/** Roles that review and answer, as opposed to the contractor side. */
export const REVIEWERS: Role[] = ['Architect', 'Engineer', 'Owner']

export type Kind = 'rfi' | 'submittal'

/** One hand-off: from this day the ball was with this firm. */
export interface HistoryEvent { at: Day; bic: string; status?: string }

export interface Item {
  key: string            // kind:number, unique within a project
  kind: Kind
  number: string
  title: string
  open: boolean
  status: string
  created: Day
  due?: Day              // due date as exported
  bic?: string           // firm (or person) currently holding the ball
  reviewer?: string      // assigned reviewer firm
  sent?: Day             // sent to reviewer / submitted
  responded?: Day        // answered / returned by reviewer
  closed?: Day
  requiredOnSite?: Day
  leadDays?: number      // fabrication + delivery, calendar days
  revision: number
  spec?: string
  activity?: string      // schedule activity id
  costImpact: boolean
  scheduleImpact: boolean
  costValue?: number
  location?: string
  history?: HistoryEvent[]
}

export interface Activity { id: string; name: string; start: Day; finish?: Day; critical: boolean; totalFloat?: number }
export interface SpecSection { section: string; title: string }

export interface Config {
  asOf?: Day                          // analysis date; undefined = today
  gcName: string
  firms: Record<string, Role>         // firm or person -> role
  reviewDays: Record<Role, number>    // contractual period, business days
  holidays: Day[]
  reviewCycles: number                // review cycles assumed when back-calculating submit-by
  defaultLeadDays: number
  riskFloat: number                   // business days of float below which a linked item is "at risk"
  links: Record<string, string>       // item key -> activity id (manual overrides)
}

export interface Dataset { items: Item[]; activities: Activity[]; specs: SpecSection[] }
