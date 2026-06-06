// Single source of truth for AI pipeline component versions.
// Bumping any of these invalidates the relevant stage cache and is recorded in
// debug bundles so reproductions stay traceable across refactors.

export const PROMPT_VERSIONS = {
  translator: '4.0.0',
  planner: '3.0.0',
  coder: '3.3.0',
  repair: '3.1.0',
} as const;

export const SOLVER_TEMPLATE_VERSION = '1.5.0';

export const CONSTRAINT_REGISTRY_VERSION = '1.5.0';

/** IR schema version. Bump when grammar/atoms/quantifiers change. */
export const IR_SCHEMA_VERSION = '1.0.0';

export type PromptStage = keyof typeof PROMPT_VERSIONS;

export interface PipelineVersions {
  prompt: typeof PROMPT_VERSIONS;
  solverTemplate: string;
  constraintRegistry: string;
  irSchema: string;
}

export const PIPELINE_VERSIONS: PipelineVersions = {
  prompt: PROMPT_VERSIONS,
  solverTemplate: SOLVER_TEMPLATE_VERSION,
  constraintRegistry: CONSTRAINT_REGISTRY_VERSION,
  irSchema: IR_SCHEMA_VERSION,
};
