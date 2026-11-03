# Assignment: Full-window region screen and regional demands ("!")

**For:** developer
**From:** Daniel
**Status:** new feature request, on top of the finished PoC
**Depends on:** `assignment-budget-sliders-and-minigames.md` (budget categories and compromise flow). Build that first, or implement the budget-based demand conditions in C4 last.
**Read first:** `CLAUDE.md`, `budget-inc-spec.md` §7.4 (opportunities), `DECISIONS.md` §3 / §4.6 (regional politics) and §6 (compromises)

## Goal

1. Clicking a region opens a **full-window region screen** with its traits, real socio-demographic data, the parties governing the region and the **history of effects** on the region over time.
2. A new map event, the **regional demand**, shown as a **"!"** pin. A political party or an interest group in a region asks for something. The player accepts or rejects it and sees the impact of both. An accepted demand becomes a **pledge** that must be fulfilled within one year through policy cards, a regional compromise or the budget sliders.

Inspiration: region traits and region screens in strategy/simulation games such as Rebel Inc. Do not copy any art, layout or text from them; everything stays in Budget Inc.'s own style.

All project rules still apply: pure deterministic core, tunables in `src/config.ts`, content in `data/*.json` (zod-validated), Czech only in `locales/cs.json`, no network calls at runtime, decisions logged in `DECISIONS.md`, phase gate after each part.

---

## Part A: Map pins

- The existing **PC bubble** (opportunity pin, `src/ui/map/OpportunityPin.tsx`) **stays** and works as today, but it must **no longer show "!"**. Give it its own icon (e.g. a coin or PC symbol in pixel style).
- **"!" is reserved for regional demands** (Part C). Give the demand pin a clearly different look (other colour and shape, e.g. a speech bubble), so the two can't be confused at a glance, also on a phone.
- Both pins: touch target ≥ 44 px, small offsets when several pins are in one region (as today).

---

## Part B: Full-window region screen

### B1. Behaviour

- Clicking or tapping a region opens a **full-window region screen** (not a drawer or an expandable panel). It covers the whole game view on desktop and on the phone. It replaces the small info box in `CzMap.tsx` (`region-info`).
- **Clicking a region stops the game:** the clock pauses as soon as the region screen opens (same as other modals) and resumes on close, unless the player had paused it before (then it stays paused).
- Close with the close button, Esc, or the device back gesture/button. Arrows or a region picker in the header switch to the previous/next region without closing.
- Layout:
  - Desktop: header across the top; below it two columns (left: traits, demand/pledges, coalition; right: history chart and effect list; socio-demographics under them).
  - Phone (≤ 480 px): one scrolling column with tabs at the top: **Přehled** (traits, demand/pledges, coalition), **Historie** (B5), **Data** (socio-demographics).
- Contents:
  1. **Header:** region name, current regional support, seats and seat share (as today), and a small pixel-art region silhouette.
  2. **Traits:** 2–3 chips (B2).
  3. **Active demand / pledges:** any open "!" demand and active pledges in this region with their deadline (Part C).
  4. **Regional coalition:** the parties governing the region (B4).
  5. **History:** chart and list of effects over time (B5).
  6. **Socio-demographics:** real data (B3).

### B2. Region traits

Every region gets **2 or 3 traits** from fixed axes. Draft axes:

| Axis | Values |
|---|---|
| Settlement | Městský / Smíšený / Venkovský |
| Economy | Průmysl / Služby / Zemědělství / Cestovní ruch |
| Special (optional third trait) | e.g. Uhelný region, Příhraniční, Univerzitní |

Traits are **mechanics, not just labels**:

- Policy cards, compromises and demands get an optional `tags` list (e.g. `["agriculture", "transport", "industry"]`). Tags are hidden from the player; the card UI shows the result, not the tag.
- `config.regions.traitResponse` defines how each trait reacts to each tag, as a multiplier on that card's regional effect. For example, a card tagged `agriculture` with a support gain moves *Zemědělství* regions ×1.5 and *Městský* regions ×0.7.
- Traits also weight where demands appear and who makes them (C1).
- All multipliers are tunable; the trait assignment per region is data (`data/region_profiles.json`, B3).

The final trait list per region is **[TODO: Daniel]**. Ship a draft assignment marked `"traitsSource": "DRAFT"`.

### B3. Socio-demographics (real data)

Shown per region, read-only, with the year and source under each block:

| Field | Suggested source |
|---|---|
| Number of inhabitants | ČSÚ (population of kraje) |
| Average gross monthly wage | ČSÚ (average wage by kraj) |
| Median gross monthly wage | ČSÚ / ISPV |
| Employment rate and unemployment rate | ČSÚ (VŠPS) / MPSV |
| Living standard | e.g. GDP per capita (ČSÚ regional accounts) and the at-risk-of-poverty rate (ČSÚ, EU-SILC) |

Rules:
- Data lives in a new file `data/region_profiles.json` (zod-validated), **never fetched at runtime**.
- Every value block carries `source` and `year`. The UI shows both.
- **Do not invent numbers.** Until the real values are filled in from the official sources, ship `null` with `"status": "TODO"` and show "—" in the UI. Document how to update the file in the README.
- The data is display-only in this version. It does not change the simulation (a later version may use it).

### B4. Regional coalition

- Show the parties forming the **current governing coalition of the region** (kraj), after the latest regional elections (2024). **Praha** is a special case: it has a city council, not a kraj council (elected in the municipal elections), so show that coalition instead.
- Data in `data/region_profiles.json`: `coalition: [{ "party": "party.ano", "share": ... }]`, with a `source` and an "as of" date. Party labels live in `cs.json`.
- Party names are allowed (as already used for the leaders), but **no real people's names or likenesses** (`CLAUDE.md` rule 4).
- Fill from official sources (the regions' websites, volby.cz). Until verified: `"status": "TODO"`.
- Coalition parties are the pool of **political requesters** for demands in that region (C1).

### B5. History of effects

The region screen shows how the region has changed during the run and why.

**Chart (top):**
- A line chart of **regional support s_r over time**, from the start of the term to today, one point per game week (the projection already updates weekly).
- Optional toggle for a second line: the national support, for comparison.
- **Markers** on the line where something affected the region: policy card, compromise, demand/pledge, chaos event, opportunity. Different marker shapes per source type; tapping a marker highlights the matching row in the list.
- Quarter boundaries and budget votes as light vertical lines.
- Pixel style consistent with the rest of the UI; readable at 375 px.

**Effect list (below):**
- Newest first. One row per change to this region: date, source type icon, name (card title, compromise, demand…), and the change in regional support (e.g. `+4`), plus any trait multiplier that applied (e.g. "Zemědělství ×1.5").
- Filter chips by source type.
- Summary line at the top: total change since the start and the biggest positive and negative contributors.

**Core:**
- Store a weekly snapshot of every region's support in state: `state.regionHistory[code]: number[]` (one value per week). This is small (14 × ~208 numbers).
- Every log entry that changes a region's shift must contain the per-region deltas (most already do through the `regions` bundle block). Build the list from the log, not from a second store.
- Replay must reproduce the same history.
- Include the history in the JSON export.

---

## Part C: Regional demands ("!")

### C1. Spawning

- A new scheduled event type, `demand`, using the existing scheduler and a **new RNG stream** `demands` (so it doesn't shift other streams and replays stay exact).
- `config.demands.perYear` demands per game year (default `3`, tunable), spread over random days. At most `config.demands.maxOpen` (default `2`) open "!" pins at a time; only one per region.
- **Region:** weighted by seats and by trait weights in the demand templates.
- **Requester:** either a **party from the region's coalition** (B4) or one of the **5 interest groups** (Oligarchs, Media, EU, Activists, Pensioners). Each template says which requester types it allows.
- A pin stays on the map for `config.demands.responseDays` (default `30` game days). If ignored, it expires and counts as **ignored** (C3).

### C2. Demand card

Tapping "!" opens the region screen with the **demand card** on top (the clock is already paused by the screen).

The card shows:
- **Who** is asking (party or interest group) and **in which region**.
- **What** they want (text from the template).
- **Deadline:** "You have 1 year to deliver" (`config.demands.deadlineQuarters`, default `4`).
- **How it can be fulfilled:** in plain words, e.g. "Pick a transport policy" or "Raise Doprava by at least +5 % in the next budget". No chapter names or codes.
- **Impact of each choice**, with honest ranges like on cards:
  - **Accept:** immediate effect (often small) + **if fulfilled** (reward) + **if not fulfilled in time** (penalty)
  - **Reject:** immediate effect
- Buttons: **Přijmout** / **Odmítnout**.

**Example (Daniel's):** *Karlovarský kraj: party ANO asks to cancel parking fees in the city centre. You have one year to make it happen.*
- Accept → small regional support gain now; fulfil it → bigger regional gain and lower anger of the requester; fail → regional loss and coalition stability down (broken promise).
- Reject → regional loss now, smaller than the broken-promise penalty.

### C3. Outcomes

| Situation | Effect |
|---|---|
| Accepted, fulfilled within the deadline | `onFulfil` bundle (reward). News pop-up. |
| Accepted, deadline passes | `onFail` bundle. Must be **worse than rejecting** (broken promise). News pop-up. |
| Rejected | `onReject` bundle, applied immediately |
| Ignored (pin expired) | `onReject` × `config.demands.ignoreFactor` (default `0.5`) |

All effects use the existing effect bundle format (resources, anger, `regions`, `budgetChanges`) and go through the normal pipeline, so upgrades and difficulty apply. A requester that is a coalition party should usually affect **coalition stability**; an interest group affects **its anger**.

### C4. Connection to cards, compromises and budget

A template's `fulfil` block lists one or more conditions; **any one** of them fulfils the pledge:

```jsonc
"fulfil": [
  { "type": "policy",     "tags": ["transport"] },                       // pick a policy card with this tag
  { "type": "policy",     "cardIds": ["dummy_policy_x"] },              // or a specific card
  { "type": "compromise", "region": "self", "minRegionGain": 1 },       // make a compromise that helps this region
  { "type": "budget",     "item": "transport", "minSteps": 1 }          // budget slider (needs the slider feature)
]
```

- `"region": "self"` means the demand's own region.
- **Policy cards:** while a pledge is active, matching cards get extra draft weight (`config.demands.draftBoost`, default `×2`) so the pledge is achievable. Matching cards show a badge **"Splní požadavek: <region>"** in the draft.
- **Compromises:** compromises affecting the pledge region get the same draft boost in the compromise offer and the same badge.
- **Budget sliders:** the matching category shows a badge in the budget screen, with the required direction and size.
- A demand whose conditions can't be met before its deadline (e.g. a budget condition with no budget vote left in the window, or no matching card in the pool) must **not spawn**. Check this when spawning.

### C5. Data

New folder `data/demands/*.json`, zod-validated:

```jsonc
{
  "id": "dummy_demand_parking",
  "requesterTypes": ["party", "interestGroup"],
  "parties": ["party.ano"],                 // optional: restrict to these parties
  "interestGroups": [],                     // optional
  "regionWeights": { "trait.rural": 0, "trait.urban": 2 },   // optional, by trait
  "regions": [],                            // optional fixed list of region codes
  "text": "demand.dummy_demand_parking.text",
  "fulfilHint": "demand.dummy_demand_parking.hint",
  "fulfil": [ { "type": "policy", "tags": ["transport"] } ],
  "onAccept": { ... },                      // effect bundle
  "onFulfil": { ... },
  "onFail":   { ... },
  "onReject": { ... }
}
```

- Validation: every tag used in `fulfil` exists on at least one card; every budget `item` exists in `budget_items.json`; every party exists in `region_profiles.json`; `onFail` is worse than `onReject` in expected value (warning, not error).
- **Content:** demand texts are content. Ship `[DUMMY]` demands only (at least 6, covering party and interest-group requesters and all three fulfilment types). Daniel's parking example may be one of them. The real party demands come from party programmes (C5a).

### C5a. Party demands come from real party programmes

Demands made by **political parties** must be based on the parties' **real political programmes**, which Daniel will upload.

**Where the programmes go:**
- `sources/programmes/<party-id>/` (e.g. `sources/programmes/ano/`), one file per programme (PDF, DOCX or text), plus a `meta.json` per party:
  ```jsonc
  { "party": "party.ano", "documents": [ { "file": "program-2024-kraje.pdf", "title": "...", "year": 2024, "level": "regional", "region": "CZ041" } ] }
  ```
  `level` is `national` or `regional`; a regional programme names its region.
- These files are **source material only**. They are not bundled into the game and never loaded at runtime. Add the folder to the build excludes.

**Linking each party demand to its programme:**
- Every party demand template gets a required `programmeRef`:
  ```jsonc
  "programmeRef": { "party": "party.ano", "file": "program-2024-kraje.pdf", "page": 12, "section": "Doprava", "quote": "short quote, max ~200 characters" }
  ```
- Validation: a party demand without `programmeRef` is a load error (except `[DUMMY]` demands); the referenced party must match the requester party; the file must exist in `sources/programmes/` (checked in a test, not at runtime).
- Prefer a party's **regional** programme for demands in that region; fall back to its national programme.
- The demand card may show a small "Z programu strany" note. Show the quote only if Daniel decides so (open point).

**Workflow for writing the demands:**
1. Daniel uploads the programmes into `sources/programmes/`.
2. Demands are drafted from concrete programme points (a script or Claude may help draft), each with its `programmeRef`, and marked `"status": "DRAFT"`.
3. Daniel reviews and approves; approved demands get `"status": "APPROVED"`. Only approved demands spawn in normal builds; drafts spawn only with `includeDevFiller` (like filler cards).

**Guardrails:**
- Demands paraphrase programme points into short game demands; no invented positions attributed to a real party.
- No real people's names (`CLAUDE.md` rule 4), even if the programme names them.
- **Interest-group** demands (Oligarchs, Media, EU, Activists, Pensioners) have no programme; they stay Daniel-written content (`[DUMMY]` until then).

### C6. Core changes

- State: `state.demands` (open pins) and `state.pledges` (accepted, with region, requester, deadline and conditions).
- Inputs:
  ```ts
  | { kind: 'acceptDemand'; demandId: string }
  | { kind: 'rejectDemand'; demandId: string }
  ```
- Check pledges after each `pickPolicy`, `makeCompromise` and `voteBudget`; check deadlines on the daily tick.
- Log entries: `demand_spawned`, `demand_accepted`, `demand_rejected`, `demand_ignored`, `pledge_fulfilled`, `pledge_failed`. Fulfilled and failed pledges count as key decisions on the final screen.
- Replay must still produce a deep-equal final state.

### C7. HUD

- A small **pledge tracker** (e.g. under the resource bars): one row per active pledge with the region, a short label and a countdown. Tapping a row opens that region's screen.
- On the map, regions with an active pledge get a subtle marker.

### C8. Bots

- `random`: accepts with 50 % probability.
- `greedy`: accepts when expected value of accepting (with a fixed estimate of the fulfil chance, `config.bots.pledgeFulfilEstimate`) beats rejecting; prefers matching cards while a pledge is active.

---

## Part D: Testing and acceptance

**Tests:**
- PC bubble no longer renders "!"; the demand pin does.
- Demand spawning is deterministic for a seed and doesn't change the other RNG streams' rolls.
- Never more than `maxOpen` open demands, never two in one region.
- Each fulfilment type (policy tag, policy id, compromise, budget) fulfils a pledge; nothing else does.
- Deadline passes → `onFail` exactly once; fulfilment after the deadline is impossible.
- Ignored demand → `onReject × ignoreFactor`.
- Previews on the demand card equal the applied effects.
- `region_profiles.json`: validation passes with `null`/`TODO` values; the UI shows "—".
- Trait multipliers change regional effects as configured.
- Guard tests still pass (no Czech in `src/`, no chapter names or codes in the UI).

**Acceptance:**
- [ ] Clicking any of the 14 regions opens the full-window region screen and pauses the game; works on desktop and at 375 px (tabs).
- [ ] The screen shows traits, socio-demographics (with source and year, or "—" when TODO), the regional coalition and the history chart and effect list.
- [ ] Party demands come only from approved templates with a valid `programmeRef`.
- [ ] "!" appears only for demands; the PC bubble has its own icon.
- [ ] A demand shows who asks, what, the deadline, how to fulfil it and the impact of accepting and rejecting.
- [ ] Accepted demands appear in the pledge tracker and can be fulfilled by a card, a compromise or the budget.
- [ ] Phase gate passes: `npm run typecheck && npm run lint && npm test && npm run build` and `npm run simulate -- --runs 200 --bot random`.
- [ ] New simulator table in `DECISIONS.md`; the greedy Mupka win rate on Normal stays within 20–40 % or the deviation is explained.
- [ ] Every decision not covered here is one line in `DECISIONS.md`.
- [ ] Commits: `phase 13: region screen, traits and history`, `phase 14: regional demands`; both added to `PROGRESS.md`.

---

## Open points (confirm with Daniel)

1. **Trait list per region** (2–3 traits for each of the 14 kraje).
2. **Real data values** for B3 and **regional coalitions** for B4: who fills them in and as of which date.
3. **Party programmes:** Daniel uploads them into `sources/programmes/` (C5a). Until then, party demands are `[DUMMY]`. Interest-group demand texts: `[DUMMY]` until Daniel writes them.
4. **Programme quote on the demand card:** show it or not (default: not, only the note "Z programu strany").
5. **How many demands per year** (default 3).

## Decided by Daniel

- The region view is a **full window**, not an expandable panel.
- **Clicking a region pauses the game.**
- The region screen shows a **history of effects** and how the region changes over time.
- Party demands are based on the parties' **real political programmes**, uploaded by Daniel.
