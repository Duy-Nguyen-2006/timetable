import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

import { buildInputPayload, toSolverProblem, estimateSolverConfig } from '../src/lib/timetable-prompt'
import { runSolverDirect } from '../src/lib/sandbox'

type Dataset = {
  id: number
  days: string
  time: string
  maxPeriods: number
  teachers: string[]
  subjects: string[]
  classes: string[]
  assignments: Array<{ teacher: string; subject: string; className: string; weeklyPeriods: number }>
  hardConstraints: string[]
  softConstraints: string[]
}

function parseDatasets(path: string): Dataset[] {
  const raw = readFileSync(path, 'utf8')
  const blocks = raw.split(/\n(?=DATASET\s+\d+)/g)
  const datasets: Dataset[] = []

  for (const block of blocks) {
    const idMatch = block.match(/DATASET\s+(\d+)/)
    if (!idMatch) continue

    const id = Number(idMatch[1])
    const lines = block.split('\n').map((l) => l.trim())

    const ds: Dataset = {
      id,
      days: '',
      time: '',
      maxPeriods: 0,
      teachers: [],
      subjects: [],
      classes: [],
      assignments: [],
      hardConstraints: [],
      softConstraints: [],
    }

    let section: '' | 'teachers' | 'subjects' | 'classes' | 'assignments' | 'hard' | 'soft' = ''

    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('Days:')) ds.days = line.replace('Days:', '').trim()
      else if (line.startsWith('Time:')) ds.time = line.replace('Time:', '').trim()
      else if (line.startsWith('Max periods:')) ds.maxPeriods = Number(line.replace('Max periods:', '').trim())
      else if (line === 'Teachers:') section = 'teachers'
      else if (line === 'Subjects:') section = 'subjects'
      else if (line === 'Classes:') section = 'classes'
      else if (line === 'Assignments:') section = 'assignments'
      else if (line === 'Hard constraints:') section = 'hard'
      else if (line === 'Soft constraints:') section = 'soft'
      else {
        if (section === 'teachers') ds.teachers.push(line)
        else if (section === 'subjects') ds.subjects.push(line)
        else if (section === 'classes') ds.classes.push(line)
        else if (section === 'hard') ds.hardConstraints.push(line)
        else if (section === 'soft') ds.softConstraints.push(line)
        else if (section === 'assignments') {
          const parts = line.split('-')
          if (parts.length === 4) {
            ds.assignments.push({
              teacher: parts[0],
              subject: parts[1],
              className: parts[2],
              weeklyPeriods: Number(parts[3]),
            })
          }
        }
      }
    }

    datasets.push(ds)
  }

  return datasets
}

function makeInput(ds: Dataset) {
  const days = [
    { id: 'monday', label: 'Thứ 2' },
    { id: 'tuesday', label: 'Thứ 3' },
    { id: 'wednesday', label: 'Thứ 4' },
    { id: 'thursday', label: 'Thứ 5' },
    { id: 'friday', label: 'Thứ 6' },
  ]

  const sessions = ds.time.toLowerCase().includes('morning-afternoon')
    ? [{ id: 'morning', label: 'Sáng' }, { id: 'afternoon', label: 'Chiều' }]
    : ds.time.toLowerCase().includes('afternoon')
      ? [{ id: 'afternoon', label: 'Chiều' }]
      : [{ id: 'morning', label: 'Sáng' }]

  const periodCounts: Record<string, number> = {}
  for (const s of sessions) periodCounts[s.id] = ds.maxPeriods

  return buildInputPayload({
    days,
    sessions,
    periodCounts,
    deletedPeriods: {},
    assignments: ds.assignments,
    constraints: [
      ...ds.hardConstraints.map((text) => ({ type: 'required' as const, text })),
      ...ds.softConstraints.map((text) => ({ type: 'preferred' as const, text })),
    ],
  })
}

async function benchOne(ds: Dataset) {
  const payload = makeInput(ds)
  const adaptive = toSolverProblem(payload, [])
  const legacy = toSolverProblem(payload, [])
  legacy.solverConfig = { maxTimeSeconds: 30, numWorkers: 8, randomSeed: 1 }

  const t1 = performance.now()
  const rAdaptive = await runSolverDirect(adaptive)
  const adaptiveMs = performance.now() - t1

  const t2 = performance.now()
  const rLegacy = await runSolverDirect(legacy)
  const legacyMs = performance.now() - t2

  return {
    id: ds.id,
    complexity: payload.slots.length * payload.assignments.length,
    adaptiveConfig: estimateSolverConfig(payload),
    adaptiveMs,
    legacyMs,
    adaptiveOk: rAdaptive.success,
    legacyOk: rLegacy.success,
    adaptiveStatus: rAdaptive.success ? rAdaptive.data.status : 'error',
    legacyStatus: rLegacy.success ? rLegacy.data.status : 'error',
  }
}

async function main() {
  const datasets = parseDatasets('./datasets.txt')
  const results = []
  for (const ds of datasets) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await benchOne(ds))
  }

  console.log(JSON.stringify({
    benchmark: 'adaptive_vs_legacy_solver_config',
    datasetCount: results.length,
    results,
  }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
