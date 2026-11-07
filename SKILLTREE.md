# Skill trees: separate workspace

The skill trees (upgrade trees) live in their own files, so they can be developed on the `David` branch
while the rest of the game is developed elsewhere without merge conflicts. Skill-tree work edits only the
files below; other work does not edit them.

## Skill-tree files

| File | What it holds |
|---|---|
| `data/upgrades/compass.json` | the Political Compass tree every leader has (28 boxes: written names and quotes, placeholder effect sizes) |
| `locales/skilltree.cs.json` | Czech texts: tree and node names/descriptions and the tree screen's UI chrome (`upgrades.*`, `hud.upgrades`) |
| `src/skilltree/` | tree screen (`UpgradeTree.tsx`, box card and active-ability strip inside), effect lines and quadrants (`nodeText.ts`), the card's quadrant emblems (`quadrantArt.tsx`), HUD button (`UpgradeButton.tsx`), styles (`skilltree.css`) |
| `src/core/upgrades.ts` | buying rules: node status, which trees a leader has, `buyUpgrade` |
| `tests/skilltree.test.ts` | skill-tree tests |
| `tests/fixtures/support-tree.json`, `tests/fixtures/trees.ts` | the old Public Support tree, kept as a fixture for the engine / modifier tests |

### Seams into the shared code

The rest of the game touches the tree only here. Changing a seam means touching a shared file, so keep
those changes small and tell the other side:

- `src/ui/screens/Game.tsx` renders `UpgradeButton` and `UpgradeTree` from `@/skilltree`.
- `src/core/simulation.ts` dispatches `buyUpgrade`; `src/core/bots.ts` buys nodes in simulations.
- `src/core/types.ts` (`UpgradeNode`, `UpgradeTree`, `ownedUpgrades`), `src/data/schemas.ts` and
  `src/data/loader.ts` (tree schema and checks).
- New modifier targets: `src/data/loader.ts` (known targets) plus the code where the effect applies.
- Texts the shared UI shows about upgrades stay in `locales/cs.json`: `history.upgrade`, `popup.upgrade`,
  `howToPlay.upgrades`, `tutorial.upgrades.*`, `dataError.unknownUpgrade`.

Open a pull request from `David` into `main` when a version is ready, and merge `main` into `David` now
and then to pick up the other work.

## The Political Compass

The tree is a compass seen from above: **Levice** on the left, **Pravice** on the right, **Progrese** at the
top, **Tradice** at the bottom (9 × 9 grid; `col` 0–8 from left, `row` 0–8 from top). The middle column
holds the Progrese and Tradice boxes; each side has an inner pair joined to them and then branches outwards.

Rules:
- **Start box.** Each leader owns their `start` box for free at the beginning of a run, and its effect is
  active from day 1. Placeholders: Mupka `c_r1t` (Pravice · tradice), Abis `c_l1t` (Levice · tradice).
- **Paths.** A box can be bought when a box it is linked to is owned. Links have no direction: list each
  connection once, on either box.
- **Joints.** A box with `requires` needs **all** listed boxes, not just one. The Levice and Pravice
  střed boxes (`c_l4m`, `c_r4m`) require both their 3B boxes, so they open only when both the Progrese and
  the Tradice side are owned. Lines into a joint are thicker and carry a "+" badge.
- **Forks.** Each group in `exclusive` is a fork: buying one box locks the others out for good. The links
  into a fork carry a lock icon, and buying a fork box asks the player to confirm first.

```jsonc
{
  "id": "compass",
  "name": "upgrades.compass.name",                // key in locales/skilltree.cs.json
  "axes": { "top": "upgrades.compass.axis.top", "bottom": "…", "left": "…", "right": "…" },
  "start": { "mupka": "c_r1t", "abis": "c_l1t" },  // every leader needs one
  "exclusive": [["c_r3pa", "c_r3pb"], …],          // forks: pick one
  "nodes": [
    { "id": "c_r1t",                    // unique across all trees
      "cost": 2,                        // Political Capital
      "links": ["c_trad", "c_r2t"],     // neighbours (path)
      "pos": { "col": 5, "row": 5 },    // place in the grid
      "name": "upgrade.c_r1t.name",
      "description": "upgrade.c_r1t.desc",
      "modifiers": [{ "type": "multiplier", "target": "anger.oligarchs.gain", "value": 0.85 }] }
  ]
}
```

Texts (`locales/skilltree.cs.json`): each box has a short name (it must fit the box, about 20
characters) and a description of the form „quote“ + the effect, e.g. „Kdo není na TikToku, ten nevolí.“
Zisky Podpory o 10 % vyšší. The lore follows the compass: Pravice · Progrese = efficient state, Brussels,
diplomacy, startups; Pravice · Tradice = business, thrift, party discipline, donors; Levice · Progrese =
social media, influencers, activists, own media; Levice · Tradice = pensions, unions, brass bands, party
cells. When an effect changes, change its sentence too.

Box ids: `c_prog` / `c_trad` in the middle; `c_r…` on the Pravice side and `c_l…` on Levice; then the step
outwards (1–4), `p` / `t` for the Progrese / Tradice half, and `a` / `b` / `1` / `2` / `m` for the boxes of a
fork or the shared middle box. A node can still use `"requires"` (all listed nodes owned) instead of
links, and a tree can still be leader-only with `"leader"`; more trees show as tabs.

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
| `budget.change` | every budget change, both ways (`multiplier`; Dotace uses ×2) |
| `budgetVote.redLinePenalty` | pass-chance penalty per crossed red line (`multiplier`; Microbossing uses ×0) |
| `compromise.<channel>.score` | mini-game score of a compromise channel, e.g. `compromise.press.score` (`add`) |
| `party.positiveOnly` | while > 0 (`add`), party demands apply only their good parts (Microbossing) |

Regional support changes count as `support` changes.

## Effects that need new code first

Anything tied to the newer mechanics needs a new modifier target in code before a node can use it, for
example: a second use of a leader ability or a stronger one, an extra regional tour per year, bigger rewards
or penalties for pledges, a softer red line in the budget vote, mutually exclusive nodes ("pick one of
two"). Adding a target touches shared code (see the seams above), so agree on it with whoever works on the
rest; once the target exists, nodes can use it.

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
within about 10 points of each other. With the `[DUMMY]` compass (1000 runs, Normal): random Mupka 0.5 %,
random Abis 22.7 %, greedy Mupka 29.8 %, greedy Abis 73.8 %. Abis is far stronger than Mupka. His start
box and side of the tree should cover his weak spots (media and EU anger, prestige) at a cost, rather
than add more support.

## Active abilities (P29)

A box with `active` is an ability the player uses again and again once the box is owned: `bundle` is its effect
(a negative `pc` is its PK price; the region key `self` is the chosen kraj), `target` is `region`, `group` or null,
`groupAnger` is the anger change of the chosen group, `cooldownDays` the wait before the next use. Input
`useUpgradeAction` (`src/core/upgrades.ts`), state `upgradeReady`. Effect lines in the box card are generated
from `modifiers`, so a box description only needs the quote and what the box stands for.
