# Catastrophes: separate workspace

Catastrophes (chaos events and their pop-up cards, including the new special catastrophe cards) live in
their own files, so they can be developed on their own branch while regions and the rest of the game are
developed elsewhere without merge conflicts. Catastrophe work edits only the files below; other work does
not edit them.

## Catastrophe files

| File | What it holds |
|---|---|
| `data/events/*.json` | chaos events: chance, window, effects, responses (`dummy.json`; `_filler.json` is generated) |
| `locales/events.cs.json` | Czech texts: event texts and responses (`event.*`) and the response pop-up chrome (`response.*`) |
| `src/catastrophes/` | pop-up stack with news and response pop-ups (`PopupStack.tsx`), styles (`catastrophes.css`), entry point (`index.ts`) |
| `src/core/chaos.ts` | scheduling chaos events when a card is picked, firing them, responses |
| `data/catastrophes/*.json` | special cards: catastrophes and special agents (`dummy.json`, `[DUMMY]` texts) |
| `src/core/specialCards.ts` | special cards: yearly draw, warnings, the check, sanction / bonus, accept / close |
| `src/data/specialCards.ts` | special-card schema and data checks (called from the loader) |
| `src/catastrophes/Layer.tsx` | the workspace's mount point: `PopupStack` = news pop-ups + special-card warnings + the special card |
| `src/catastrophes/SpecialCard.tsx`, `CatastropheFx.tsx`, `AgentFx.tsx`, `SpecialWarnings.tsx`, `specialText.ts` | the special card (drop + earthquake / flip + shine), the warning banner, condition texts |
| `special.html`, `src/catastrophes/preview/` | preview page: the game screen, paused, with a panel that opens any special card (`forceOpenSpecial`) |
| `tests/specialCards.test.ts` | special-card tests |

Special-card texts (`special.*`) also live in `locales/events.cs.json`.

`data/events/_filler.json` and the `event.filler_*` texts are rewritten by `npm run gen:filler`; put real
events in another file (for example `data/events/catastrophes.json`).

## Special cards: catastrophes and special agents

A special card is one card the player cannot refuse. It checks the state at the moment it fires:
- **Catastrophe:** check failed → `onFail` (sanction); check passed → nothing.
- **Special agent:** check passed → `onPass` (bonus); check failed → nothing.

Every game year (Q1, Q5, Q9, Q13) draws `config.specials.catastrophesPerYear` catastrophes and
`agentsPerYear` agents on random days, at least `minGapDays` apart (own RNG stream `specials`). A banner on
the map announces each card `warnDays` before it fires, showing what it will check. When it fires, the game
pauses (phase `special`): the card animates in, "Přijmout" runs the check and reveals the result, and
"Pokračovat" lets the game run on.

```jsonc
{ "id": "dummy_cat_finances",
  "kind": "catastrophe",                     // or "agent"
  "title": "special.dummy_cat_finances.title",  // keys in locales/events.cs.json
  "text": "special.dummy_cat_finances.text",
  "condition": { "type": "resource", "resource": "finances", "op": "gte", "value": 40 },
  "onFail": { "effects": { "support": { "min": -6, "max": -3 } } },   // catastrophe: sanction
  // agent: "onPass": { … } instead (bonus). Both are normal effect bundles: effects, anger, ongoing, pc, regions, budgetChanges
  "weight": 1,                                // optional: how often it is drawn
  "availableFor": ["mupka"] }                 // optional: only these leaders
```

Conditions (`op` is `gte` = at least, `lte` = at most):
- `{ "type": "resource", "resource": "finances" | "support" | "coalition" | "prestige", … }`
- `{ "type": "anger", "group": "oligarchs" | "pensioners" | "media" | "eu" | "activists", … }`
- `{ "type": "pc", … }` (Political Capital)
- `{ "type": "region", "region": "CZ080", … }` (support in one kraj)

Unit tests that are not about special cards run without them (`gameData()` in `tests/helpers.ts`), because
a card stops the clock on a random day; `fullGameData()` includes them.

### Seams into the shared code

The rest of the game touches catastrophes only here. Changing a seam means touching a shared file, so keep
those changes small and tell the other side:

- `src/ui/screens/Game.tsx` renders `PopupStack` from `@/catastrophes`.
- `src/ui/store.ts` turns log entries into pop-ups (`popupFor`: `chaos_fired` and every other kind of news),
  queues and times them out, and dispatches responses (`respond`). The `Popup` type and `visiblePopups` live there.
- `src/core/simulation.ts` calls `scheduleChaosForPick`, `fireChaos`, `canRespond` and `respond`;
  `src/core/scheduler.ts` holds the queue.
- `src/core/types.ts` (`ChaosEventDef`), `src/data/schemas.ts` (`eventSchema`) and `src/data/loader.ts`
  (event checks); `config.chaos` and `config.popups` in `src/config.ts`.
- Policy cards point to events through `chaosEvents` (`data/policies/*.json`, shared content).
- Shared pop-up pieces stay shared: `src/ui/popups/DeltaList.tsx`, `src/ui/popups/Floaters.tsx`,
  `src/ui/modals/RangeChips.tsx`, and the pop-up titles and texts other mechanics use (`popup.*` in
  `locales/cs.json`, including `popup.chaos`).
- The living map reacts to chaos events (blackouts) in `src/regions/` (regions workspace).
- Special cards: `src/core/types.ts` (phase and scheduled kind `special`, inputs `acceptSpecial` /
  `closeSpecial`, modifier source `special`, `GameData.specialCards`, `GameState.specials`);
  `src/core/simulation.ts` (draw at the year start, open on its day, the two inputs);
  `src/core/scheduler.ts` (`KIND_PRIORITY.special`); `src/core/rng.ts` (stream `specials`);
  `src/core/bots.ts` (`runToEnd` resolves the card); `src/data/loader.ts` + `src/data/schemas.ts`
  (`data/catastrophes`, source `special`); `config.specials` in `src/config.ts`; `tests/helpers.ts`
  (`gameData()` without special cards, `resolveModal`); `vite.config.ts` builds `special.html` next to
  `index.html`.

Open a pull request into `main` when a version is ready, and merge `main` into your branch now and then to
pick up the other work.

## Check your changes

```bash
npm run dev
```
Pick cards with chaos events and let the quarter run; pop-ups appear at the bottom right. Special cards
come on their own a few times a year (the banner at the top right warns a week ahead).

To watch a card open without waiting for it, use the preview page:
`http://localhost:5173/special.html?card=dummy_cat_finances` (any card id; `&leader=abis` for the other
leader). The panel at the bottom left opens any card again and replays its animation. The page is also
part of the build (`dist/special.html`).

```bash
npm test
```
Catches missing texts, unknown event ids and broken responses.
