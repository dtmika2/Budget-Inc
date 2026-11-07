# Budget Inc. — Technical & Design Specification (PoC)

> **Audience:** an AI coding assistant (Claude) working with a human developer.
> **Status:** Proof of Concept, spec **v1.1**. Items marked **[OPEN]** are undecided. Implement them as configurable placeholders, never as hard-coded final answers.
> **Language rule:** code, identifiers, file names, comments and this spec are in English. **Every player-facing string is in Czech** and lives in a locale file (see §11).

### Changes in v1.1
v1.1 closes gaps found in a game-loop review. Every new rule is a proposal: all numbers are tunables in config, and the design choices are listed for review in §16.

| Area | Change | Section |
|---|---|---|
| Mid-quarter loop | New: **respondable chaos events** (2–3 choices) and **opportunity pins** on the map | §7.3, §7.4 |
| Yearly loop | New: **annual state budget vote** and mandatory spending growth | §4.7 |
| Draft | Fixed: pool-exhaustion fallback, terminating algorithm, rerolled cards, content minimum | §5.3, §6.1 |
| Election night | Fixed: one model that produces the outcome **and** consistent regional seats | §4.6 |
| Rules | Defined: modifier order, `changePct` semantics, Austerity Freeze, ability recharge, anger decay, zero-penalty exit, term start/end, chaos timing | §4.1–4.4, §4.8, §5.2, §7.1, §9.3 |
| Outer loop | New: main menu, tutorial, difficulty presets, pause menu, score, "key decisions" rule | §4.9, §12.3 |
| Testing | Simulator gets a greedy bot with its own win-rate target | §13 |

---

## 1. Concept

Budget Inc. is a satirical, chaos-driven browser strategy game inspired by **Plague Inc.** The player is the Czech prime minister, starting on election day.

- **Goal:** survive a 4-year term and win the next parliamentary election.
- **Difficulty:** managing the whole term must be **very hard**. Most first runs should fail or end in an election loss.

**Visual direction**
- **Layout and feel of Plague Inc.:** a static map of the Czech Republic with its 14 regions in the centre, resource bars on top, a collapsible side panel, and news-style pop-up events.
- **Pixel art in the style of Broforce** for the leader characters: chunky, expressive, exaggerated caricatures.
- Use the *style* only. Do not copy any assets, characters or UI from Plague Inc. or Broforce.

### 1.1 The loop at each level
Use this as the map of what the player does and when.

| Level | Cadence | What the player does | Sections |
|---|---|---|---|
| Moment | every few seconds | Watches bars and the projection move, taps opportunity pins, answers respondable events, adjusts speed | §4.1, §7.3, §7.4 |
| Quarter | every ~64 s | Picks 1 of 3 policy cards (with rerolls), receives PC, buys upgrades | §6, §8 |
| Year | every 4 quarters | Votes on the state budget; leader ability recharges | §4.7, §5.2 |
| Term | one run (15–20 min) | Survives endings and zero penalties, then election night | §4.4–4.6 |
| Meta | between runs | Tutorial, difficulty, score and best score, second leader | §4.9, §12.3 |

---

## 2. PoC goals and success criteria

| # | Goal | Proven when |
|---|---|---|
| G1 | Runs in a browser | Playable start-to-finish on current desktop Chrome/Firefox/Safari **and** on a mid-range smartphone (portrait), at ≥ 30 fps. |
| G2 | Real data drives the simulation | Budget data is loaded from an external data file (§9). Policies change budget chapters, and the **Finances** resource is computed from the resulting budget balance. Swapping the mock file for the real one requires **no code changes**. |
| G3 | Decisions are recorded | Every player decision and every applied effect is written to a structured **decision log** (§10), viewable in-game and exportable as JSON at game end. *No server or analytics in the PoC.* |

**Target run length:** 15–20 minutes at normal speed.

---

## 3. Scope

### In the PoC
- Main menu, leader selection with **both leaders**, difficulty selection (§5, §4.9, §12.3)
- First-run tutorial (§12.3)
- Real-time game clock with pause and speed control (§4.1)
- 4 main resources (§4.2) and 5 interest groups (§4.3)
- Quarterly policy draft (3 cards, reroll) (§6)
- Chaos events triggered by picked policies, some **respondable** (§7)
- **Opportunity pins** on the map (§7.4)
- **Annual budget vote** (§4.7)
- **One** upgrade branch: **Public Support** (§8)
- **One** interest-group ending: **Oligarchs** (§4.5)
- Resource-at-zero penalties, including the snap election (§4.4)
- Election projection (live) and the **election night results screen** (§4.6)
- Score and best score per leader (§4.9)
- Decision history panel + JSON export (§10)
- Data loader with a mock budget dataset (§9)
- Responsive layout for desktop and mobile (§12)

### Later (do NOT build, but don't block)
- The other 4 resource upgrade branches and the leader-specific trees
- The other 4 interest-group endings (§4.5 lists them, so that the architecture supports them)
- Regional specifics: each region with its own dynamics
- Saving or loading a game in progress
- Player decision analytics and a server backend
- Yearly "major figure does something crazy" events
- Unlocks and achievements
- Sound and music

Design the code so that each "later" item can be added by **adding data or a module**, not by rewriting the core.

---

## 4. Core simulation

### 4.1 Time
- The term lasts **16 quarters**, i.e. 4 years from election day.
- **One tick = one game day.** Every quarter has exactly `daysPerQuarter = 91` days, so the term is 1,456 days. The calendar date shown in the UI is `startDate + day`; quarters are not aligned to calendar quarters.
- `startDate` is a config value. Placeholder: `2025-10-04` (election day). Game years start at quarters 1, 5, 9 and 13.
- Speeds are **Pause, 1×, 2×, 4×**. At 1×, one day ≈ 0.7 s, so a quarter takes ≈ 64 s and a full run ≈ 17 min plus decision time.
- **The clock pauses automatically when:**
  - the quarterly policy draft opens
  - the annual budget vote opens (§4.7)
  - the upgrade tree, pause menu or settings are open
  - a major modal opens (ending, election)
  - the app loses focus
- Chaos events and opportunities appear as **non-blocking pop-ups/pins** and do not pause the clock. They are also logged in the history panel.

**Start and end of the term**
- **Day 1 of quarter 1** is election day. After leader selection (and the tutorial on a first run), the Q1 draft opens immediately.
- **Quarter 16 has a normal draft.** Election night starts at the end of day 91 of quarter 16.
- Anything scheduled after the term ends (chaos events, ongoing effects, pins) is dropped and logged as `scheduled_cancelled`. The same happens on a snap election or an ending.

Every timing value is a tunable in `config` (§13).

### 4.2 Main resources
These four are always visible in the **top bar**. Each ranges from **0 to 100**.

| id | Czech label (locale) | Meaning |
|---|---|---|
| `finances` | Finance | Health of the state budget. **Derived from budget data**, see §9.3. |
| `support` | Podpora veřejnosti | National public support. Feeds regional support and the election. |
| `coalition` | Stabilita koalice | How firmly the governing coalition holds. |
| `prestige` | Mezinárodní prestiž | International standing, including EU relations. |

**Baseline drift:** each resource drifts slightly every day, which models incumbency fatigue and puts constant pressure on the player.
- Default: `support −0.05/day`, `coalition −0.03/day`, `prestige 0`.
- `finances` has no daily drift. Its pressure comes from **mandatory spending growth** at each budget vote (§4.7).
- All drift values are tunable.

### 4.3 Interest groups
Each interest group has an **anger meter from 0 to 100**. Higher means angrier.
- The meters are shown in the **left expandable panel**.
- A group's ending fires when its meter reaches 100 (§4.5).
- **Pensioners and Oligarchs are the most important groups.** They carry the largest weights in the election formula (§4.6).

| id | Czech label | Election weight (default) |
|---|---|---|
| `oligarchs` | Oligarchové | 10 |
| `pensioners` | Důchodci | 10 |
| `media` | Média | 4 |
| `eu` | EU | 3 |
| `activists` | Aktivisté | 3 |

**Anger decay (memory fades):** each day, every meter moves toward its **resting value** by `angerPullPerDay = 0.02`. The resting value is the leader's starting anger for that group. This means both anger spikes and anger relief fade slowly (≈ 1.8 points per quarter). It does not apply to a meter that has reached 100. Set to 0 to disable.

**Trend arrows:** compare the current value with the value 7 days ago. Show an arrow if the difference is ≥ 1 (red ▲ = angrier, green ▼ = calmer).

**Warning thresholds:**
- At ≥ 70, the meter turns red and pulses.
- At ≥ 90, a warning pop-up appears once per crossing (it can show again after the meter drops below 80).

### 4.4 Resources hitting zero
A resource at 0 never ends the game directly, **except Coalition**. Instead it starts negative effects that persist while the resource stays at 0.

| Resource at 0 | Effect (defaults, tunable) |
|---|---|
| `finances` | Debt crisis: `eu` anger +0.3/day, `pensioners` anger +0.3/day, `prestige` −0.1/day |
| `support` | Street pressure: `activists` anger +0.3/day, `coalition` −0.15/day |
| `prestige` | Isolation: `eu` anger +0.4/day, `finances` modifier −0.1/day |
| `coalition` | **Snap election:** the game jumps straight to election night with the current state. This is "sooner elections," not an instant loss. |

**Rules**
- A penalty **starts** when the resource reaches 0 and **ends** when it climbs back to `zeroPenaltyExitAt = 3`. The gap prevents flickering on and off.
- The Isolation `finances` modifier **accumulates** while active and **stays** after Isolation ends (lasting reputational damage). It is capped at `isolationFinanceCap = −15` in total.
- All other penalty effects stop when the penalty ends.

### 4.5 Interest-group endings
When a group's anger reaches **100**, its ending fires: a full-screen ending card with leader art, a Czech text and a "play again" button, after which the run ends.

| Group | Ending (design intent) | PoC |
|---|---|---|
| `oligarchs` | Oligarchs turn the coalition partners against the PM, and the government falls. | **Build** |
| `media` | A media-radicalised attacker shoots the PM. **The leader survives** but is out of office. Do not use any real attacker's name. | Later |
| `eu` | The EU freezes funding for Czech projects. The EU figure is the parody character **"Lursula von der Eyen"**. | Later |
| `activists` | A moral panic spreads after violent demonstrations, and the government collapses. | Later |
| `pensioners` | Pensioners refuse to vote for the PM, so the election is lost. | Later |

**For "later" groups in the PoC:** at 100 the meter caps and applies a stand-in penalty of `support −0.3/day`. Implement endings as **data-driven entries** (`data/endings.json`) with an id, trigger, text key and art key, so the remaining four only need content.

An ending still produces a final screen with a score (§4.9). It counts as a loss.

### 4.6 Election projection and election night
**Regions:** the 14 NUTS3 regions (kraje).

| code | region |
|---|---|
| CZ010 | Hlavní město Praha |
| CZ020 | Středočeský |
| CZ031 | Jihočeský |
| CZ032 | Plzeňský |
| CZ041 | Karlovarský |
| CZ042 | Ústecký |
| CZ051 | Liberecký |
| CZ052 | Královéhradecký |
| CZ053 | Pardubický |
| CZ063 | Vysočina |
| CZ064 | Jihomoravský |
| CZ071 | Olomoucký |
| CZ072 | Zlínský |
| CZ080 | Moravskoslezský |

**Importance coefficient:** `w_r = seats_r / 200`, where `seats_r` is the real number of Chamber of Deputies seats elected in region r.
- The seat numbers come from `data/regions.json`.
- Daniel will supply them from official election results (volby.cz).
- Until then, use clearly marked placeholder values that sum to 200.
- `data/regions.json` also holds the per-leader `offset_r` table and the election-night **reveal order**.

**Regional support:**
- Formula: `s_r = clamp(support + offset_r[leader], 0, 100)`.
- In the PoC, `offset_r` is a per-leader placeholder table in data, defaulting to 0. Regional dynamics come later.

**Projection (shown live):**
```
S  = Σ_r ( w_r × s_r )                                   // weighted support, 0–100
T  = T_base + Σ_g weight_g × max(0, anger_g − 50) / 50   // threshold rises with anger
P  = 1 / (1 + exp( −(S − T) / k ))                       // re-election probability
defaults: T_base = 45, k = 8
```

**Displayed to the player all the time:**
- A compact "Volební projekce: 38 %" indicator showing `P`.
- The map regions tinted by `s_r`, from red (low) to the party colour (high).
- The indicator and tint update once per in-game week.

**Election night** happens at the end of quarter 16, or earlier on a snap election. The outcome and the regional results come from **one model**, so the reveal can never contradict the result.

```
// 1. National swing. Logistic noise makes P(win) exactly equal to P.
u        = rng.election()                     // uniform (0,1), seeded
ε        = k × ln( u / (1 − u) )
S_final  = S + ε
win      = S_final > T

// 2. Regional results (for display and seats)
η_r        = uniform(−regionalNoise, +regionalNoise)      // default regionalNoise = 3
s_r_final  = clamp( s_r + ε + η_r, 0, 100 )

// 3. Seats of the governing bloc (101 = majority)
G_raw = 100.5 + (S_final − T) × seatsPerPoint             // default seatsPerPoint = 3
G     = win ? max(101, round(G_raw)) : min(100, round(G_raw))
G     = clamp(G, 0, 200)

// 4. Distribute G seats over regions, D'Hondt style
repeat G times:
    give 1 seat to the region with the highest  seats_r × s_r_final / (won_r + 1)
    among regions where won_r < seats_r
```

- **Reveal:** regions light up one by one in the reveal order from `data/regions.json`. Each shows `s_r_final` and "seats won / seats_r", and a running total moves toward the 101 line.
- **Snap election:** same model, using the state at the moment Coalition hit 0.
- **Final screen:**
  - outcome
  - score and best score (§4.9)
  - final resources and interest-group meters
  - key decisions (§10.3)
  - a "Export decision log (JSON)" button
  - a "Play again" button and a "Main menu" button

### 4.7 Annual budget vote
The Czech state budget for the next year is passed every December. This gives each game year one big, risky decision.

**When:** on day `budgetVoteDay = 75` of quarters 1, 5, 9 and 13 (mid-December with the default start date). The clock pauses and a modal opens.

**Mandatory spending growth:** just before each vote, the expenditure of every chapter grows by `mandatoryGrowthPct = 2` (added to its total `changePct`, §9.3). This happens whether or not the vote passes, and it is what slowly erodes Finances.

**Options:** the player picks one of three budget options. They are defined as data in `data/annual/budget_vote.json`, using the same effect format as cards (effects, anger, budgetChanges, ongoing). A `budgetChanges` entry may use `"chapter": "*"` to target all chapters. Dummy options for the PoC:

| Option (dummy) | Design intent | Pass chance modifier |
|---|---|---|
| Tight budget | Spending cut across chapters; finances up, support down, pensioners angrier | −0.10 |
| Balanced budget | Small changes | 0 |
| Generous budget | Spending up; finances down, support up, pensioners calmer | +0.05 |

**Vote:**
```
p_pass = clamp( passBase + (coalition − 50) / 100 + option.passChanceMod, 0.05, 0.98 )
default passBase = 0.75
```
- The modal shows each option's expected effects (honest ranges, same style as cards) and its pass chance.
- **Passed:** the option's effects are applied.
- **Failed (rozpočtové provizorium):** the option's effects are not applied. Instead: `coalition −8`, `prestige −3`, `support −2` (tunable).
- The result is shown as a short news pop-up and logged as `budget_vote`.

### 4.8 Modifier system and order of application
Policies, chaos events, responses, opportunities, budget votes, abilities, upgrades and penalties all change values through **one pipeline**. Every single value change goes through these steps:

1. **Roll** the raw value uniformly in `[min, max]` with the seeded RNG. Ongoing and drift values are fixed per day and skip the roll.
2. Decide whether the change is **bad for the player**: a resource change < 0, or an anger change > 0.
3. If bad, apply the **global negative multiplier** (difficulty, §4.9).
4. Apply matching modifiers: `final = (value + Σ additive) × Π multipliers`. Additives first, then multipliers.
5. Clamp the resource or meter to 0–100.

**Modifier targets** use this grammar:

| Target | Meaning |
|---|---|
| `<resource>.gain` / `<resource>.loss` | positive / negative changes to a resource |
| `<resource>.drift` | the daily baseline drift |
| `anger.<group>.gain` / `anger.<group>.loss` | anger increase / decrease |
| `finances.negative` | any change that lowers Finances, including budget changes that worsen the balance (§9.3) |
| `election.T_base` | the election threshold |
| `pc.perQuarter` | PC income |

A modifier may also have:
- `source`: `policy`, `chaos`, `response`, `opportunity`, `budget_vote`, `ongoing`, `drift`, `penalty` or `any` (default `any`). For example, Spin Doctors is `{ "type": "multiplier", "target": "support.loss", "source": "chaos", "value": 0.7 }`.
- `days`: a duration. Without it the modifier is permanent.

**Card and modal ranges are shown after modifiers.** If the player owns Press Office, the media anger shown on a card is already reduced. The global negative multiplier is included too.

### 4.9 Difficulty and score
**Difficulty presets** are chosen on the leader-selection screen and stored in config. Normal is the default and must meet the "very hard" target (§13).

| Knob | Snadná (easy) | Normální (normal) | Brutální (hard) |
|---|---|---|---|
| Chaos `chance` multiplier | 0.7 | 1.0 | 1.2 |
| Global negative multiplier | 0.8 | 1.0 | 1.15 |
| `T_base` | 42 | 45 | 48 |
| Drift multiplier | 0.7 | 1.0 | 1.2 |

**Score** is shown on every final screen (election or ending), so failed runs still measure progress:
```
score = round( 1000 × win
             + 400 × P_final
             + 25 × quartersCompleted
             + Σ resources_final
             + Σ_g (100 − anger_g) / 2 )
```
For an ending, `P_final` is the projection at the moment of the ending. The best score is kept per leader and difficulty in `localStorage` (this is not a game save). All score weights are tunable.

---

## 5. Leaders

The player picks a leader on the start screen. Each leader differs in:
- **starting values**
- a **unique ability**
- **policy leaning weights** (which categories appear in the draft)
- **party colour**
- **leader tree** (later)

All values are proposals. Keep them in `data/leaders.json`.

### 5.1 Leader table
| | **Kartin Mupka (ODS)** | **Bander Abis (ANO)** | **Dezněk Břich (Piráti)** | **Flipflip Motůrek (Motoristé)** |
|---|---|---|---|---|
| Profile | Right-wing conservative | Populist, left-leaning conservative | Liberal progressive, a mayor with a global reach | Right-wing libertarian with petrol in his veins |
| Party colour | blue | light blue/teal (distinct from ODS) | Pirate grey `#a1a1aa` | racing orange `#f97316` |
| Start: finances / support / coalition / prestige | 60 / 40 / 55 / 60 | 50 / 55 / 45 / 40 | 45 / 45 / 50 / 70 | 55 / 55 / 50 / 35 |
| Start anger: oligarchs / media / eu / activists / pensioners | 35 / 30 / 20 / 40 / 45 | 25 / 50 / 45 / 35 / 20 | 45 / 25 / 15 / 25 / 60 | 15 / 50 / 55 / 60 / 30 |
| Unique ability (once per year, button in UI) | **Austerity Freeze** (see §5.2) | **Campaign Mode:** instantly `support +10`, `media` anger +5. | Cesta na Tchaj-wan · Digitální stavebák · Tramvaj do každého kraje | Benzín za 29,90 · Zmocněnec pro klima · Hrad mě nechce |
| Leader tree theme (later) | Fiscal discipline & coalition craft | Campaigning & direct appeal | Transparentnost & digitalizace | Plný plyn & deregulace |

The two later leaders (Břich, Motůrek) follow `assignment-new-leaders-brich-moturek.md`; their abilities are the once-per-game kind (phase 17) and their live values are in `data/leaders.json`.

### 5.2 Abilities
- Each leader has **1 charge per game year**. The charge is available from day 1 and recharges at the start of quarters 5, 9 and 13. Unused charges do not stack.
- Abilities are data entries made of modifiers and instant effects, so new ones only need data.
- **Austerity Freeze** adds the modifier `{ "type": "multiplier", "target": "finances.negative", "value": 0.5, "days": 30 }`. For 30 days, every change that lowers Finances is halved at the moment it is applied:
  - budget changes that worsen the balance (their `changePct` is halved, §9.3)
  - negative `financesExtra` rolls
  - negative daily finance modifiers, such as Isolation
  
  Changes already applied are permanent; they are not undone when the 30 days end.

### 5.3 Draft algorithm
**Policy leaning weights** set the probability that a drawn card belongs to each category.

| Leaning (`leaning` id) | Mupka | Abis | Břich | Motůrek |
|---|---|---|---|---|
| libertarianism | **35** | 8 | 25 | **38** |
| conservatism | **35** | 15 | 8 | 27 |
| populism | 10 | **35** | 10 | 25 |
| socialism | 7 | **30** | 17 | 3 |
| progressivism | 8 | 5 | **35** | 2 |
| fascism | 3 | 3 | 2 | 4 |
| communism | 2 | 4 | 3 | 1 |

A card is **eligible** when:
- it is available for the current leader,
- it was not picked earlier in this run,
- it was not shown earlier in this quarter (including hands that were rerolled away), and
- it is not already in the hand being drawn.

**Drawing a hand of 3:**
1. Take the leanings that have at least one eligible card. Pick one of them by the leader's weights, renormalised over those leanings only. (This replaces "re-roll the leaning" and always terminates.)
2. Pick a uniformly random eligible card from that leaning.
3. Repeat until the hand has 3 distinct cards.
4. If there are no eligible cards left before the hand is full, relax the rules step by step and log `pool_relaxed` with the level used:
   1. allow cards shown earlier this quarter;
   2. allow cards picked at least `repeatCooldownQuarters = 4` quarters ago, oldest pick first;
   3. allow any card available to the leader that is not already in the hand.

**Content minimum:** a full run without rerolls needs at least **18 cards per leader** (15 picked by quarter 16, plus 3 in the last hand). The content target is **≥ 20 per leader**; a card available to both leaders counts for both. The validator warns (but still loads) when a leader has fewer than 18 non-filler cards, and refuses to start when a leader has fewer than 3.

**Leader art:**
- Pixel-art portrait and a small idle animation for each leader. Art is made by the human developer.
- Until then, use placeholder sprites: coloured blocks with initials.
- Render with `image-rendering: pixelated` at integer scale.
- **Satire guardrail:** real people appear **only** under the swapped-letter parody names (Kartin Mupka, Bander Abis, Dezněk Břich, Flipflip Motůrek, Lursula von der Eyen). Never use their real names in game text.

---

## 6. Policy cards and the quarterly draft

### 6.1 Flow
1. The quarter starts. The player receives PC (§8.1) and the game pauses.
2. The **policy draft modal** shows 3 cards (§5.3).
3. The player may **reroll** the 3 cards. Each reroll costs Political Capital, and the cost escalates within the quarter: 1, 2, 4, … The cost resets each quarter. A rerolled-away card cannot come back in the same quarter (unless the pool runs out, §5.3).
   - **[OPEN]** Which resource pays for rerolls is undecided. Keep the cost type and curve in config.
4. The player **must pick one**. There is no skip.
5. The card's immediate effects are rolled and applied (§4.8, §6.3). Its ongoing effects and chaos events are scheduled (§7). The pick is logged (§10).
6. The game resumes.

### 6.2 Card data format
Cards live in `data/policies/*.json`, one file per card or one per leaning. **The engine must not contain any card content.** Cards are written by Daniel and the developer.

```jsonc
{
  "id": "flat_tax_15",                    // unique, snake_case
  "leaning": "libertarianism",            // one of the 7 leaning ids (§5)
  "availableFor": ["mupka", "abis"],      // leader ids
  "title": "policy.flat_tax_15.title",    // locale key (Czech text in locale file)
  "description": "policy.flat_tax_15.desc",
  "drivenBy": "policy.flat_tax_15.drivenBy", // "who is pushing it", shown on card

  "effects": {                            // immediate, rolled uniformly in [min, max]
    "support":   { "min": -3, "max": 2 },
    "coalition": { "min": 4,  "max": 6 },
    "prestige":  { "min": 1,  "max": 3 }
    // "finances" is normally NOT listed: it is computed from budgetChanges (§9.3).
    // An optional "financesExtra": {min,max} may add a non-budget finance effect.
  },
  "anger": {                              // interest-group anger change, + = angrier
    "oligarchs":  { "min": -12, "max": -8 },
    "pensioners": { "min": 6,   "max": 10 }
  },
  "ongoing": [                            // optional persistent bonus/malus, always per DAY
    { "target": "support", "perDay": -0.05, "days": 180, "label": "policy.flat_tax_15.ongoing" }
  ],
  "budgetChanges": [                      // HIDDEN from player; drives finances (§9)
    { "chapter": "XXX", "type": "revenue", "changePct": -8 }
  ],
  "chaosEvents": ["flat_tax_15_chaos_1"], // ids of events in data/events (§7)
  "devOnly": false                        // true only for generated filler cards (§11)
}
```

- An `ongoing` target can be a resource (`support`) or an anger meter (`anger.media`).
- Ongoing effects from different sources stack. Re-applying the same source refreshes its duration rather than stacking.

### 6.3 Card display
The card UI shows:
- title
- leaning (icon + Czech label)
- description
- "who is pushing it"
- **expected effect ranges** for all 4 resources, including the computed Finances range, after modifiers (§4.8)
- interest-group anger changes, as coloured arrows with ranges
- an icon if the card has an ongoing effect, with its per-day value and duration

It must **never** show budget chapter names or codes. The player sees only the consequences.

Chaos events are **not** shown on the card. They are the surprise.

On pick, the actual values are rolled within each range and shown briefly as floating numbers on the affected bars and meters.

---

## 7. Chaos events, responses and opportunities

### 7.1 Chaos events
Chaos events are mostly negative surprises that fire **after a policy is picked**. They are the main source of chaos and difficulty.

```jsonc
{
  "id": "flat_tax_15_chaos_1",
  "chance": 0.35,                         // probability 0–1 that it fires
  "quarterOffset": 0,                     // 0 = the quarter the card was picked in (default), max 3
  "window": { "fromDay": 10, "toDay": 80 }, // day within that quarter, picked uniformly
  "text": "event.flat_tax_15_chaos_1.text", // Czech locale key
  "effects": { "support": { "min": -6, "max": -3 } },
  "anger":   { "media": { "min": 4, "max": 8 } },
  "ongoing": [],
  "budgetChanges": [],
  "responses": null                       // optional, see §7.3
}
```

**Timing:** when a card is picked, each of its events rolls `chance × chaosMultiplier` once. If it passes, the event is scheduled on a random day inside `window`, in the quarter `quarterOffset` quarters after the pick. Day 1 of a quarter is the draft day, so a window of 10–80 falls in the same quarter by default.

**Behaviour:**
- When an event fires, it appears as a **non-blocking pop-up** in news-ticker style. A plain event auto-dismisses after `popupSeconds = 5`, and the player can tap it for details.
- Its effects apply, and the event is logged.
- **Default difficulty knobs** (config): a global chaos multiplier on `chance` and a global multiplier on negative effects (§4.9).
- Each event fires at most once per pick. A card may reference 1–3 events.
- **Later, do not build:** yearly "major figure" events. Keep the scheduler generic (events with a trigger time, condition and effects) so they can be added as data. The budget vote (§4.7) and opportunities (§7.4) use the same scheduler.

### 7.2 Pop-up stacking
- At most `maxVisiblePopups = 3` at once (desktop) or 2 (mobile). Further pop-ups queue.
- Respondable events are never auto-dismissed by the queue; they take priority over plain events.

### 7.3 Respondable events
Some chaos events let the player react. This gives the player agency between drafts and counterplay against chaos. Content guideline: about **one in three** chaos events is respondable.

```jsonc
"responses": {
  "default": "ignore",                    // applied if the player does not answer in time
  "options": [
    { "id": "deny",      "label": "event.x.resp.deny",      "cost": { "pc": 0 },
      "effects": { "support": { "min": -2, "max": 0 } }, "anger": { "media": { "min": 3, "max": 5 } } },
    { "id": "apologise", "label": "event.x.resp.apologise", "cost": { "pc": 1 },
      "effects": { "coalition": { "min": -3, "max": -1 } } },
    { "id": "ignore",    "label": "event.x.resp.ignore",    "cost": { "pc": 0 } }
  ]
}
```

- The event's base effects apply when it fires. The chosen response's effects are added on top.
- The pop-up stays open with 2–3 buttons and a countdown of `responseTimeoutSec = 12` **real seconds**. The countdown only runs while the game is unpaused. The clock keeps running.
- On timeout the `default` response is applied.
- Options the player cannot afford are shown disabled.
- Each response is logged as `event_response` (with `timedOut: true/false`).
- Response ranges are shown on the buttons, after modifiers.

### 7.4 Opportunity pins
Opportunities give the player something to watch for and tap during the quarter, like the bubbles in Plague Inc.

- `opportunitiesPerQuarter = 3` pins spawn per quarter, each on a random day in `[5, 85]`.
- Each pin appears on a region, chosen with weight `w_r`.
- A pin expires after `opportunityLifetimeDays = 12` if not tapped.
- Tapping a pin applies a reward drawn by weight from `data/opportunities/*.json` and shows a short news line.

```jsonc
{
  "id": "opp_ribbon_cutting",
  "weight": 3,
  "text": "opportunity.ribbon_cutting.text",
  "reward": { "pc": 1, "effects": { "support": { "min": 1, "max": 2 } }, "anger": {} }
}
```

- Typical rewards: +1 PC, a small resource gain or a small anger relief. Rewards are small, so collecting pins matters only over the whole run.
- Logged as `opportunity_collected` or `opportunity_expired`.

---

## 8. Upgrade tree and Political Capital

### 8.1 Political Capital (PC)
PC is the simple placeholder currency for upgrades, rerolls and some event responses.
- **Earn:**
  - +2 PC at the start of each quarter
  - +1 extra at the start of a quarter if `support ≥ 60`
  - +1 per Regional Tours (§8.3)
  - from opportunity pins (§7.4)
- **Spend:** on upgrade nodes, rerolls and event responses.
- **Display:** a small counter next to the top bar.
- **[OPEN]** The final currency design is undecided.

### 8.2 Structure (full game, for architecture)
The full game has **5 trees**, one per main resource plus one leader tree. Trees are data-driven graphs (`data/upgrades/*.json`): nodes with id, cost, prerequisites, effect modifiers, and Czech label and description keys.

### 8.3 PoC branch: Public Support
Build only this branch, plus the generic tree engine. Values are proposals and should be tunable.

| id | Name (en, Czech in locale) | Cost | Requires | Effect (modifier) |
|---|---|---|---|---|
| `sup_campaign_office` | Campaign Office | 2 | — | `support.drift` × 0.7 |
| `sup_regional_tours` | Regional Tours | 3 | campaign_office | `pc.perQuarter` + 1 |
| `sup_press_office` | Press Office | 3 | campaign_office | `anger.media.gain` × 0.75 |
| `sup_pensioner_outreach` | Pensioner Outreach | 4 | regional_tours | `anger.pensioners.gain` × 0.75 |
| `sup_spin_doctors` | Spin Doctors | 4 | press_office | `support.loss` × 0.7, source `chaos` |
| `sup_permanent_campaign` | Permanent Campaign | 6 | pensioner_outreach **and** spin_doctors | `election.T_base` − 3 |

**UI:**
- Plague Inc.-style node graph in a modal or panel.
- Locked, available and owned states.
- Tapping a node shows its description and cost.
- The tree can be opened at any time and pauses the clock while open.

**Engine:** effects are expressed as **modifiers** (§4.8), for example `{ "type": "multiplier", "target": "anger.media.gain", "value": 0.75 }`. Policies, chaos events, responses, abilities and upgrades all use the **same modifier system**.

---

## 9. Budget data

### 9.1 Source
- The real data will come from **Monitor – Státní pokladna** (Ministry of Finance open data).
- Daniel will download and prepare it, most likely in R with the `statnipokladna` package, and deliver it as a file.
- **The game must not call any external API at runtime.**

### 9.2 Expected file format
The file is `data/budget.json`. **[OPEN]** The exact fields will be confirmed when the real dataset arrives. Write a single loader and validator so a change in format only touches one module.

```jsonc
{
  "source": "Monitor – Státní pokladna",
  "year": 2026,
  "currency": "CZK",
  "chapters": [
    { "code": "313", "name": "Ministerstvo práce a sociálních věcí", "revenue": 0, "expenditure": 0 }
  ]
}
```

- Ship a **mock** `budget.json` with roughly 10 chapters and plausible round numbers.
- Mark it clearly as fake, both in the file (`"source": "MOCK DATA"`) and with a small "mock data" badge in the UI.
- Chapter names are stored for developers only and are **never displayed to the player**.
- The validator checks that every `chapter` code referenced by cards, events, responses and budget-vote options exists in the file (or is `"*"`). Missing codes are a readable load error.

### 9.3 How data drives Finances
Every chapter keeps two running totals, `revPct_c` and `expPct_c`, the sum of all `changePct` applied to its revenue and expenditure. **`changePct` is always relative to the original value in the file, and changes add up; they do not compound.** This makes the effect of a card independent of what was picked before, so card ranges stay exact.

```
revenue_c(t)      = max(0, revenue_c0     × (1 + revPct_c / 100))
expenditure_c(t)  = max(0, expenditure_c0 × (1 + expPct_c / 100))

balance_0  = Σ revenue_c0 − Σ expenditure_c0          // at game start, from file
balance_t  = Σ revenue_c(t) − Σ expenditure_c(t)
E_0        = Σ expenditure_c0                          // original total, fixed for the run

finances   = clamp( F_start[leader]
                    + scale × (balance_t − balance_0) / E_0 × 100
                    + Σ financesExtra applied
                    + Σ finance modifiers accumulated ,  0, 100 )
default scale = 5   // tunable; Daniel will rebalance with real data
```

- A `budgetChanges` entry with `"chapter": "*"` applies to every chapter.
- When a budget change worsens the balance (revenue down or expenditure up), the `finances.negative` modifiers (for example Austerity Freeze) scale its `changePct` before it is added to the totals.
- **Card display:** the expected Finances range is the exact delta from `budgetChanges` plus the `financesExtra` range, after modifiers.
- **Debug overlay:** a toggle (`?debug=1`) shows chapter totals, `revPct`/`expPct` per chapter and the current balance, so developers can verify G2.

---

## 10. Decision log and history panel

### 10.1 Log
Every event is appended to an in-memory log. Each entry includes the quarter, day, timestamp, and the resource and anger snapshot after the event.

| Event type | Extra fields recorded |
|---|---|
| `run_started` | run id, seed, leader, difficulty, app version, data file versions/hashes |
| `leader_selected` | — |
| `draft_shown` | card ids |
| `reroll` | cost paid |
| `pool_relaxed` | relaxation level (§5.3) |
| `policy_picked` | card id, rolled values |
| `chaos_scheduled` | event id, scheduled day (or `notFired` with the roll) |
| `chaos_fired` | event id, rolled values |
| `event_response` | event id, response id, cost, rolled values, `timedOut` |
| `opportunity_collected` / `opportunity_expired` | opportunity id, region, rolled values |
| `budget_vote` | option id, `p_pass`, roll, passed, rolled values |
| `upgrade_bought` | node id, cost |
| `ability_used` | ability id |
| `zero_penalty_started` / `zero_penalty_ended` | resource |
| `scheduled_cancelled` | what was cancelled and why |
| `ending` | ending id |
| `election` | `S`, `T`, `P`, `u`, `ε`, `S_final`, `G`, per-region `s_r_final` and seats |
| `run_finished` | outcome, score, quarters completed |

- The run has a random **run id** and a **seed**.
- At game end, the log can be **exported as JSON**. This is the PoC proof for G3 and the future input for analytics.

### 10.2 Determinism
- The core uses **separate seeded RNG streams** per subsystem (draft, effects, chaos, opportunities, budget vote, election). An extra reroll then does not shift the chaos rolls.
- The simulation is deterministic given the **seed plus the ordered list of player inputs** (each with its game day). The log contains both, so a run can be replayed exactly. Real-time things (response countdowns) are recorded as the input that resulted.

### 10.3 Key decisions
The final screen shows up to 5 key decisions, in chronological order. They are the log entries with the highest **impact** among `policy_picked`, `chaos_fired`, `event_response`, `budget_vote` and `ability_used`:
```
impact = Σ |resource deltas, including the Finances delta| + 0.5 × Σ |anger deltas|
```

### 10.4 History panel (left, expandable)
The panel contains:
1. **Interest groups:** the five anger meters with trend arrows (§4.3).
2. **Active effects:** every ongoing bonus or malus and every active zero penalty, showing its source, its effect and the days remaining.
3. **Decision history:** a chronological list of picked policies, fired chaos events, responses, budget votes and abilities, with the applied values.

On mobile, the panel is a drawer that slides in from the left or a bottom sheet.

---

## 11. Text and localisation
- All Czech text lives in `locales/cs.json`, referenced by key. **No Czech strings in code.**
- Use placeholder text for content that hasn't been written yet, marked `[TODO]`.
- **Do not invent policy, event or ending content.** Real content comes from Daniel and the developer. To exercise the mechanics, create only clearly labelled dummy content (`"title": "[DUMMY] …"`):
  - **6 dummy cards** that together cover: a revenue change, an expenditure change, `financesExtra`, an ongoing effect, a respondable chaos event and a big oligarch anger change
  - **4 dummy chaos events**, at least 1 respondable
  - **3 dummy opportunities**
  - the **3 dummy budget-vote options** (§4.7)
- **Filler cards for development:** a script `scripts/gen-filler-cards.ts` generates `data/policies/_filler.json` with ≥ 20 cards per leader spread over all leanings, all marked `"devOnly": true` and titled `[FILLER] …`. This makes full runs and the simulator possible before real content exists. Config `includeDevFiller` (default `true`) controls whether filler cards are loaded; turn it off once real content meets the §5.3 minimum.

---

## 12. UI layout

### 12.1 Desktop (landscape)
```
┌────────────────────────────────────────────────────────────┐
│ [Finance ▮▮▮] [Podpora ▮▮] [Koalice ▮▮▮] [Prestiž ▮] PC:5  │  ← top bar
│ Q3 / rok 1 · 14. 8. · ⏸ 1× 2× 4× ☰    Volební projekce 38 %│
├──────────┬─────────────────────────────────────────────────┤
│ ◂ panel  │                                                 │
│ groups   │        static map of CZ — 14 regions            │
│ effects  │        tinted by regional support               │
│ history  │        (opportunity pins on regions)            │
│          │                     [news / response pop-ups ↘] │
│          │  [Leader portrait + ability]     [Upgrade tree] │
└──────────┴─────────────────────────────────────────────────┘
```
`☰` opens the pause menu.

### 12.2 Mobile (portrait)
- Compact top bar, with resources as 4 small bars and icons.
- The map fills the screen. Opportunity pins are at least 44 px.
- The left panel becomes a drawer opened by a button.
- Pop-ups stack at the bottom. Response buttons are full-width.
- The draft modal and the budget-vote modal show their options as a swipeable carousel.
- All touch targets are at least 44 px.
- No game saving in the PoC: if the phone kills the tab, the run is lost. On desktop, show the browser's "leave page?" warning during a run.

### 12.3 Screens and flow
```
Main menu ──► Leader select (+ difficulty) ──► [Tutorial, first run only] ──► Game
   ▲                                                                          │
   └──────────── Final screen (election night or ending) ◄────────────────────┘
```
- **Main menu:** Nová hra, Jak hrát (rules summary), Nastavení.
- **Leader select:** both leaders with portrait, profile, start values, ability; difficulty selector (default Normální); best score per leader and difficulty.
- **Tutorial (first run only):** about 6 skippable coach marks during Q1: top bar, map and projection, policy draft, side panel, first opportunity pin, upgrade tree. A `localStorage` flag remembers it was seen; Settings can reset it. Texts are `[TODO]` locale keys.
- **Pause menu:** Pokračovat, Restartovat (with confirmation), Hlavní menu (with confirmation), Nastavení.
- **Settings:** default speed, reduced motion (disables pulses and floating numbers), reset tutorial. Stored in `localStorage`.
- **Final screen:** see §4.6.

### 12.4 Map
- An SVG of the 14 kraje, built from open boundary data (for example Eurostat GISCO NUTS3 or ČÚZK). Simplify it for small file size and credit the source.
- The map is static, with no panning required, and regions are tappable to show their support and coefficient.

---

## 13. Technical requirements

**Recommended stack.** The developer may substitute an equivalent, but must justify it.
- **TypeScript**, built with **Vite**
- UI in **React** (or Preact)
- Map as inline **SVG**
- Sprites as PNG spritesheets
- A canvas or game engine is **not** required, since the game is mostly UI over a static map. Pick something like Phaser only if animation needs grow.
- Static hosting, such as GitHub Pages or Netlify. No backend.

**Architecture**
- **Simulation core** is pure TypeScript with no DOM access: state, tick, modifiers, draft, events, opportunities, budget vote, election, score.
  - It must be deterministic (§10.2), so runs can be reproduced from a log.
- **Data layer:** JSON files in `/data`, validated at load. The app shows a readable error if a file is invalid.

  | File | Contents |
  |---|---|
  | `data/budget.json` | budget chapters (§9) |
  | `data/regions.json` | seats, per-leader offsets, reveal order (§4.6) |
  | `data/leaders.json` | leaders, abilities, leaning weights (§5) |
  | `data/policies/*.json` | policy cards (§6) |
  | `data/events/*.json` | chaos events and responses (§7) |
  | `data/opportunities/*.json` | opportunity rewards (§7.4) |
  | `data/annual/budget_vote.json` | budget-vote options (§4.7) |
  | `data/upgrades/*.json` | upgrade trees (§8) |
  | `data/endings.json` | interest-group endings (§4.5) |

- **Config:** every tunable number named in this spec, including the difficulty presets, lives in a single config module (`/src/config.ts` or `data/config.json`).
- **UI layer** subscribes to simulation state. It must not contain game rules.

**Quality**
- Unit tests for the core:
  - modifier stacking and order (§4.8)
  - draft weighting and every pool-relaxation level
  - finances calculation, including `changePct` and Austerity Freeze
  - election model: `P(win)` matches `P` over many seeds, seats always sum to `G`, `G ≥ 101` exactly when the outcome is a win
  - zero-penalties, including the exit threshold and the Isolation cap
  - Oligarchs ending
  - budget vote pass and fail
  - replay: a log replayed with its seed and inputs gives the same final state
- A headless simulator (`npm run simulate -- --runs N --bot random|greedy --leader … --difficulty …`) prints win rate, average run length, average score, and how often each ending, snap election and pool relaxation happened.
  - **random** bot: random picks, random responses, collects each pin with probability 0.5.
  - **greedy** bot: picks the card and response with the best expected `P` after immediate effects, buys the cheapest available upgrade, collects all pins, uses the ability when its effect is useful.
  - **Targets on Normální (tunable):** random bot ≤ 15 % wins; greedy bot 20–40 % wins. The game should be very hard but winnable with good play.
- The repository has a README with how to run, how to add a card, an event, a response, an opportunity and a budget-vote option, how to replace the budget data, how to run the simulator, and where the tunables are.

---

## 14. Suggested milestones
Build and demo each milestone before starting the next.

1. **Skeleton:** project setup, responsive layout, main menu, top bar, side panel, SVG map, placeholder art.
2. **Core sim:** clock and speeds, resources, drift, anger meters with decay, modifier pipeline, seeded RNG streams, tests.
3. **Data:** loaders and validators, mock budget, `changePct` model, finances calculation, debug overlay.
4. **Leaders:** selection screen with difficulty, starting values, abilities with yearly charges, leaning weights.
5. **Draft:** card format, dummy and filler cards, draft algorithm with relaxation, draft modal, reroll, effect application, decision log.
6. **Chaos and opportunities:** event scheduler, pop-ups and stacking, respondable events, opportunity pins, ongoing effects shown in the panel.
7. **Annual budget vote** and mandatory spending growth.
8. **Upgrades:** tree engine and the Public Support branch.
9. **Endings and election:** zero-penalties, snap election, Oligarchs ending, live projection, election model and night, final screen with score and key decisions, JSON export.
10. **Polish:** tutorial, pause menu and settings, mobile pass, balance pass with both simulator bots, README.

---

## 15. Acceptance checklist (PoC done when…)
- [ ] A full 16-quarter run is playable on desktop and on a phone, and takes 15–20 min at 1×.
- [ ] Both leaders are selectable and play differently: start values, ability and draft mix. Abilities recharge yearly.
- [ ] Every quarter offers 3 cards weighted by leader. Reroll works, with escalating cost. A full run never fails to deal a hand.
- [ ] Picking a card changes resources and anger, changes budget chapters, and recomputes Finances from data.
- [ ] Replacing `data/budget.json` with another valid file works without code changes.
- [ ] Chaos events fire during the quarter as pop-ups and are logged. Respondable events offer choices, time out to the default, and are logged.
- [ ] Opportunity pins appear, can be collected and expire.
- [ ] The budget vote happens once per year, can pass or fail, and applies mandatory spending growth.
- [ ] The Public Support tree can be bought, and its effects are verifiably applied (including in the ranges shown on cards).
- [ ] The Oligarchs ending triggers at 100 anger. Coalition at 0 triggers a snap election.
- [ ] The election projection is visible and updates. Election night reveals regions one by one, and the seat total always agrees with the outcome.
- [ ] Every final screen shows the score, best score and key decisions.
- [ ] The tutorial runs on the first run and can be skipped. Difficulty presets work.
- [ ] The decision log is complete, exportable as JSON, and replays to the same final state.
- [ ] No Czech strings in code, and no budget chapter names visible to the player.
- [ ] All tunables are in config. Tests pass. Simulator targets are met on Normální. The README explains adding content and data.

---

## 16. Open decisions (Daniel)
| Topic | Status |
|---|---|
| What pays for rerolls; final upgrade currency | [OPEN]: Political Capital placeholder |
| Real budget dataset and its exact fields | [OPEN]: Daniel supplies from Státní pokladna |
| Mapping of policies to real budget chapters | [OPEN]: designed together with the cards |
| Real seats per region (election coefficients) | [OPEN]: Daniel supplies |
| Content for budget-vote options, opportunities and responses | [OPEN]: dummy content until written |
| Whether shown effect ranges can be misleading | [OPEN]: currently honest ranges |
| Regional specifics and dynamics | Later |
| Remaining 4 endings, remaining trees, leader trees | Later |
| Yearly major-figure events | Later |
| Saving a game in progress; player analytics; unlocks | Later |

**Decided in v1.1, please review.** These were filled in to close gaps; each can be changed or switched off in config.

| Decision | Where | Easy to undo? |
|---|---|---|
| Respondable events and opportunity pins fill the mid-quarter loop | §7.3, §7.4 | Set `opportunitiesPerQuarter = 0`; leave `responses` empty |
| Annual budget vote with mandatory 2 % spending growth | §4.7 | Disable in config |
| Anger slowly returns to the leader's starting value | §4.3 | `angerPullPerDay = 0` |
| Picked cards never repeat unless the pool runs out | §5.3 | `repeatCooldownQuarters` |
| Election uses logistic swing + D'Hondt-style seat split | §4.6 | Tunables `regionalNoise`, `seatsPerPoint` |
| Isolation finance damage is permanent (capped at −15) | §4.4 | `isolationFinanceCap = 0` |
| Score formula and difficulty presets | §4.9 | Config |
| Simulator targets: random ≤ 15 %, greedy 20–40 % | §13 | Config |
