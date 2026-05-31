# Dependencies

Active contributors: Duy

This page lists the key external libraries and tools the project depends on, and why they were chosen.

## Frontend UI & primitives

- **Radix UI** (`@radix-ui/react-*`) + **Tailwind CSS 4** + **shadcn/ui** components
  - Used for all dialogs, labels, inputs, toasts, toggles, and tooltips.
  - The project deliberately uses headless primitives + Tailwind instead of a heavier component library so the visual design can stay extremely minimal and dark-themed.

- **lucide-react** — icon set used throughout the canvas and settings.

## State & data

- **Zustand** — lightweight client state for the wizard (the main canvas does not need a full Redux-style store).
- **@tanstack/react-query** — server state for the provider connectivity test (`/api/provider/test`).
- **zod** — runtime validation for LLM JSON responses and API payloads.
- **uuid** — stable IDs for assignments and constraints inside a single session.

## Export

- **xlsx** — used in `TimetableApp.tsx` (`handleDownloadExcel`) to produce the 4-sheet Excel artifact (by class, by teacher, by subject, raw data).

## LLM integration

- **openai** SDK (both browser and server)
  - The browser uses it for direct calls when possible; the server proxy (`/api/ai/chat`) uses it for OpenAI-compatible and Anthropic-with-caching paths.
  - The project supports multiple providers via a thin abstraction (`src/lib/provider.ts` + `chat-client.ts`).

## Python solver & validation

- **ortools** — Google OR-Tools CP-SAT solver. The only solver used for the actual timetable generation.
- **pytest** — Python test runner for the validator engine and sandbox tests.

## Desktop packaging

- **Electron 37** + **electron-builder**
  - Dual distribution: web (standalone Next.js) and desktop (AppImage/deb + NSIS/portable).
  - The Python runner is bundled via PyInstaller as an extra resource.

## Build & dev tooling

- **Next.js 16** (App Router) with standalone output.
- **TypeScript 5** (strict in most places, intentionally relaxed at the TS ↔ Python JSON boundary — see ESLint note below).
- **tsx** — zero-config TypeScript execution for tests and scripts.
- **ESLint** (Next.js core-web-vitals + TypeScript preset)
  - A long list of rules is deliberately turned off in `eslint.config.mjs` (including `@typescript-eslint/no-explicit-any`, `no-console`, `no-unused-vars`, etc.).
  - The stated reason in the repo is that the code frequently crosses the TypeScript ↔ Python JSON boundary, and overly strict rules would create more noise than value. The guideline is "avoid `any` everywhere except at the immediate Python bridge and deserialization sites."

## Sandbox isolation (security-critical)

- **Docker** (recommended for strongest isolation)
- **bubblewrap** (`bwrap`) — lightweight Linux namespace + seccomp sandbox (preferred on Linux when available for faster startup)
- No other sandbox technology is supported in production paths.

## Testing split

- TypeScript: Node's built-in test runner (`node --test` via `tsx`).
- Python: pytest.
- Prompt contract: custom script `scripts/validate_coder_prompt_models.ts` that feeds the four system prompts to the configured models and asserts on the JSON schema of the responses.

## What is deliberately *not* depended on

- No traditional feature flag system.
- No heavy state management library (Zustand is sufficient).
- No database (the app is intentionally stateless on the server; all durable state for the Harness lives in the local `harness.db` SQLite file managed by the Rust CLI).
- No GraphQL or complex API layer (the handful of Next.js routes are narrow bridges for LLM proxying and sandboxed Python execution).

This minimal dependency footprint is intentional: the hard parts of the product are the AI pipeline, deterministic validation, and the security contract around untrusted code execution — not the surrounding web framework or UI library.
