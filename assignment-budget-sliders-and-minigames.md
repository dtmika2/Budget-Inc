# Assignment: Budget sliders and compromise mini-games

**For:** developer
**From:** Daniel
**Status:** new feature request, on top of the finished PoC (P0–P10)
**Read first:** `CLAUDE.md`, `budget-inc-spec.md` §4.7 (budget vote), `DECISIONS.md` §6 (regional compromises)

## Goal

Today the **annual budget vote** and the **regional compromise** play exactly like policy cards: pick one of N options. Both should feel clearly different from the card draft:

1. **Budget vote:** a slider screen where the player cuts or raises concrete spending items (pensions, NGOs, defence…). The reference is the slider screens in management games such as Game Dev Tycoon.
2. **Regional compromise:** after picking the deal, the player sells it with a short, simple, fast mini-game (press release, TV debate, regional tour…). The reference is the small games-within-a-game in titles such as Dave the Diver.

These are inspiration only. Do not copy any art, layout, names or assets from those games; everything stays in Budget Inc.'s own pixel style.

All existing project rules still apply: pure deterministic core, tunables in `src/config.ts`, content in `data/*.json` (zod-validated), Czech only in `locales/cs.json`, every non-spec decision logged in `DECISIONS.md`, phase gate after each part.

---

## Part A: Budget vote as a slider screen

### A1. Player experience

When the budget vote opens (same timing as today: day 75 of Q1/5/9/13, clock paused):

- The modal lists **spending items**, each with a slider.
  - Range: `−15 %` to `+15 %`, step `5 %` (tunable).
  - Default position: `0`.
- A **live preview panel** updates on every slider move:
  - Finances change (exact, same calculation as the card preview)
  - Support change (range)
  - Interest-group anger changes (ranges), e.g. cutting pensions → Pensioners angrier
  - **Pass chance** of the vote
- **Preset buttons** replace the current three options: *Tight / Balanced / Generous*. A preset only sets the sliders; the player can then fine-tune. The data in `data/annual/budget_vote.json` becomes the preset definitions (slider positions plus the existing `passChanceMod`, `effects` and `anger`).
- A **Submit to parliament** button runs the vote as today (pass → apply, fail → *rozpočtové provizorium* penalties). Mandatory spending growth before the vote stays unchanged.

### A2. Coalition red lines (the puzzle)

- Each vote, `redLines.count` (default 1–2) items are marked with a lock icon: *"partner won't accept a cut greater than X %"*.
- Red lines are drawn from the `budgetVote` RNG stream at vote open, so they are deterministic and replayable.
- Crossing a red line is allowed but lowers the pass chance by `redLines.passPenalty` (default `−0.20`) per violated line.
- Pass chance formula (extends spec §4.7):

```
p_pass = clamp( passBase
              + (coalition − 50) / 100
              + presetPassMod                      // 0 if no preset is active
              + Σ item.passPerStep × steps_item     // optional per-item sensitivity
              − redLines.passPenalty × violations,
              passMin, passMax )
```

### A3. Data: player-facing budget items

New file `data/budget_items.json`, validated in `src/data/schemas.ts`:

```jsonc
[
  {
    "id": "pensions",
    "label": "budgetItem.pensions.label",        // Czech text in locales/cs.json
    "chapters": [                                // HIDDEN mapping to budget.json chapters
      { "chapter": "313", "type": "expenditure", "weight": 0.6 }
    ],
    "angerPerStep":   { "pensioners": 3 },       // per +5 % step; negative steps invert the sign
    "supportPerStep": 0.5,
    "passPerStep": 0,
    "canBeRedLine": true
  }
]
```

- One slider step of `s %` on an item adds `s × weight` to the `changePct` of each mapped chapter (same additive semantics as spec §9.3). One item can map to several chapters; NGOs, for example, are spread across ministries.
- Effects scale **linearly** with slider steps, so the preview ranges are exact and honest, like cards.
- The validator checks that every referenced chapter exists in `budget.json` (same rule as for cards).

**Which items get a slider (decided by Daniel):** only categories that are among the **biggest expenses** or the **most controversial** ones. Chapter names and codes stay hidden; the player sees only these categories.

Draft list to start from (final list and chapter mapping with Daniel): Důchody, Neziskovky, Obrana, Školství, Doprava, Zdravotnictví, Zemědělství, Životní prostředí, Státní správa. Labels go to `cs.json`. Numbers in the dummy file are `[DUMMY]`.

### A4. Core changes

- `Input` `voteBudget` changes to:
  ```ts
  { kind: 'voteBudget'; sliders: Record<string, number>; presetId: string | null }
  ```
  (`sliders` are steps, e.g. `{ pensions: -2, ngos: -3 }`).
- `src/core/budgetVote.ts`:
  - `openBudgetVote` additionally draws and stores the red lines in state (`state.budgetVoteRedLines`).
  - `passChance(sim, sliders, presetId)` and `sliderBudgetDelta(sim, sliders)` (pure, for previews and bots).
  - `voteBudget` builds one effect bundle from preset + sliders and applies it through the existing pipeline (`applyBundle`), so modifiers, Austerity Freeze and upgrades keep working.
- Log entry `budget_vote` gains `sliders`, `presetId`, `redLines` and `violations`.
- Replay must still produce a deep-equal final state.

### A5. Bots

- `random`: picks a random preset, then nudges 0–3 random sliders by ±1 step.
- `greedy`: starts from the best preset and does a small hill-climb over the sliders, maximising expected value × pass chance, within a fixed iteration cap (deterministic).

---

## Part B: Regional compromise with mini-games

### B1. New flow

1. **Pick the deal:** 1 of 2 compromise cards (unchanged).
2. **Pick a channel** to sell it. Each channel opens a different mini-game and has its own risk profile:

| Channel | Mini-game | Profile | Cost |
|---|---|---|---|
| Tisková zpráva | A: Word catch | Safe, narrow result range | free |
| TV debata | B: Sound-bite timing | Risky, wide range | free |
| Objezd regionů | C: Handshakes | High stakes: positive **or negative** outcome (see B1a) | free, **once per game year** |

3. **Play the mini-game** (10–15 s), which returns a **score from 0 to 1**.
4. **The score scales the deal:**

```
gainMult = lerp(channel.gainMin, channel.gainMax, score)   // e.g. 0.6 … 1.4
lossMult = lerp(channel.lossMax, channel.lossMin, score)   // e.g. 1.4 … 0.6
```

Gains (positive regional shifts, anger reductions) are multiplied by `gainMult`; losses by `lossMult`. All channel numbers live in `config.compromise.channels`.

#### B1a. Regional tour rules (decided by Daniel)

- **Objezd regionů** can be used **once per game year** (game years = Q1–4, Q5–8, Q9–12, Q13–16). Once used, the channel shows as locked with the quarter it unlocks again. No PC cost.
- Its outcome can be **positive or negative**, depending only on mini-game performance:
  - High score: the deal's regional gains are boosted well above the other channels.
  - Low score: the tour backfires, and the regions in the deal **lose** support (gains turn into losses, losses get bigger).
  - Use a separate config block, e.g. `config.compromise.tour = { gainMin: -0.5, gainMax: 1.8, lossMin: 0.5, lossMax: 1.8, neutralScore: 0.5 }`, so a score around `neutralScore` gives roughly the plain deal. All numbers are tunable.
- The result splash must state clearly whether the tour helped or hurt.
- Track usage in state (`state.tourUsedInYear`) so it is deterministic and replayable.

- There is a **Skip mini-game** option (accessibility and impatient players): it counts as `score = config.compromise.skipScore` (default `0.4`).
- The clock stays paused for the whole flow.

### B2. Mini-games (implement A, B and C now)

All mini-games: one thumb, touch targets ≥ 44 px, 10–15 s, work at 375 px width, no new dependencies, no sound required. Short 3-2-1 countdown, then a result splash ("Skvělé / Ujde to / Průšvih") with the score.

**A: Tisková zpráva (word catch), 12 s**
- Words fall down the screen in 3 columns.
- Tap **spin words** (+), avoid **gaffe words** (−). A missed spin word is neutral.
- `score = clamp((hits − gaffes × 2) / spinWordsShown, 0, 1)`.
- Fall speed rises slightly over time.

**B: TV debata (sound-bite timing), ~10 s**
- 5 moderator questions in a row. For each, a needle swings across a meter.
- Tap when the needle is in the green zone. The zone shrinks with every question.
- Per question: green = 1, yellow edge = 0.5, red = 0. `score = average`.

**C: Objezd regionů (handshakes), 12 s**
- A 3×3 crowd grid. Hands pop up for a short time: tap = +1.
- Eggs and tomatoes pop up too: tapping one = −2.
- `score = clamp((handshakes − hits × 2) / handsShown, 0, 1)`.

**Later (not now), for the backlog:**
- D: Sociální sítě: swipe comments as supporters or trolls.
- E: Koaliční večeře: haggle with a slider for a hidden acceptable offer, 3 tries, hot/cold feedback.
- F: Billboard: pick a slogan, photo and colour; a crowd meter reacts.
- G: Rozhovor: quick questions, 3 s per answer, avoid the gaffe.

Build the mini-game layer so a new mini-game is one component plus one config entry.

### B3. Content

- Spin words, gaffe words and debate questions are **content**: ship them as `[DUMMY]` entries in a new `data/minigames/*.json` (zod-validated), with Czech texts in `cs.json`. Daniel writes the real ones.
- Optionally, a compromise card can name a preferred channel (`preferredChannel`), which gives a small bonus. Default: none.

### B4. Core changes

- `Input` `makeCompromise` changes to:
  ```ts
  { kind: 'makeCompromise'; cardId: string; channelId: string; score: number }
  ```
- The mini-games run **only in the UI** (`src/ui/minigames/`). They may use real-time timers and their own UI randomness; the core never sees them. The core receives only the final `score`, clamped to [0, 1] and rounded to 2 decimals.
- `makeCompromise` applies the card's bundle with the gain and loss multipliers through the existing pipeline; channel PC cost goes through the pipeline as well.
- Log entry `compromise_made` gains `channelId` and `score`. Replay uses the logged score, so runs stay deterministic.
- `canMakeCompromise` also rejects Objezd regionů when it was already used this game year.
- Skip is not allowed for Objezd regionů (otherwise players would skip the risk); hide the Skip button there.

### B5. Bots

- Bots need a score model: `config.bots.minigameScore` = `{ random: uniform 0–1, greedy: 0.75 }` (drawn from the bot's own RNG).
- `random` picks a random channel; `greedy` picks the channel with the best expected value.

---

## Part C: Testing and acceptance

**Tests (add to `tests/`):**
- Slider budget delta equals the applied delta (preview = result).
- Presets reproduce the old three options' budget effect.
- Red lines: deterministic for a seed; each violation lowers the pass chance by the configured amount.
- Unknown item or chapter in `budget_items.json` → readable load error.
- Compromise multipliers: `score = 1` → gainMax/lossMin, `score = 0` → gainMin/lossMax.
- Objezd regionů: allowed once per game year, rejected a second time in the same year, unlocked again in the next year.
- Objezd regionů with a low score produces a net regional **loss**; with a high score a gain larger than the other channels.
- Replay with sliders and mini-game scores → deep-equal final state.
- Guard tests still pass (no Czech in `src/`, no chapter **names or codes** in the UI).

**Acceptance:**
- [ ] Budget vote shows sliders, presets, a live preview and red lines; works on desktop and at 375 px.
- [ ] Moving any slider updates Finances, anger, support and pass chance instantly; the preview equals the result.
- [ ] Compromise flow: deal → channel → mini-game → result, all three mini-games playable on touch and mouse.
- [ ] Each mini-game takes ≤ 15 s; Skip works.
- [ ] Phase gate passes: `npm run typecheck && npm run lint && npm test && npm run build` and `npm run simulate -- --runs 200 --bot random`.
- [ ] New simulator table in `DECISIONS.md` (balance log); the greedy Mupka win rate is still within 20–40 % on Normal, or the deviation is explained.
- [ ] Every decision not covered by this assignment is one line in `DECISIONS.md`.
- [ ] Commit as `phase 11: budget sliders` and `phase 12: compromise mini-games`; add both to `PROGRESS.md`.

---

## Decisions by Daniel

1. **Budget categories are shown, chapters stay hidden.** The player sees only categories (the biggest and the most controversial expenses). Chapter names and codes are never shown. Update the wording of `CLAUDE.md` rule 7 accordingly and log it in `DECISIONS.md`.
2. **Mini-game texts are placeholders.** Spin words, gaffe words and debate questions ship as `[DUMMY]`.
3. **Objezd regionů happens once per game year**, costs nothing, and can end positively or negatively depending on mini-game performance (B1a).

## Still open

- Final list of budget categories and their mapping to chapters (A3). Start with the draft list and `[DUMMY]` numbers.
