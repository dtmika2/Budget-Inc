# Budget commentary panel ("tooltip") — proposal

Mockups: `mockups/budget-tooltip.html?v=explain|compare|chain|options|pinned|debate`, renders in `mockups/png/tooltip/`.
Layout: sliders (left) · small chamber estimate + large commentary (middle) · policy-card impact lanes (right).
All numbers and advisor texts in the mockups are illustrative; real texts come from data (`budgetItem.*.advisor.cut/overspend` and new keys), never hard-coded.

## 1. What it reacts to (triggers)

| Trigger | What the panel shows |
|---|---|
| Hover / drag a slider step | That step: current → hovered value, explanation, recommendations. The impact card outlines this area's share. |
| Focus a slider with the keyboard (←/→) | Same as hover; Tab cycles the recommendations, Enter applies one. |
| Hover an impact row (resource / group / kraj) | Reverse view: which sliders cause this number, and a tip on how to move it. Source sliders are highlighted on the left. |
| Hover a chamber bloc or seat | What that bloc wants, how many votes it is worth, and what it would cost. |
| Click ☆ (priority) | What doubling gains and cuts means for this area this year and next. |
| Nothing hovered | A summary of the whole budget: the biggest risk, the best single move, and the chance of passing. |
| Phone | Tap and hold = hover, tap = pin; the panel becomes a bottom sheet. |

Rules: show changes after ~120 ms (no flicker while sweeping), keep the last content while the pointer crosses empty space, and use one sentence of advice at most per state — the details sit in sections below it.

## 2. Content structure (every variant)

1. **Header:** who speaks + what is being inspected (`Školství +2 → +3`).
2. **Explanation ("Proč"):** 2–4 cause → effect lines, generated from the rules that actually fired: safe band (`band`), the ★ multiplier, `angerPerStep`, `onCut` / `onOverspend`, coalition red lines and `regionTraits`.
3. **Recommendations ("Doporučuji"):** 1–3 concrete moves, each with its effect chips and an **Použít** button; the best one is marked.
4. **Footer:** uncertainty (effects are ranges) and shortcuts.

## 3. How recommendations are computed

A pure core function (`src/core/`, no DOM, seeded RNG only) — e.g. `previewBudget(state, change)` returning the expected deltas and the min/max range, plus `suggestBudgetMoves(state, focus, goal)`:

1. Generate candidates: the focused slider at ±1, plus one ±1 step on any other slider ("pay for it from…"), plus moving ★.
2. Score each with `previewBudget`: pass odds, Finances reserve, group anger thresholds, red lines and region gains, weighted by the current **goal** (default: pass the budget without losing support).
3. Drop candidates that break a red line or the free-funds limit; keep the top 3 that differ from each other (not three versions of the same move).

Cost: about 14 sliders × 2 directions ≈ 30 previews per hover — cheap, and it can be cached per budget state.

## 4. Variants in the mockups

| # | Variant | Strength | Weakness |
|---|---|---|---|
| A | **Proč + co dělat** — explanation and recommendation columns side by side | Clearest; the default candidate | Text-heavy for experienced players |
| B | **Před a po** — table of now → after with a verdict per row | Fast to scan; good for experts | Explains less of the "why" |
| C | **Řetěz důsledků** — timeline: now → Q1 → Q2 correction → elections | Shows delayed effects (EU, the mid-year correction) | Needs lookahead logic |
| D | **Tři cesty** — careful / balanced / all-in options, with the recommended one marked | Turns the slider into a decision | Only fits one slider at a time |
| E | **Připnutí a kombinace** — pin one comment, hover another, see the combined effect, with undo history | Strongest planning tool | Advanced; hide it until the player has finished the tutorial |
| F | **Dva poradci** — an economist and an election strategist disagree, then give a verdict and a compromise | Most flavour; fits the satire | Two voices means more text to write |

Suggestion: ship **A** as the default with a toggle to **B** (compact mode); add **E** (pin + combine) as the advanced layer; use **F**'s two voices only for big decisions (red lines, an outcome near 101 votes).

## 5. Advanced ideas

- **Goal mode:** the player picks a goal ("pass with ≥ 70 %", "Finances ≥ 10", "calm the pensioners") and every recommendation is ranked for it.
- **What-if pins:** pin up to 3 comments; the panel shows them side by side and their combined effect, with one button to apply all.
- **Undo history:** every slider change is a chip; click one to go back to that state.
- **Red-line radar:** before you reach a coalition red line, the panel warns you one step ahead ("one more step and the partner votes against").
- **Threshold alerts:** when a group's anger would cross a level that starts protests or petitions, or a kraj would flip a seat.
- **Delayed consequences:** a lookahead into the next quarters (C) — the mid-year correction, EU reactions, chaos-event risk.
- **Leader voice:** the tone and the weighting of advice change with the leader (each leader trusts one advisor more).
- **Learning mode:** verbose in the first year, compact after it; the "Proč" lines you have already seen collapse to one line.
- **Ranges, not only averages:** "+1…+3" with a small band, so the player learns that effects are random within a range.
- **Explain the chamber:** hovering a seat names its bloc and its price; "4 MPs hesitate" links to the move that wins them back.
- **Accessibility:** everything works by keyboard; colours are always paired with ▲/▼ and words (lepší / horší).

## 6. Open questions for Daniel

1. ~~Default variant~~ — decided: **A** by default, **B** as compact mode.
2. Should recommendations be allowed to move sliders other than the hovered one ("pay for it from Státní správa")?
3. One advisor voice, or two (F) for big decisions?
4. Does the goal mode belong in the first version or later?
