# Budget Inc. — rules for Claude sessions

Source of truth: `budget-inc-spec.md` (v1.1). Execution order: `budget-inc-build-plan.md`. Tone: `budget-inc-brief.md`.

1. Work autonomously; record every non-spec decision as one line in `DECISIONS.md` (`- §ref — decision — why`).
2. Never invent game content (policy/event/ending/opportunity texts). Use `[DUMMY]`, `[FILLER]`, `[TODO]` (spec §11).
3. UI chrome is Czech and lives only in `locales/cs.json`. **No Czech strings in `src/`** — always `t('key')`.
4. Satire guardrail: only parody names (Kartin Mupka, Bander Abis, Dezněk Břich, Flipflip Motůrek, Lursula von der Eyen). No real names, no real likenesses.
5. `src/core/` is pure TS: no DOM, no React, no `Date.now()`, no `Math.random()` — use seeded streams in `core/rng.ts`.
6. Every tunable number lives in `src/config.ts`. Content lives in `data/*.json` (zod-validated in `src/data/`).
7. No network calls at runtime. Budget chapter names and codes are never shown to the player; only the player-facing budget categories in `data/budget_items.json` are.
8. Phase gate: `npm run typecheck && npm run lint && npm test && npm run build` (+ `npm run simulate -- --runs 200 --bot random`).
9. Commit after each phase: `phase N: <summary>`. Track phases in `PROGRESS.md`.
10. Skill trees are a separate workspace (`SKILLTREE.md` lists the files: `data/upgrades/`, `locales/skilltree.cs.json`, `src/skilltree/`, `src/core/upgrades.ts`, `tests/skilltree.test.ts`), developed on branch `David`. Skill-tree work edits only those files plus the seams listed in `SKILLTREE.md`; other work does not edit them. Skill-tree texts and UI chrome live in `locales/skilltree.cs.json` (exception to rule 3).
11. Regions are a separate workspace (`REGIONS.md` lists the files: `data/regions.json`, `data/region_profiles.json`, `locales/regions.cs.json`, `src/regions/`, `src/core/regions.ts`, region tests), developed on branch `Danko2`. Region work edits only those files plus the seams listed in `REGIONS.md`; other work does not edit them. Region texts live in `locales/regions.cs.json` (exception to rule 3).
12. Catastrophes are a separate workspace (`CATASTROPHES.md` lists the files: `data/events/`, `data/catastrophes/`, `locales/events.cs.json`, `src/catastrophes/`, `src/core/chaos.ts`, `src/core/specialCards.ts`, `src/data/specialCards.ts`, `tests/specialCards.test.ts`), developed on branch `David`. Catastrophe work edits only those files plus the seams listed in `CATASTROPHES.md`; other work does not edit them. Event texts live in `locales/events.cs.json` (exception to rule 3).

## Verification scales with the change

- **Small tweaks** (tuning a value, adjusting an animation or style, a one-component fix, a follow-up to the last change): run only `npm run typecheck`, plus the test file that covers the touched code if one exists. Commit, push, start `npm run dev`, and give the user the local URL so they can check it themselves. No browser screenshot scripts, measurement runs, repeated test loops or waiting on the Pages deploy.
- **Big tasks** (a new mechanic, a phase from the build plan, work from a large spec or update document, anything touching `src/core/` rules or balance): run the full phase gate (rule 8) and do browser checks as needed.
- When unsure, treat it as small and say what was not verified.
