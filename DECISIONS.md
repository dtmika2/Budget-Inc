# Decisions

Format: `- §ref — decision — why`. Every choice the spec did not dictate, plus blockers.

## Decisions
- plan §1 — Toolchain installed at current majors: TypeScript 6, Vite 8, Vitest 5, Zod 4, ESLint 10 (flat config), React 18.3 — plan fixes React 18; for the rest the latest versions installed cleanly.
- plan §0.1 — Czech-diacritics guard is a Vitest test (`tests/no-czech-in-src.test.ts`) rather than an ESLint rule — simpler, and it runs in the gate.
- plan §0.1 — ESLint forbids `Math.random`, `Date.now`, `window`, `document`, `localStorage` inside `src/core/` — enforces core purity mechanically.
- repo — `Gemini_Generated_Image_*.jpg` (a real politician's likeness) and `Mapa.png` (style reference) are left untracked and not used as assets — satire guardrail (no real likenesses); the map look borrows only the palette idea (dark ground, coloured regions, gold borders).
- P1.4 / spec §12.4 — Map built from GISCO NUTS3 2021 at **1:3M** (not 1:20M) and quantised to 0.1 px instead of per-region simplification — 1:20M has only 10–27 vertices per kraj (visibly crude); quantising keeps shared borders gap-free; the file is still small (23.5 KB). `npm run build:map -- --scale 20M` switches back. The download is cached in `.map-cache/` (gitignored).
- §9.2 — Data files are bundled by Vite (`import.meta.glob('data/**/*.json')`) at build time; the loader itself is environment-agnostic (`src/data/loader.ts`), with a Node adapter in `scripts/lib/nodeData.ts` — no runtime network calls; swapping `data/budget.json` needs only a rebuild, no code change.
- §11 — Filler content lives in files whose name starts with `_` (`_filler.json`); `config.includeDevFiller` decides whether such files are loaded.
- §6.2 — `effects.finances` in data is accepted as an alias of `effects.financesExtra` (normalised by the loader) — the card template in the brief lists "Finances" as a resource effect.
- §7.3 — The validator requires each event's `default` response to exist and to cost 0 PC — a timed-out response must always be applicable.
- §5.3 — Card-count check: warning when a leader has < 18 non-filler cards; error when it has < 3 cards in total (filler included, since filler makes runs possible).
- §4.5 — Ending texts are `[TODO]`; titles are `[TODO] Konec: <group>` — design intent exists in the spec, but final text is content.
- §11 — Dummy budget-vote labels are `[DUMMY] Úsporný/Vyrovnaný/Štědrý rozpočet` with numbers following the spec's design intent (tight −3 % all expenditure, balanced −1 %, generous +2 %).
- §12.3 — "Jak hrát" rules summary is written as UI chrome in `cs.json` (it explains mechanics, it is not game content); tutorial bodies stay `[TODO]` as the spec says.
- plan P1.7 — Filler generator: 22 cards per leader (one per leaning, the rest by leader weights), each with 2–3 resource ranges (one primary gain), 1–3 anger ranges (a trade-off), 1–2 budget changes sized to move Finances by 1–5 points, ~30 % ongoing, 1 filler event each (~1/3 respondable; option `c` = do nothing is the default).

## Blockers
_None._

## Balance log
_Filled in P9._
