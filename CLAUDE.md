# Budget Inc. — rules for Claude sessions

Source of truth: `budget-inc-spec.md` (v1.1). Execution order: `budget-inc-build-plan.md`. Tone: `budget-inc-brief.md`.

1. Work autonomously; record every non-spec decision as one line in `DECISIONS.md` (`- §ref — decision — why`).
2. Never invent game content (policy/event/ending/opportunity texts). Use `[DUMMY]`, `[FILLER]`, `[TODO]` (spec §11).
3. UI chrome is Czech and lives only in `locales/cs.json`. **No Czech strings in `src/`** — always `t('key')`.
4. Satire guardrail: only parody names (Kartin Mupka, Bander Abis, Lursula von der Eyen). No real names, no real likenesses.
5. `src/core/` is pure TS: no DOM, no React, no `Date.now()`, no `Math.random()` — use seeded streams in `core/rng.ts`.
6. Every tunable number lives in `src/config.ts`. Content lives in `data/*.json` (zod-validated in `src/data/`).
7. No network calls at runtime. Budget chapter names are never shown to the player.
8. Phase gate: `npm run typecheck && npm run lint && npm test && npm run build` (+ `npm run simulate -- --runs 200 --bot random`).
9. Commit after each phase: `phase N: <summary>`. Track phases in `PROGRESS.md`.
