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

That runs `node --test tests/`, which uses the built in runner. There is nothing to install.

## How the scoring works

- Domain fit: for a catalog item in domain D, compute the absolute gap between your value and the item's value for each of D's four attributes. Fit is `1 - mean(gap) / 100`, reported as a percentage.
- Mood fit: each mood slider scales a fixed set of attribute boosts (documented in `js/engine/moods.js`). For an item, mood fit maps its attributes against those boosts into 0 to 1, with 0.5 neutral.
- Planner blend: with any mood weight above zero, a slot's score is `0.65 * profile fit + 0.35 * mood fit`. With no mood weight, it is profile fit alone, and the log says so.
- Neighbor fit: the same mean gap formula, applied across all twenty attributes at once.
- Budget: the budget is floored into slot shares, each slot picks its best scoring affordable item, and the leftover becomes headroom. Invalid budgets are treated as zero.

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

`npm test` runs four suites with the Node built in runner:

- `tests/similarity.test.js`: fit bounds, gap ordering, explanation shape, symmetry, mood alignment.
- `tests/itinerary.test.js`: slot filling, domain correctness, zero budget sessions, upgrades, downgrades, blend weights.
- `tests/budget.test.js`: share allocation, sanitizing, and a sweep that plans real sessions across six budgets.
- `tests/trace.test.js`: trace shape, phase order, select step payloads, JSON serialization.

Current run: 51 tests, 283 assertions, all passing, in well under a second. No network access is used at any point.

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
  js/data/catalog.js      synthetic catalog (the first API seam)
  js/data/personas.js     synthetic archetypes (the second API seam)
  tests/                  four node:test suites
  README.md  NOTES.md  LICENSE
```

## Design notes

The palette is a warm dark loom room with five thread colors, one per domain, carried through the sliders, the chips, the meters, the log phases, and both canvas drawings. Headings use a system serif stack, the body uses the system sans stack, and the agent log uses a mono stack. No image assets exist: the mark is inline SVG and both visualizations are drawn in code. The interface avoids em dashes, en dashes, all caps kickers, and emoji by design.

## License

MIT. See LICENSE. Built by Aariv Patel.
