# Decisions

Format: `- §ref — decision — why`. Every choice the spec did not dictate, plus blockers.

## Decisions
- plan §1 — Toolchain installed at current majors: TypeScript 6, Vite 8, Vitest 5, Zod 4, ESLint 10 (flat config), React 18.3 — plan fixes React 18; for the rest the latest versions installed cleanly.
- plan §0.1 — Czech-diacritics guard is a Vitest test (`tests/no-czech-in-src.test.ts`) rather than an ESLint rule — simpler, and it runs in the gate.
- plan §0.1 — ESLint forbids `Math.random`, `Date.now`, `window`, `document`, `localStorage` inside `src/core/` — enforces core purity mechanically.
- repo — `Gemini_Generated_Image_*.jpg` (a real politician's likeness) and `Mapa.png` (style reference) are left untracked and not used as assets — satire guardrail (no real likenesses); the map look borrows only the palette idea (dark ground, coloured regions, gold borders).

## Blockers
_None._

## Balance log
_Filled in P9._
