# Budget Inc. — Brief for the developer

## What we're building
A browser game in the spirit of **Plague Inc.**, where the player is the Czech prime minister and has to survive a 4-year term and win the next election. The tone is satirical and chaotic: surviving a full term should be **very hard**.

The visual mix is **Plague Inc. layout** (static map of Czech regions, resource bars, pop-up events) with **Broforce-style pixel art** for the political leaders.

All player-facing text is in **Czech**. Code, file names and documentation are in **English**.

## What the Proof of Concept must prove
1. The game runs smoothly in a web browser, **on both phone and desktop**.
2. Real budget data drives the simulation. Daniel will supply a Státní pokladna dataset later; until then you build against a mock file with the same structure.
3. The player's decisions are recorded in a structured way, ready to be stored and analysed later.

Polish and content volume are not the goal. **Working mechanics are.**

## How a run plays (15–20 minutes)
- Pick a leader, **Kartin Mupka (ODS)** or **Bander Abis (ANO)**, and a difficulty. A short tutorial runs the first time.
- Time runs from the election day through 16 quarters, with pause and speed controls.
- **Every quarter** you pick 1 of 3 random policy cards. Each card shows:
  - its political leaning
  - its expected effects
  - who is pushing it
- You can reroll the three cards for an increasing cost.
- Picked policies can trigger **chaos events** during the quarter, mostly unpleasant ones. Some of them let you **respond** (deny, apologise, blame someone…) within a few seconds.
- **Opportunity pins** pop up on the map. Tap them in time for Political Capital or small bonuses.
- **Once a year** you push the **state budget** through parliament: tight, balanced or generous. It can fail.
- You balance **4 resources**: Finances, Public Support, Coalition Stability and International Prestige.
- You also manage **5 interest groups** that get angry: Oligarchs, Media, EU, Activists and Pensioners.
- You spend Political Capital on an **upgrade tree**.
- At the end comes **election night**: regions report results one by one, the seat count climbs toward 101, and you win or lose. Every run ends with a score.

## In the PoC vs. later
| Must have now | Later |
|---|---|
| Both leaders, difficulty levels, tutorial | Other 4 upgrade branches + leader trees |
| One upgrade branch (Public Support) | Other 4 interest-group endings |
| One interest-group ending (Oligarchs) | Regional specifics |
| Chaos events after policy picks, some respondable | Saving a game in progress |
| Opportunity pins and the yearly budget vote | Player decision analytics |
| Election night results screen and score | Yearly "major figure" events |
| Card system + **at least 20 cards per leader** written by you/Daniel | Unlocks and achievements |

Until the real cards exist, the game generates labelled **filler cards** so full runs work. A card available to both leaders counts for both.

## Your part
- **Pixel art** (leaders, UI): you create it, with input from Daniel. Placeholders are fine until then.
- **Content**: you and Daniel write policy cards, chaos events (with optional responses), opportunities and the three budget-vote options, using the templates below. The spec defines the exact data format.

## Policy card template
```
Title (CZ):
Leaning: fascism / communism / socialism / progressivism / libertarianism / conservatism / populism
Description (CZ, 1–2 sentences):
Who is pushing it (CZ):
Effects on resources (expected range):  Finances … | Support … | Coalition … | Prestige …
Effects on interest-group anger (+ = angrier):  Oligarchs … | Media … | EU … | Activists … | Pensioners …
Ongoing effect (optional): what, how much PER DAY, for how many days
Hidden budget changes: which budget chapter, revenue or expenditure, by how many %
                       (% of the original value; not shown to the player)
Chaos events (1–3): see the template below
Available for: both leaders / Mupka only / Abis only
```

## Chaos event template
```
Text (CZ):
Chance: … %   (stored in data as 0–1, e.g. 35 % → 0.35)
When: which days of the quarter (e.g. day 10–80); same quarter as the pick, or 1–3 quarters later
Effects on resources / anger: ranges, as on the card
Responses (optional, for about 1 in 3 events): 2–3 options, each with
    Label (CZ) | PC cost | effects | which one happens if the player does nothing
```

## Opportunity template
```
Text (CZ, one news line):
Reward: +PC and/or small resource gain or anger relief
How common: weight (1 = rare, 3 = common)
```

## How to use the detailed spec
Give **`budget-inc-spec.md`** to Claude at the start of the project and build milestone by milestone, as described in its section 14. Anything marked **[OPEN]** is a decision Daniel will make later. Build it so it's easy to change, and don't invent a final answer. The spec's section 16 also lists the design decisions added in v1.1 for review.
