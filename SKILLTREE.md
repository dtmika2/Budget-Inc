# Skill trees: Daniel's workspace

The skill trees (upgrade trees) are **data only** and live in their own files, so Daniel can design them
while the developer works on the rest of the game. The developer does not edit these files; Daniel does
not need to touch code.

## Your files

| File | What it holds |
|---|---|
| `data/upgrades/support.json` | the shared Public Support tree (every leader) |
| `data/upgrades/abis.json` | Bander Abis's leader tree (`"leader": "abis"`), starter version with `[DUMMY]` texts |
| `data/upgrades/mupka.json` | Kartin Mupka's leader tree (create it the same way, `"leader": "mupka"`) |
| `locales/skilltree.cs.json` | Czech names and descriptions of trees and nodes |

Everything else (code, `locales/cs.json`, other data) belongs to the developer. Work on the `skill-tree`
branch and open a pull request into `main` when a version is ready.

## A tree

```jsonc
{
  "id": "abis",                         // unique tree id
  "name": "upgrades.abis.name",         // key in locales/skilltree.cs.json
  "leader": "abis",                     // leave out for a tree every leader has
  "nodes": [
    { "id": "abis_own_media",           // unique across all trees; prefix with the tree id
      "cost": 2,                        // Political Capital
      "requires": [],                   // node ids that must be owned first (all of them)
      "pos": { "col": 1, "row": 0 },    // place in the tree view (grid)
      "name": "upgrade.abis_own_media.name",
      "description": "upgrade.abis_own_media.desc",
      "modifiers": [{ "type": "multiplier", "target": "anger.media.gain", "value": 0.8 }] }
  ]
}
```

Each `name` / `description` key needs a line in `locales/skilltree.cs.json`.

## Effects you can use today (modifier targets)

`type` is `multiplier` (× value) or `add` (+ value). Optional `"source"` limits it to one kind of change
(`policy`, `chaos`, `response`, `opportunity`, `budget_vote`, `compromise`, `demand`, `ability`, …).

| Target | Meaning |
|---|---|
| `support.gain`, `support.loss`, `support.drift` | gains, losses, daily drift of Public Support |
| `coalition.gain` / `.loss` / `.drift` | the same for Coalition Stability |
| `prestige.gain` / `.loss` / `.drift` | the same for International Prestige |
| `finances.gain` / `.loss`, `finances.negative` | Finances (`negative` also halves budget changes that worsen the balance) |
| `anger.<group>.gain` / `.loss` | anger of `oligarchs`, `pensioners`, `media`, `eu`, `activists` (gain = getting angrier) |
| `pc.perQuarter` | Political Capital per quarter (`add`) |
| `election.T_base` | the election threshold (`add`, negative = easier) |

Regional support changes count as `support` changes.

## Effects that need the developer first

Anything tied to the newer mechanics needs a new modifier target in code before a node can use it, for
example: Campaign Mode twice a year or a stronger ability, an extra regional tour per year, bigger rewards
or penalties for pledges, a softer red line in the budget vote, mutually exclusive nodes ("pick one of
two"). Write the wish as a short list (target name + what it does) and hand it to the developer; once the
target exists, you can use it in your files.

## Check your changes

```bash
npm run dev
```
Open the game, pick the leader, open "Vylepšení". With more than one tree there are tabs.

```bash
npm test
```
Catches typos: unknown targets, missing texts, unknown prerequisites, cycles, duplicate ids.

```bash
npm run simulate -- --runs 1000 --bot both
```
Balance: win rates per leader. Targets on Normal: random ≤ 15 %, greedy 20–40 %, and the two leaders
within about 10 points of each other. Today Abis is already stronger than Mupka; the starter Abis tree
raises greedy Abis from ~58 % to ~72 %, so the final tree should trade power for drawbacks or cover his
weak spots (media and EU anger, prestige) rather than add support.
