import type { ConfirmedConstraint, ParsedConstraintDraft } from '../ai/constraint-review-types';
import { stableHash } from '../ai/local-agent-utils';
import type { AgentInputPayload } from '../ai/types';
import type { ConstraintItem } from '../types';

export const CONSTRAINT_WORKSPACE_STORAGE_KEY = 'timetable_constraint_workspace_v1';

/** Legacy: chỉ danh sách ConstraintItem (trước review flow). */
export const LEGACY_CONSTRAINT_LIST_KEY = 'tack_constraint_list';

export type ConstraintWorkspacePersisted = {
  version: 1;
  constraintList: ConstraintItem[];
  constraintDrafts: ParsedConstraintDraft[];
  confirmedConstraints: ConfirmedConstraint[];
  datasetSignature: string;
};

export function buildDatasetSignature(input: Pick<AgentInputPayload, 'assignments' | 'days' | 'sessions' | 'periodCounts' | 'deletedPeriods'>): string {
  return stableHash({
    assignments: input.assignments.map((a) => ({
      id: a.id,
      teacher: a.teacher.label,
      subject: a.subject.label,
      class: a.class.label,
      weeklyPeriods: a.weeklyPeriods,
    })),
    days: input.days,
    sessions: input.sessions,
    periodCounts: input.periodCounts,
    deletedPeriods: input.deletedPeriods,
  });
}

/** Migrate legacy list → workspace without auto-confirm hard rules. */
export function migrateLegacyConstraintList(legacy: ConstraintItem[]): Omit<ConstraintWorkspacePersisted, 'datasetSignature'> & { datasetSignature?: string } {
  return {
    version: 1,
    constraintList: legacy,
    constraintDrafts: [],
    confirmedConstraints: [],
  };
}

export function readConstraintWorkspace(): ConstraintWorkspacePersisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSTRAINT_WORKSPACE_STORAGE_KEY);
    if (!raw) return tryMigrateLegacyOnly();
    const parsed = JSON.parse(raw) as ConstraintWorkspacePersisted;
    if (parsed?.version !== 1 || !Array.isArray(parsed.constraintList)) return tryMigrateLegacyOnly();
    return {
      version: 1,
      constraintList: parsed.constraintList,
      constraintDrafts: Array.isArray(parsed.constraintDrafts) ? parsed.constraintDrafts : [],
      confirmedConstraints: Array.isArray(parsed.confirmedConstraints) ? parsed.confirmedConstraints : [],
      datasetSignature: typeof parsed.datasetSignature === 'string' ? parsed.datasetSignature : '',
    };
  } catch {
    return tryMigrateLegacyOnly();
  }
}

function tryMigrateLegacyOnly(): ConstraintWorkspacePersisted | null {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_CONSTRAINT_LIST_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw) as ConstraintItem[];
    if (!Array.isArray(legacy)) return null;
    const migrated = migrateLegacyConstraintList(legacy);
    return {
      ...migrated,
      datasetSignature: '',
    };
  } catch {
    return null;
  }
}

export function writeConstraintWorkspace(workspace: ConstraintWorkspacePersisted): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONSTRAINT_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    localStorage.removeItem(LEGACY_CONSTRAINT_LIST_KEY);
  } catch {
    /* quota / private mode */
  }
}

/** Nếu dataset đổi, giữ text list nhưng xóa draft/confirm (an toàn). */
export function reconcileWorkspaceWithDataset(
  workspace: ConstraintWorkspacePersisted,
  currentSignature: string
): ConstraintWorkspacePersisted {
  if (!workspace.datasetSignature || workspace.datasetSignature === currentSignature) {
    return { ...workspace, datasetSignature: currentSignature };
  }
  return {
    ...workspace,
    datasetSignature: currentSignature,
    constraintDrafts: [],
    confirmedConstraints: [],
  };
}
