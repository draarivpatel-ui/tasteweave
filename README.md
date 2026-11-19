# TasteWeave

A taste graph planner, built for the Qloo Agentic Hackathon by Aariv Patel.

Rate twenty attribute sliders across music, film, food, books, and places. TasteWeave turns that profile into three things, computed in the open over a labeled synthetic dataset:

1. A discovery feed of catalog matches and taste neighbor archetypes, where every card shows the attribute gaps behind its score.
2. An agentic afternoon planner that takes a budget and four mood weights, assembles a listen, watch, cook, read session, and writes its full decision trace to an agent log, step by step.
3. A taste signature drawn two ways on canvas: a twenty spoke radar and a woven thread drawing, both live, both responding to every slider.

Everything runs locally in one static page. The catalog, the archetypes, and all scores are synthetic and labeled as such. No network requests, no accounts, no tracking.

## What works right now

- Profile Studio: twenty sliders in five domain cards, with named endpoints (Hushed to Kinetic, Safe to Fearless, and so on). The profile persists in this browser via local storage, and Reset to Neutral clears it.
- Transparent similarity: fit is one minus the mean absolute gap between your slider values and an item's attribute values, per domain. Every card lists its closest attributes with both numbers and the gap, and states its biggest stretch honestly.
- Discovery feed: the twelve best matches across the synthetic catalog, or all eight entries for one domain, sortable by the domain filter. Every entry is invented for this project.
- Taste Neighbors: eight synthetic archetypes scored across all twenty attributes, with the three shared attributes and the single biggest difference shown.
- Afternoon Planner: a 0 to 80 dollar budget splits into slot shares (Listen 18 percent, Watch 30 percent, Cook 34 percent, Read 18 percent), four mood weights tilt the scores, and the planner picks one item per slot without ever exceeding the budget. Zero budget works: every planner domain keeps zero cost entries in the catalog.
- Exact optimum planner: a second strategy solves the same budget problem exactly instead of greedily (details below), and the Taste and Cost Frontier chart plots every complete plan so you can see what each extra dollar buys.
- Keyboard: P plans the afternoon, O switches between slot shares and the exact optimum and plans again. Shortcuts pause while a text field has focus.
- Agent Log: the planner writes a decision trace (read, mood, budget, search, select, review, done), and the panel replays it one step at a time, including when a top scorer was skipped to stay under budget.
- Taste Signature: a canvas radar with one spoke per attribute, and a woven thread drawing where each domain is a thread whose height follows its four attribute values. Both redraw as you drag.
- Accessibility: semantic landmarks, labeled sliders, radio filter, keyboard operable controls, visible focus, skip link, live status regions, and reduced motion support.

## Try it

The app is a static single page with no build step and no dependencies.

- Any static file server works, for example: `python3 -m http.server 8000` from this folder, then open `http://localhost:8000`.
- To publish, commit the folder to a repository and enable GitHub Pages on the root. `index.html` sits at the repo root, so it deploys as is.

Run the tests with Node 18 or newer:

```
npm test
```

That runs `node --test tests/*.test.js`, which uses the built in runner. There is nothing to install.

## How the scoring works

- Domain fit: for a catalog item in domain D, compute the absolute gap between your value and the item's value for each of D's four attributes. Fit is `1 - mean(gap) / 100`, reported as a percentage.
- Mood fit: each mood slider scales a fixed set of attribute boosts (documented in `js/engine/moods.js`). For an item, mood fit maps its attributes against those boosts into 0 to 1, with 0.5 neutral.
- Planner blend: with any mood weight above zero, a slot's score is `0.65 * profile fit + 0.35 * mood fit`. With no mood weight, it is profile fit alone, and the log says so.
- Neighbor fit: the same mean gap formula, applied across all twenty attributes at once.
- Budget: the budget is floored into slot shares, each slot picks its best scoring affordable item, and the leftover becomes headroom. Invalid budgets are treated as zero.

## Exact optimum and the taste and cost frontier

The original planner is greedy: it fixes each slot's share of the budget first, then picks the best affordable item inside each share. That is easy to explain, but it can leave fit on the table. `js/engine/optimizer.js` solves the same problem exactly. Choosing one item per slot with a total cost within budget is a multiple-choice knapsack, solved by dynamic programming over every whole-dollar spend from zero to the budget. More filled slots always win, then higher total fit, then lower cost. Slot scores are the same ones the greedy planner uses. Before comparison, both strategies use the same eligible candidates, including minimum fit requirements and excluded items.

The frontier view enumerates all 4096 complete plans (8 candidates in each of the 4 slots), places each on a cost and mean fit plane, and draws the Pareto frontier: the plans no other plan beats on both cost and fit.

For the default neutral profile with no mood set (numbers from the current code):

| Budget | Slot shares (mean fit, cost) | Exact optimum (mean fit, cost) |
| --- | --- | --- |
| `$0` | 85, `$0` | 85, `$0` |
| `$20` | 85, `$0` | 87, `$14` |
| `$40` | 85, `$0` | 88, `$30` |
| `$60` | 88, `$30` | 89, `$44` |
| `$80` | 89, `$44` | 89, `$44` |

At `$40` the slot-share split leaves every slot with too little to buy its best item, so it picks four free entries. The optimizer moves the money to the film and food slots, where it buys the most fit.

How the optimizer is checked:

- It matches an independent brute force (every slot may also stay empty) on 120 seeded random profiles, mood blends and budgets, including runs with a minimum slot fit.
- The best frontier plan within a budget equals the optimizer's answer on 25 more seeded cases.
- It never exceeds the budget, never scores below the greedy planner, and its fit never drops as the budget rises.

Nutrition is not modeled. The catalog has no nutrition data, and inventing nutrition figures for invented dishes would put made-up measurements on screen, so the frontier trades taste against cost only.

## Where the Qloo taste API would plug in

The shipped app makes no network calls and includes no API keys. The dataset is synthetic by design, and the code is arranged so a live integration would replace data, not logic:

1. `js/data/catalog.js` exports `CATALOG`, a flat array of entries with `domain`, `title`, `creator`, `cost`, and a four value `attrs` object. A Qloo integration would replace this array with entities pulled from the taste API: fetch candidate entities per domain, then map each entity's Qloo tags, categories, or affinities onto the same four attribute values per domain. The shape is the contract; nothing else in the app reads the file.
2. `js/data/personas.js` exports `NEIGHBORS`, eight full twenty value profiles. A live version could derive these from Qloo audience or affinity data instead of hand written archetypes.
3. The engine is data agnostic. `domainFit`, `neighborFit`, and `planItinerary` accept plain objects, and `planItinerary` already takes the catalog as a parameter. Only `app.js` imports the data modules, in two import lines at the top, so swapping in an async loader that fetches and maps Qloo responses would not touch the scoring, the planner, or the trace.
4. Costs: catalog entries carry a `cost` field used by the planner's budget slots. A live build would map ticket, purchase, or ingredient estimates onto the same field.

The README states this as a design seam. It is not a claim of a live integration: no Qloo API code ships here.

## Synthetic data notice

All 40 catalog entries, all 8 neighbor archetypes, and the default profile are invented for this project. Titles, creators, venues, dishes, and blurbs are fiction, written to give the similarity engine something honest to chew on. Every page section that shows them labels them synthetic. No real releases, venues, or dishes are described, and no real person is represented by an archetype.

## Tests

`npm test` runs eight files (95 tests) with the Node built in runner:

- `tests/similarity.test.js`: fit bounds, gap ordering, explanation shape, symmetry, mood alignment.
- `tests/itinerary.test.js`: slot filling, domain correctness, zero budget sessions, upgrades, downgrades, blend weights.
- `tests/budget.test.js`: share allocation, sanitizing, and a sweep that plans real sessions across six budgets.
- `tests/trace.test.js`: trace shape, phase order, select step payloads, JSON serialization.
- `tests/optimizer.test.js` (16): brute force cross-checks, budget and monotonicity invariants, constraints shared by both planners, frontier dominance, and a regression pin for the default profile.
- `tests/frontier-ui.test.js` (11): the frontier chart against a recording canvas, the summary text, the strategy controls, manual radio changes followed by the `O` shortcut, the data badges and the page design rules.
- `tests/dom-smoke.test.js` (13): static page and accessibility checks.
- `tests/repository-hygiene.test.js` (4): encoded and binary probes, guards across all text files and binary metadata and a check for temporary files or caches.

Current run: 95 tests, all passing. No network access is used at any point.

## Project structure

```
tasteweave/
  index.html            the single page
  styles.css            the whole look, system fonts only
  app.js                UI wiring and canvas drawing
  js/engine/profile.js    domains, attributes, profile helpers
  js/engine/moods.js      mood definitions and boost weights
  js/engine/similarity.js fit, gaps, explanations, neighbor fit
  js/engine/itinerary.js  slots, budget, planner, blend
  js/engine/trace.js      decision trace
  js/engine/optimizer.js  exact budget optimizer and Pareto frontier
  js/ui/frontier-view.js  frontier chart drawing (pure, testable)
  js/data/catalog.js      synthetic catalog (the first API seam)
  js/data/personas.js     synthetic archetypes (the second API seam)
  tests/                  eight node:test files
  README.md  NOTES.md  LICENSE
```

## Design notes

The palette is a warm dark loom room with five thread colors, one per domain, carried through the sliders, the chips, the meters, the log phases, and both canvas drawings. Headings use a system serif stack, the body uses the system sans stack, and the agent log uses a mono stack. No image assets exist: the mark is inline SVG and both visualizations are drawn in code. The interface avoids em dashes, en dashes, all caps kickers, and emoji by design, and section titles stand alone with no tagline under them. Synthetic and computed data carry visible badges.

## License

MIT. See LICENSE. Built by Aariv Patel.
