# Test Matrix

This file maps product behavior to proof.

No product behavior has been defined or implemented yet. Do not mark a row
implemented until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-013 | IR type checker accepts valid quantifier placeholders and rejects domain mismatches | yes | yes | no | no | implemented | `npm run test:grep -- ir-type-checker`; `npm run test:grep -- kind-to-ir` |
| US-014 | IR Humanizer V2 renders supported Phase 1.1 shapes as deterministic Vietnamese | yes | yes | no | no | implemented | `npm run test:grep -- ir-humanizer-v2` |
| US-015 | Reparse candidates with custom IR are schema- and semantic-validated before confirmation | yes | yes | no | no | implemented | `npm run test:grep -- reparse-candidate-validator` |
| US-016 | IR-first Tier-1 parser preserves canonical IR and legacy comparison params for common patterns | yes | yes | no | no | implemented | `npm run test:grep -- ir-first-parser` |
| US-017 | Parse pipeline logs IR-first shadow divergence without changing legacy output | yes | yes | no | no | implemented | `npm run test:grep -- parse-pipeline` |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
