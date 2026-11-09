import { useEffect, useMemo, useState } from 'react'
import { asOfDay, burnDown, criticalThreats, impactRollup, itemStates, scorecards, snapshot, summarize, timeByRole } from './engine/analyze.ts'
import { generateSample, sampleConfig, SAMPLES } from './engine/sample.ts'
import type { Config, Dataset } from './engine/types.ts'
import { blankConfig, getData, getProjects, saveProject, useProjects, uuid, type Project } from './store.ts'
import { fmtDay } from './ui.tsx'

const sampleCache = new Map<string, Dataset>()
export function sampleData(id: string): Dataset | null {
  if (!SAMPLES.some(s => s.id === id)) return null
  if (!sampleCache.has(id)) sampleCache.set(id, generateSample(id))
  return sampleCache.get(id)!
}

export async function createSampleProject(sampleId: string): Promise<Project> {
  const existing = getProjects().find(p => p.sampleId === sampleId)
  if (existing) return existing
  const def = SAMPLES.find(s => s.id === sampleId)!
  const ds = sampleData(sampleId)!
  const config = sampleConfig(sampleId)
  // Three earlier Friday snapshots, so History has something to compare.
  const asOf = config.asOf!
  const snapshots = [21, 14, 7].map(back => {
    const c = { ...config, asOf: asOf - back }
    return snapshot(itemStates(ds, c), c.asOf, uuid(), `Week ending ${fmtDay(c.asOf)}`)
  })
  const now = Date.now()
  return saveProject({
    id: uuid(), name: def.name, createdAt: now, updatedAt: now, config, snapshots, sampleId,
    imports: [
      { id: uuid(), format: 'acc-rfi', fileName: 'synthetic RFI log', rows: ds.items.filter(i => i.kind === 'rfi').length, skipped: 0, at: now },
      { id: uuid(), format: 'acc-submittal', fileName: 'synthetic submittal log', rows: ds.items.filter(i => i.kind === 'submittal').length, skipped: 0, at: now },
      { id: uuid(), format: 'p6', fileName: 'synthetic schedule', rows: ds.activities.length, skipped: 0, at: now },
      { id: uuid(), format: 'specs', fileName: 'synthetic spec sections', rows: ds.specs.length, skipped: 0, at: now },
    ],
  })
}

export async function createBlankProject(name: string): Promise<Project> {
  const now = Date.now()
  return saveProject({ id: uuid(), name, createdAt: now, updatedAt: now, config: blankConfig(), snapshots: [], imports: [] })
}

export function useProject(id: string) {
  const list = useProjects()
  const project = list?.find(p => p.id === id) ?? null
  const [ds, setDs] = useState<Dataset | null>(null)
  const importsKey = project ? project.imports.map(i => i.id).join(',') : ''
  useEffect(() => {
    if (!project) return
    let live = true
    if (project.sampleId) { setDs(sampleData(project.sampleId)); return }
    void getData(project.id).then(d => { if (live) setDs(d ?? { items: [], activities: [], specs: [] }) })
    return () => { live = false }
  }, [project?.id, project?.sampleId, importsKey])
  const update = (patch: Partial<Project>) => project && saveProject({ ...project, ...patch })
  const setConfig = (patch: Partial<Config>) => project && saveProject({ ...project, config: { ...project.config, ...patch } })
  return { loading: list === null || (project !== null && ds === null), project, ds, update, setConfig, reload: (d: Dataset) => setDs(d) }
}

export type Analysis = NonNullable<ReturnType<typeof useAnalysis>>

export function useAnalysis(ds: Dataset | null, cfg: Config | undefined) {
  return useMemo(() => {
    if (!ds || !cfg) return null
    const asOf = asOfDay(cfg)
    const states = itemStates(ds, cfg)
    return {
      asOf, states,
      summary: summarize(states, asOf),
      roles: timeByRole(states),
      cards: scorecards(states),
      impacts: impactRollup(states),
      threats: criticalThreats(states),
      burn: burnDown(ds.items.filter(i => i.created <= asOf), asOf),
    }
  }, [ds, cfg])
}
