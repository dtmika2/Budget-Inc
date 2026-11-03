# Assignment: Region detail panel and regional demands ("!")

**For:** developer
**From:** Daniel
**Status:** new feature request, on top of the finished PoC
**Depends on:** `assignment-budget-sliders-and-minigames.md` (budget categories and compromise flow). Build that first, or implement the budget-based demand conditions in C4 last.
**Read first:** `CLAUDE.md`, `budget-inc-spec.md` §7.4 (opportunities), `DECISIONS.md` §3 / §4.6 (regional politics) and §6 (compromises)

## Goal

1. Clicking a region opens an **expandable region panel** with its traits, real socio-demographic data and the parties governing the region.
2. A new map event, the **regional demand**, shown as a **"!"** pin. A political party or an interest group in a region asks for something. The player accepts or rejects it and sees the impact of both. An accepted demand becomes a **pledge** that must be fulfilled within one year through policy cards, a regional compromise or the budget sliders.

Inspiration: region traits and region panels in strategy/simulation games such as Rebel Inc. Do not copy any art, layout or text from them; everything stays in Budget Inc.'s own style.

All project rules still apply: pure deterministic core, tunables in `src/config.ts`, content in `data/*.json` (zod-validated), Czech only in `locales/cs.json`, no network calls at runtime, decisions logged in `DECISIONS.md`, phase gate after each part.

---

## Part A: Map pins

- The existing **PC bubble** (opportunity pin, `src/ui/map/OpportunityPin.tsx`) **stays** and works as today, but it must **no longer show "!"**. Give it its own icon (e.g. a coin or PC symbol in pixel style).
- **"!" is reserved for regional demands** (Part C). Give the demand pin a clearly different look (other colour and shape, e.g. a speech bubble), so the two can't be confused at a glance, also on a phone.
- Both pins: touch target ≥ 44 px, small offsets when several pins are in one region (as today).

---

## Part B: Expandable region panel

### B1. Behaviour

- Clicking or tapping a region opens the **region panel**. It replaces the small info box in `CzMap.tsx` (`region-info`).
  - Desktop: a drawer next to the map.
  - Phone (≤ 480 px): a bottom sheet, half height by default, swipe or tap to expand to full height.
- Clicking the same region again, the close button or Esc closes it. The clock keeps running while it is open (it is information, not a decision), except when a demand card is open (C2).
- Sections, collapsible, in this order:
  1. **Header:** region name, current regional support, seats and seat share (as today).
  2. **Traits:** 2–3 chips (B2).
  3. **Active demand / pledges:** any open "!" demand and active pledges in this region with their deadline (Part C).
  4. **Socio-demographics:** real data (B3).
  5. **Regional coalition:** the parties governing the region (B4).

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

---

## Part C: Regional demands ("!")

### C1. Spawning

- A new scheduled event type, `demand`, using the existing scheduler and a **new RNG stream** `demands` (so it doesn't shift other streams and replays stay exact).
- `config.demands.perYear` demands per game year (default `3`, tunable), spread over random days. At most `config.demands.maxOpen` (default `2`) open "!" pins at a time; only one per region.
- **Region:** weighted by seats and by trait weights in the demand templates.
- **Requester:** either a **party from the region's coalition** (B4) or one of the **5 interest groups** (Oligarchs, Media, EU, Activists, Pensioners). Each template says which requester types it allows.
- A pin stays on the map for `config.demands.responseDays` (default `30` game days). If ignored, it expires and counts as **ignored** (C3).

### C2. Demand card

Tapping "!" opens the region panel with the **demand card** on top and **pauses the clock** while the card is open.

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
- **Content:** demand texts are content. Ship `[DUMMY]` demands only (at least 6, covering party and interest-group requesters and all three fulfilment types). Daniel's parking example may be one of them. Daniel writes the real ones.

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

- A small **pledge tracker** (e.g. under the resource bars): one row per active pledge with the region, a short label and a countdown. Tapping a row opens that region's panel.
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
- [ ] Clicking any of the 14 regions opens the panel; works on desktop and at 375 px (bottom sheet).
- [ ] The panel shows traits, socio-demographics (with source and year, or "—" when TODO) and the regional coalition.
- [ ] "!" appears only for demands; the PC bubble has its own icon.
- [ ] A demand shows who asks, what, the deadline, how to fulfil it and the impact of accepting and rejecting.
- [ ] Accepted demands appear in the pledge tracker and can be fulfilled by a card, a compromise or the budget.
- [ ] Phase gate passes: `npm run typecheck && npm run lint && npm test && npm run build` and `npm run simulate -- --runs 200 --bot random`.
- [ ] New simulator table in `DECISIONS.md`; the greedy Mupka win rate on Normal stays within 20–40 % or the deviation is explained.
- [ ] Every decision not covered here is one line in `DECISIONS.md`.
- [ ] Commits: `phase 13: region panel and traits`, `phase 14: regional demands`; both added to `PROGRESS.md`.

---

## Open points (confirm with Daniel)

1. **Trait list per region** (2–3 traits for each of the 14 kraje).
2. **Real data values** for B3 and **regional coalitions** for B4: who fills them in and as of which date.
3. **Demand texts:** `[DUMMY]` until Daniel writes them.
4. **How many demands per year** (default 3) and whether the clock should pause when the "!" appears, or only when the card is opened (default: only when opened).
