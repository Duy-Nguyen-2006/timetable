# PR6 — GUI Components for Interpretation Confirmation Flow

## Task ID: 6
## Agent: PR6 — GUI Components

## Summary
Implemented 4 GUI components for the interpretation confirmation flow, with full backward compatibility for existing TimetableApp.tsx usage.

## Files Modified
1. **`src/features/timetable/constraints/ConstraintInterpretationCard.tsx`** — New `ConstraintInterpretationCard` renders `InterpretationCardDTO` with scope/IF/THEN/notes sections; legacy `ConstraintInterpretationCardLegacy` preserved for backward compat
2. **`src/features/timetable/constraints/ConstraintThenEditor.tsx`** — New `ConstraintThenEditor` is an inline atom text editor; legacy `ConstraintThenEditorDialog` preserved
3. **`src/features/timetable/constraints/ConstraintReviewPanel.tsx`** — New `ConstraintReviewPanel` is the interpretation confirmation container; legacy `ConstraintReviewPanelLegacy` preserved
4. **`src/features/timetable/constraints/useConstraintReview.ts`** — New `useConstraintReview` is the confirmation state machine hook; legacy `useConstraintReviewLegacy` preserved
5. **`src/features/timetable/TimetableApp.tsx`** — Updated 3 imports to use legacy names

## Key Design Decisions
- New components are the default exports; legacy components kept as named exports
- `InterpretationCandidate` type kept for backward compatibility in ConstraintInterpretationCard.tsx
- `ConstraintReviewHydration` type kept for backward compatibility in useConstraintReview.ts
- No new TypeScript errors introduced; all existing tests pass
