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

`data/events/_filler.json` and the `event.filler_*` texts are rewritten by `npm run gen:filler`; put real
events in another file (for example `data/events/catastrophes.json`).

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

Open a pull request into `main` when a version is ready, and merge `main` into your branch now and then to
pick up the other work.

## Check your changes

```bash
npm run dev
```
Pick cards with chaos events and let the quarter run; pop-ups appear at the bottom right.

```bash
npm test
```
Catches missing texts, unknown event ids and broken responses.
