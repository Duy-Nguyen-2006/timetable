export type ConstraintSegment = {
  normalizedVi: string;
  scope?: {
    day?: string;
    class?: string;
  };
  shape: 'simple' | 'if_then';
  ifClause?: string;
  atoms: string[];
  droppedIllustrations: string[];
};
