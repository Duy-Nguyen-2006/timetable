import type { AIProviderConfig, AgentInputPayload } from './types'

export type PreflightCheck = {
  id: string
  label: string
  ok: boolean
  detail?: string
}

export interface PreflightOutcome {
  ok: boolean
  checks: PreflightCheck[]
  blockingMessage?: string
}

export function checkProviderConfigured(config: Partial<AIProviderConfig> | null | undefined): PreflightCheck {
  const ok = Boolean(config?.baseURL && config?.apiKey && config?.model)
  return {
    id: 'provider',
    label: 'AI provider đã cấu hình',
    ok,
    detail: ok ? undefined : 'Vào Cài đặt và nhập Base URL, API Key, Model.',
  }
}

export function checkAssignments(input: AgentInputPayload | null | undefined): PreflightCheck {
  const count = input?.assignments?.length ?? 0
  return {
    id: 'assignments',
    label: `Có ${count} phân công`,
    ok: count > 0,
    detail: count === 0 ? 'Cần ít nhất 1 phân công giáo viên - môn - lớp.' : undefined,
  }
}

export function checkActivePeriods(input: AgentInputPayload | null | undefined): PreflightCheck {
  const days = input?.days?.length ?? 0
  const totalPeriods = Object.values(input?.periodCounts ?? {}).reduce(
    (sum, v) => sum + (typeof v === 'number' ? v : 0),
    0,
  )
  const deletedCount = Object.values(input?.deletedPeriods ?? {}).filter(Boolean).length
  const ok = days > 0 && totalPeriods > 0 && deletedCount < days * totalPeriods
  return {
    id: 'periods',
    label: `Có ${days} ngày, tổng ${totalPeriods} tiết`,
    ok,
    detail: ok ? undefined : 'Khôi phục ít nhất một ô tiết ở trang xem trước.',
  }
}

export function checkRoster(input: AgentInputPayload | null | undefined): PreflightCheck {
  const teachers = new Set<string>()
  const subjects = new Set<string>()
  const classes = new Set<string>()
  for (const a of input?.assignments ?? []) {
    if (a.teacher?.id) teachers.add(a.teacher.id)
    if (a.subject?.id) subjects.add(a.subject.id)
    if (a.class?.id) classes.add(a.class.id)
  }
  const ok = teachers.size > 0 && subjects.size > 0 && classes.size > 0
  return {
    id: 'roster',
    label: `Có ${teachers.size} GV, ${subjects.size} môn, ${classes.size} lớp`,
    ok,
    detail: ok ? undefined : 'Cần ít nhất một giáo viên, một môn và một lớp.',
  }
}

export function checkSolverRuntime(opts: {
  mode?: string
  bundledAvailable?: boolean
  dockerAvailable?: boolean
}): PreflightCheck {
  const mode = opts.mode ?? 'bundled'
  if (mode === 'docker') {
    return {
      id: 'solver-runtime',
      label: 'Docker sandbox sẵn sàng',
      ok: Boolean(opts.dockerAvailable),
      detail: opts.dockerAvailable
        ? undefined
        : 'Docker chưa khả dụng. Bật Docker hoặc chuyển sang chế độ Bundled.',
    }
  }
  if (mode === 'bundled') {
    return {
      id: 'solver-runtime',
      label: 'Bundled solver sẵn sàng',
      ok: opts.bundledAvailable !== false,
      detail:
        opts.bundledAvailable === false
          ? 'Không tìm thấy code_executor binary. Cài lại app hoặc dùng chế độ System Python.'
          : undefined,
    }
  }
  return {
    id: 'solver-runtime',
    label: 'System Python (dev mode)',
    ok: true,
    detail: 'Chỉ dùng trong môi trường dev có sẵn python3.',
  }
}

export function buildPreflight(opts: {
  config: Partial<AIProviderConfig> | null | undefined
  input: AgentInputPayload | null | undefined
  runtime?: {
    mode?: string
    bundledAvailable?: boolean
    dockerAvailable?: boolean
  }
}): PreflightOutcome {
  const checks: PreflightCheck[] = [
    checkProviderConfigured(opts.config),
    checkAssignments(opts.input),
    checkRoster(opts.input),
    checkActivePeriods(opts.input),
    checkSolverRuntime({
      mode: opts.runtime?.mode ?? opts.config?.solverRuntimeMode,
      bundledAvailable: opts.runtime?.bundledAvailable,
      dockerAvailable: opts.runtime?.dockerAvailable,
    }),
  ]
  const failed = checks.filter((c) => !c.ok)
  return {
    ok: failed.length === 0,
    checks,
    blockingMessage: failed.length === 0
      ? undefined
      : `Không thể chạy solver: ${failed.map((c) => c.detail || c.label).join(' • ')}`,
  }
}
