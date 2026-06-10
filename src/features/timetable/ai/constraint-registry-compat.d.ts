import type { ConstraintKind as ConstraintKindFromSpec } from './constraint-spec';

declare module './constraint-registry' {
  export type ConstraintKind = ConstraintKindFromSpec;
}

export {};
