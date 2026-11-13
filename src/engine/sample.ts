// Two synthetic projects. Every firm, person and number here is invented.
import { Calendar, constructionHolidays, fromIso } from './calendar.ts'
import { DEFAULT_REVIEW_DAYS } from './analyze.ts'
import type { Activity, Config, Dataset, Day, HistoryEvent, Item, Role, SpecSection } from './types.ts'

export interface SampleDef { id: string; name: string; blurb: string; asOf: string; withHistory: boolean }

export const SAMPLES: SampleDef[] = [
  { id: 'mob', name: 'Riverside Medical Office Building', blurb: '5-storey MOB. The architect is slow on RFIs and the curtain-wall submittal is eating the critical path.', asOf: '2026-11-06', withHistory: true },
  { id: 'school', name: 'Lincoln Elementary Renovation', blurb: 'Occupied-school renovation. Owner decisions stall; dates only, no status history.', asOf: '2026-11-06', withHistory: false },
]

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

interface Firm { name: string; role: Role; median: number; spread: number }
interface Plan {
  gc: string; firms: Firm[]; specs: SpecSection[]; activities: Activity[]; holidays: Day[]
  rfiTopics: [string, string, string?][]      // title, reviewer firm, spec
  submittals: { spec: string; title: string; sub: string; reviewer: string; activity: string; lead: number; revs?: number; created?: string; sent?: string; stuck?: boolean }[]
  repeats: Record<string, string[]>          // later RFIs to each firm: everyday questions, {loc} filled per item
  locs: string[]
  start: string; rfiCount: number; seed: number
  stall: Role                                 // this party sits on a share of what it gets
}

const MOB: Plan = {
  gc: 'Halvorsen Builders', seed: 7, stall: 'Architect', start: '2026-05-04', rfiCount: 64,
  holidays: [...constructionHolidays(2026), ...constructionHolidays(2027)],
  firms: [
    { name: 'Kessler Ray Architects', role: 'Architect', median: 17, spread: 8 },
    { name: 'Brandt Structural Engineers', role: 'Engineer', median: 6, spread: 3 },
    { name: 'Northline MEP Engineers', role: 'Engineer', median: 8, spread: 4 },
    { name: 'Cascade Health Partners', role: 'Owner', median: 6, spread: 4 },
    { name: 'Apex Curtainwall', role: 'Subcontractor', median: 4, spread: 2 },
    { name: 'Summit Mechanical', role: 'Subcontractor', median: 3, spread: 2 },
    { name: 'Ironworks Steel', role: 'Subcontractor', median: 3, spread: 2 },
    { name: 'Brightline Electric', role: 'Subcontractor', median: 3, spread: 2 },
  ],
  specs: [
    ['03 30 00', 'Cast-in-place concrete'], ['05 12 00', 'Structural steel framing'], ['05 31 00', 'Steel decking'], ['07 21 00', 'Thermal insulation'],
    ['07 27 26', 'Fluid-applied air barrier'], ['07 54 23', 'TPO roofing'], ['07 84 13', 'Penetration firestopping'], ['08 11 13', 'Hollow metal doors and frames'],
    ['08 44 13', 'Glazed aluminum curtain walls'], ['08 71 00', 'Door hardware'], ['09 21 16', 'Gypsum board assemblies'], ['09 51 13', 'Acoustical panel ceilings'],
    ['09 65 19', 'Resilient tile flooring'], ['14 21 00', 'Electric traction elevators'], ['21 13 13', 'Wet-pipe sprinkler systems'], ['23 05 93', 'Testing, adjusting and balancing'],
    ['23 73 13', 'Modular indoor air handlers'], ['26 24 13', 'Switchboards'], ['26 51 00', 'Interior lighting'], ['28 31 11', 'Fire alarm'],
  ].map(([section, title]) => ({ section, title })),
  activities: [
    ['A1010', 'Foundations and slab on grade', '2026-05-11', '2026-07-03', true, 0],
    ['A1050', 'Steel erection L1-L5', '2026-07-06', '2026-09-25', true, 0],
    ['A1080', 'Metal deck and slabs L2-Roof', '2026-08-17', '2026-10-23', true, 0],
    ['A1200', 'Roofing 07 54 23', '2026-11-02', '2026-12-04', false, 12],
    ['A1300', 'Air barrier 07 27 26', '2026-11-09', '2027-01-15', false, 8],
    ['A1310', 'Curtain wall install L1-L5 (08 44 13)', '2026-12-14', '2027-03-05', true, 0],
    ['A1400', 'MEP rough-in L1-L5', '2026-10-19', '2027-02-12', false, 15],
    ['A1420', 'AHU set and connect (23 73 13)', '2027-01-11', '2027-02-05', true, 0],
    ['A1450', 'Switchgear set (26 24 13)', '2027-01-04', '2027-01-22', false, 6],
    ['A1500', 'Elevator install (14 21 00)', '2027-02-01', '2027-04-09', true, 0],
    ['A1600', 'Framing and drywall L1-L5', '2027-01-18', '2027-04-30', false, 10],
    ['A1650', 'Ceilings 09 51 13', '2027-03-15', '2027-05-14', false, 9],
    ['A1700', 'Flooring 09 65 19', '2027-04-19', '2027-05-28', false, 11],
    ['A1800', 'Fire alarm devices 28 31 11', '2027-03-22', '2027-05-07', false, 14],
    ['A1900', 'Doors and hardware (08 71 00)', '2027-04-05', '2027-05-21', false, 7],
    ['A1950', 'TAB and commissioning', '2027-05-24', '2027-06-25', true, 0],
    ['A2000', 'Substantial completion', '2027-07-02', '2027-07-02', true, 0],
  ].map(([id, name, s, f, critical, totalFloat]) => ({ id: id as string, name: name as string, start: fromIso(s as string), finish: fromIso(f as string), critical: critical as boolean, totalFloat: totalFloat as number })),
  rfiTopics: [
    ['Slab edge embed conflict at grid C/4', 'Brandt Structural Engineers', '03 30 00'], ['Curtain wall anchor spacing at slab edge', 'Kessler Ray Architects', '08 44 13'],
    ['Elevator pit depth vs geotech report', 'Brandt Structural Engineers', '14 21 00'], ['Exam room casework layout L3', 'Kessler Ray Architects'],
    ['Duct routing conflict with beam W18 at L2', 'Northline MEP Engineers', '23 73 13'], ['Fire-rated wall type at imaging suite', 'Kessler Ray Architects', '09 21 16'],
    ['Lead-lined wall extents in X-ray room', 'Kessler Ray Architects', '09 21 16'], ['Roof drain locations vs RTU curbs', 'Northline MEP Engineers', '07 54 23'],
    ['Air barrier transition at curtain wall sill', 'Kessler Ray Architects', '07 27 26'], ['Medical gas outlet heights', 'Northline MEP Engineers'],
    ['Lobby floor finish substitution', 'Cascade Health Partners', '09 65 19'], ['Generator pad size and conduit stub-ups', 'Northline MEP Engineers', '26 24 13'],
    ['Door hardware sets at clean utility rooms', 'Kessler Ray Architects', '08 71 00'], ['Ceiling height conflict in corridor L4', 'Kessler Ray Architects', '09 51 13'],
    ['Moment connection detail at stair 2', 'Brandt Structural Engineers', '05 12 00'], ['Sprinkler head layout at soffits', 'Northline MEP Engineers', '21 13 13'],
    ['Tenant signage blocking at entry canopy', 'Cascade Health Partners'], ['Curtain wall mullion color match to sample', 'Kessler Ray Architects', '08 44 13'],
    ['Lighting control zones in waiting areas', 'Northline MEP Engineers', '26 51 00'], ['Deck penetrations for med gas risers', 'Brandt Structural Engineers', '05 31 00'],
  ],
  repeats: {
    'Kessler Ray Architects': ['Missing dimension at {loc}', 'Partition type conflict at {loc}', 'Finish clarification at {loc}', 'Door frame elevation at {loc}', 'Ceiling height at {loc}', 'Casework backing at {loc}'],
    'Brandt Structural Engineers': ['Beam penetration for duct at {loc}', 'Embed plate detail at {loc}', 'Deck opening reinforcement at {loc}', 'Column base plate grout at {loc}'],
    'Northline MEP Engineers': ['Duct vs beam clearance at {loc}', 'Sprinkler main elevation at {loc}', 'Light fixture type at {loc}', 'Receptacle heights at {loc}', 'Plumbing chase width at {loc}'],
    'Cascade Health Partners': ['Owner finish selection for {loc}', 'Owner equipment rough-in at {loc}'],
  },
  locs: ['L2 corridor, grid C/3', 'L3 exam rooms east', 'L1 lobby', 'stair 2 landing L4', 'L5 mech room', 'grid E/7, L2', 'L4 nurse station', 'roof screen wall', 'L2 imaging suite', 'L3 clean utility', 'L1 loading dock'],
  submittals: [
    { spec: '08 44 13', title: 'Curtain wall shop drawings and calcs', sub: 'Apex Curtainwall', reviewer: 'Kessler Ray Architects', activity: 'A1310', lead: 70, revs: 2, created: '2026-07-20', sent: '2026-07-24', stuck: true },
    { spec: '08 44 13', title: 'Curtain wall finish samples', sub: 'Apex Curtainwall', reviewer: 'Kessler Ray Architects', activity: 'A1310', lead: 28, revs: 1, created: '2026-08-10' },
    { spec: '23 73 13', title: 'Air handling units product data', sub: 'Summit Mechanical', reviewer: 'Northline MEP Engineers', activity: 'A1420', lead: 84, revs: 1, created: '2026-08-03' },
    { spec: '26 24 13', title: 'Switchboards shop drawings', sub: 'Brightline Electric', reviewer: 'Northline MEP Engineers', activity: 'A1450', lead: 98, created: '2026-07-06' },
    { spec: '14 21 00', title: 'Elevator shop drawings and cab finishes', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1500', lead: 84, created: '2026-09-21' },
    { spec: '07 54 23', title: 'TPO roofing system product data', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1200', lead: 21, created: '2026-08-24' },
    { spec: '07 27 26', title: 'Air barrier product data and mockup', sub: 'Apex Curtainwall', reviewer: 'Kessler Ray Architects', activity: 'A1300', lead: 14, revs: 1, created: '2026-09-08' },
    { spec: '05 12 00', title: 'Structural steel shop drawings, sequence 3', sub: 'Ironworks Steel', reviewer: 'Brandt Structural Engineers', activity: 'A1050', lead: 35, created: '2026-05-18' },
    { spec: '05 31 00', title: 'Steel deck layout', sub: 'Ironworks Steel', reviewer: 'Brandt Structural Engineers', activity: 'A1080', lead: 28, created: '2026-06-08' },
    { spec: '09 21 16', title: 'Shaft wall assemblies', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1600', lead: 14 },
    { spec: '09 51 13', title: 'Acoustical ceiling panels and grid', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1650', lead: 35 },
    { spec: '09 65 19', title: 'Resilient flooring samples', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1700', lead: 42 },
    { spec: '08 71 00', title: 'Door hardware schedule', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1900', lead: 70, revs: 1, created: '2026-10-05' },
    { spec: '08 11 13', title: 'Hollow metal frames', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1900', lead: 56 },
    { spec: '28 31 11', title: 'Fire alarm shop drawings', sub: 'Brightline Electric', reviewer: 'Northline MEP Engineers', activity: 'A1800', lead: 35 },
    { spec: '26 51 00', title: 'Interior light fixtures', sub: 'Brightline Electric', reviewer: 'Northline MEP Engineers', activity: 'A1600', lead: 63, created: '2026-10-12' },
    { spec: '21 13 13', title: 'Sprinkler layout drawings', sub: 'Summit Mechanical', reviewer: 'Northline MEP Engineers', activity: 'A1400', lead: 21, created: '2026-08-31' },
    { spec: '23 05 93', title: 'TAB agency qualifications', sub: 'Summit Mechanical', reviewer: 'Northline MEP Engineers', activity: 'A1950', lead: 7 },
    { spec: '07 84 13', title: 'Firestopping systems', sub: 'Summit Mechanical', reviewer: 'Kessler Ray Architects', activity: 'A1400', lead: 10, created: '2026-09-14' },
    { spec: '03 30 00', title: 'Concrete mix designs', sub: 'Ironworks Steel', reviewer: 'Brandt Structural Engineers', activity: 'A1010', lead: 7, created: '2026-04-27' },
  ],
}

const SCHOOL: Plan = {
  gc: 'Morrow Construction', seed: 11, stall: 'Owner', start: '2026-06-15', rfiCount: 38,
  holidays: [...constructionHolidays(2026), ...constructionHolidays(2027)],
  firms: [
    { name: 'Fieldhouse Studio Architects', role: 'Architect', median: 7, spread: 3 },
    { name: 'Tidewater Engineering', role: 'Engineer', median: 7, spread: 3 },
    { name: 'Lincoln Unified School District', role: 'Owner', median: 12, spread: 6 },
    { name: 'Keystone Mechanical', role: 'Subcontractor', median: 3, spread: 2 },
    { name: 'Redline Electric', role: 'Subcontractor', median: 3, spread: 2 },
  ],
  specs: [
    ['02 41 19', 'Selective demolition'], ['02 82 00', 'Asbestos remediation'], ['06 10 00', 'Rough carpentry'], ['08 51 13', 'Aluminum windows'],
    ['09 30 00', 'Tiling'], ['09 91 23', 'Interior painting'], ['10 21 13', 'Toilet compartments'], ['11 66 23', 'Gymnasium equipment'],
    ['12 35 53', 'Laboratory casework'], ['23 81 26', 'Split-system air conditioners'], ['26 51 00', 'Interior lighting'], ['27 51 16', 'Public address systems'],
  ].map(([section, title]) => ({ section, title })),
  activities: [
    ['S100', 'Abatement wing B', '2026-06-22', '2026-07-31', true, 0],
    ['S200', 'Demolition wing B', '2026-08-03', '2026-08-28', true, 0],
    ['S300', 'Window replacement (08 51 13)', '2026-11-30', '2027-01-29', true, 0],
    ['S350', 'HVAC split systems (23 81 26)', '2026-12-07', '2027-02-05', false, 10],
    ['S400', 'Lighting retrofit (26 51 00)', '2027-01-04', '2027-02-26', false, 15],
    ['S450', 'PA system (27 51 16)', '2027-02-15', '2027-03-19', false, 20],
    ['S500', 'Science lab casework (12 35 53)', '2027-02-01', '2027-03-12', true, 0],
    ['S550', 'Restroom tile and partitions (09 30 00)', '2027-01-11', '2027-03-05', false, 8],
    ['S600', 'Gym equipment (11 66 23)', '2027-03-22', '2027-04-16', false, 12],
    ['S700', 'Paint and punch', '2027-04-05', '2027-05-28', true, 0],
    ['S800', 'Occupancy for fall term', '2027-06-04', '2027-06-04', true, 0],
  ].map(([id, name, s, f, critical, totalFloat]) => ({ id: id as string, name: name as string, start: fromIso(s as string), finish: fromIso(f as string), critical: critical as boolean, totalFloat: totalFloat as number })),
  rfiTopics: [
    ['Hidden asbestos in pipe chase room 112', 'Lincoln Unified School District', '02 82 00'], ['Window sill height at classroom 204', 'Fieldhouse Studio Architects', '08 51 13'],
    ['Existing lintel condition at east wall', 'Tidewater Engineering'], ['Owner-furnished smartboards: blocking', 'Lincoln Unified School District', '06 10 00'],
    ['Condensate routing for split systems', 'Tidewater Engineering', '23 81 26'], ['Lab fume hood exhaust path', 'Tidewater Engineering', '12 35 53'],
    ['Paint color schedule for corridors', 'Lincoln Unified School District', '09 91 23'], ['Restroom partition layout ADA clearances', 'Fieldhouse Studio Architects', '10 21 13'],
    ['PA speaker locations in gym', 'Tidewater Engineering', '27 51 16'], ['Phasing around summer school', 'Lincoln Unified School District'],
  ],
  repeats: {
    'Fieldhouse Studio Architects': ['Missing dimension at {loc}', 'Existing condition differs from drawings at {loc}', 'Finish clarification at {loc}'],
    'Tidewater Engineering': ['Existing duct reuse at {loc}', 'Circuit tie-in at {loc}', 'Existing beam bearing at {loc}'],
    'Lincoln Unified School District': ['Access to {loc} during school hours', 'Owner-furnished equipment at {loc}', 'Color selection for {loc}'],
  },
  locs: ['classroom 108', 'wing B corridor', 'gym east wall', 'science lab 214', 'cafeteria', 'restroom 120', 'library', 'main office', 'classroom 203'],
  submittals: [
    { spec: '08 51 13', title: 'Aluminum windows shop drawings', sub: 'Morrow Construction', reviewer: 'Fieldhouse Studio Architects', activity: 'S300', lead: 56, revs: 1, created: '2026-08-17' },
    { spec: '23 81 26', title: 'Split-system AC product data', sub: 'Keystone Mechanical', reviewer: 'Tidewater Engineering', activity: 'S350', lead: 42, created: '2026-09-08' },
    { spec: '26 51 00', title: 'LED fixture retrofit kits', sub: 'Redline Electric', reviewer: 'Tidewater Engineering', activity: 'S400', lead: 35, created: '2026-10-05' },
    { spec: '27 51 16', title: 'PA system equipment', sub: 'Redline Electric', reviewer: 'Tidewater Engineering', activity: 'S450', lead: 28 },
    { spec: '12 35 53', title: 'Lab casework shop drawings', sub: 'Morrow Construction', reviewer: 'Fieldhouse Studio Architects', activity: 'S500', lead: 70, created: '2026-09-28', stuck: true },
    { spec: '09 30 00', title: 'Tile samples', sub: 'Morrow Construction', reviewer: 'Lincoln Unified School District', activity: 'S550', lead: 28, created: '2026-10-12' },
    { spec: '10 21 13', title: 'Toilet partitions', sub: 'Morrow Construction', reviewer: 'Fieldhouse Studio Architects', activity: 'S550', lead: 35 },
    { spec: '11 66 23', title: 'Gym equipment', sub: 'Morrow Construction', reviewer: 'Fieldhouse Studio Architects', activity: 'S600', lead: 49 },
    { spec: '02 82 00', title: 'Abatement work plan', sub: 'Morrow Construction', reviewer: 'Lincoln Unified School District', activity: 'S100', lead: 5, created: '2026-06-01' },
    { spec: '09 91 23', title: 'Paint product data and colors', sub: 'Morrow Construction', reviewer: 'Lincoln Unified School District', activity: 'S700', lead: 14, revs: 2, created: '2026-08-24' },
  ],
}

export function sampleConfig(id: string): Config {
  const def = SAMPLES.find(s => s.id === id)!
  const plan = id === 'mob' ? MOB : SCHOOL
  return {
    asOf: fromIso(def.asOf), gcName: plan.gc,
    firms: Object.fromEntries([[plan.gc, 'GC'], ...plan.firms.map(f => [f.name, f.role])]),
    reviewDays: { ...DEFAULT_REVIEW_DAYS }, holidays: plan.holidays, reviewCycles: 2, defaultLeadDays: 28, riskFloat: 10, links: {},
  }
}

/** Builds a project by simulating each item's hand-offs with firm-specific turnaround, so the analysis has real signal to find. */
export function generateSample(id: string): Dataset {
  const def = SAMPLES.find(s => s.id === id)!
  const plan = id === 'mob' ? MOB : SCHOOL
  const r = rng(plan.seed)
  const cal = new Calendar(plan.holidays)
  const asOf = fromIso(def.asOf)
  const firm = (n: string) => plan.firms.find(f => f.name === n) ?? { name: n, role: 'GC' as Role, median: 2, spread: 1 }
  const turn = (f: Firm) => Math.max(1, Math.round(f.median + (r() + r() + r() - 1.5) * f.spread * 1.2))
  const items: Item[] = []
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]

  // RFIs: GC drafts, sends to a reviewer, who sometimes routes to another consultant, then answers; GC closes.
  const start = fromIso(plan.start)
  const span = asOf - start
  for (let n = 1; n <= plan.rfiCount; n++) {
    const topic = n <= plan.rfiTopics.length ? plan.rfiTopics[n - 1] : pick(plan.rfiTopics)
    const rep = plan.repeats[topic[1]]
    const title = n <= plan.rfiTopics.length ? topic[0] : rep[n % rep.length].replace('{loc}', plan.locs[(n * 7) % plan.locs.length])
    // More RFIs in the busy middle, a steady trickle in the last weeks.
    const created = cal.add(start + Math.floor(Math.pow(n / plan.rfiCount, 0.92) * (span - 3)), 0)
    const reviewer = firm(topic[1])
    const hist: HistoryEvent[] = [{ at: created, bic: plan.gc }]
    let t = cal.add(created, Math.floor(r() * 2))
    hist.push({ at: t, bic: reviewer.name, status: 'Open' })
    const due = cal.add(t, reviewer.role === 'Owner' ? 5 : 10)
    // Architect forwards a share of RFIs to the engineer of record.
    if (reviewer.role === 'Architect' && r() < 0.25) {
      t = cal.add(t, Math.max(1, Math.round(turn(reviewer) / 3)))
      const eng = plan.firms.find(f => f.role === 'Engineer')!
      hist.push({ at: t, bic: eng.name, status: 'Open' })
      t = cal.add(t, turn(eng))
      hist.push({ at: t, bic: reviewer.name, status: 'Open' })
      t = cal.add(t, Math.max(1, Math.round(turn(reviewer) / 2)))
    } else t = cal.add(t, turn(reviewer) + (reviewer.role === plan.stall && (n % 5 === 1 || (created > asOf - 55 && r() < 0.55)) ? 16 + Math.floor(r() * 16) : 0))
    const responded = t
    const closed = cal.add(responded, 1 + Math.floor(r() * 3))
    const isOpen = responded >= asOf || closed > asOf
    const answered = responded < asOf
    if (answered) hist.push({ at: responded, bic: plan.gc, status: 'Answered' })
    if (!isOpen) hist.push({ at: closed, bic: plan.gc, status: 'Closed' })
    const events = hist.filter(e => e.at <= asOf)
    const last = events.at(-1)!
    const spec = topic[2]
    const costy = r() < 0.22, sched = r() < (spec === '08 44 13' ? 1 : 0.18)
    items.push({
      key: `rfi:${n}`, kind: 'rfi', number: String(n), title, status: isOpen ? (answered ? 'Answered' : 'Open') : 'Closed', open: isOpen, created,
      due, bic: isOpen ? last.bic : undefined, reviewer: reviewer.name, sent: hist[1].at <= asOf ? hist[1].at : undefined,
      responded: answered ? responded : undefined, closed: isOpen ? undefined : closed, revision: 0, spec,
      costImpact: costy, scheduleImpact: sched, costValue: costy ? Math.round(2 + r() * 40) * 500 : undefined,
      history: def.withHistory ? events : undefined,
    })
  }

  // Submittals: sub prepares, GC reviews and forwards, reviewer returns; some come back "Revise and resubmit".
  plan.submittals.forEach((s, i) => {
    const act = plan.activities.find(a => a.id === s.activity)!
    const reviewer = firm(s.reviewer)
    const lead = s.lead
    const created = s.created ? fromIso(s.created) : cal.add(Math.min(asOf - 4 - i * 2, act.start - lead - 70), 0)
    const number = `${s.spec}-${String(i + 1).padStart(3, '0')}`
    const hist: HistoryEvent[] = [{ at: created, bic: s.sub }]
    let t = s.sent ? fromIso(s.sent) : cal.add(created, 2 + Math.floor(r() * 6))
    let rev = 0
    let status = 'Open'
    let responded: Day | undefined
    let sent: Day | undefined
    let due: Day | undefined
    const revs = s.revs ?? 0
    for (;;) {
      if (t > asOf) { status = rev ? `Revise and resubmit (Rev ${rev - 1})` : 'Draft'; break }
      sent = t
      hist.push({ at: t, bic: reviewer.name, status: rev ? `Resubmitted Rev ${rev}` : 'Submitted' })
      due = cal.add(t, reviewer.role === 'Owner' ? 5 : 10)
      let back = cal.add(t, s.stuck && rev === revs ? turn(reviewer) + 30 : turn(reviewer))
      if (back > asOf) { status = 'In review'; break }
      responded = back
      if (rev < revs) {
        hist.push({ at: back, bic: s.sub, status: 'Revise and resubmit' })
        rev++
        t = cal.add(back, 3 + Math.floor(r() * 8))
        continue
      }
      hist.push({ at: back, bic: plan.gc, status: 'Approved as noted' })
      const dist = cal.add(back, 1 + Math.floor(r() * 2))
      if (dist <= asOf) { hist.push({ at: dist, bic: plan.gc, status: 'Closed' }); status = 'Closed' } else status = 'Approved as noted'
      back = dist
      break
    }
    const events = hist.filter(e => e.at <= asOf)
    const isOpen = status !== 'Closed'
    items.push({
      key: `submittal:${number}`, kind: 'submittal', number, title: s.title, status, open: isOpen, created, due,
      bic: isOpen ? events.at(-1)!.bic : undefined, reviewer: reviewer.name, sent,
      responded: status.startsWith('Approved') || status === 'Closed' || status.startsWith('Revise') ? responded : undefined,
      closed: isOpen ? undefined : events.at(-1)!.at, revision: rev, spec: s.spec, activity: act.id, leadDays: lead,
      requiredOnSite: act.start, costImpact: false, scheduleImpact: !!s.stuck,
      history: def.withHistory ? events : undefined,
    })
  })

  return { items: items.sort((a, b) => a.created - b.created), activities: plan.activities, specs: plan.specs }
}
