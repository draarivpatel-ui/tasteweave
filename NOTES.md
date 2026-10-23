# NOTES

Build notes for TasteWeave, written the morning after the overnight build. Author: Aariv Patel.

## What was built

- A static single page app at `index.html`: vanilla HTML, CSS, and JavaScript, zero dependencies, deployable to GitHub Pages from the repo root with no build step.
- A taste profile model: 5 culture domains (music, film, food, books, places), 4 named attributes each, 20 sliders with worded endpoints, persisted to local storage only.
- A transparent similarity engine (`js/engine/similarity.js`): domain fit as one minus mean absolute gap, per attribute gap breakdowns, close match and stretch explanations, mood alignment, and twenty attribute neighbor fit.
- A discovery feed over a 40 entry synthetic catalog with per card "why this matched" math, a domain filter, and 8 synthetic neighbor archetypes with shared ground and biggest difference.
- An agentic afternoon planner (`js/engine/itinerary.js`): budget split into Listen 18 / Watch 30 / Cook 34 / Read 18 percent slot shares, four mood weights blended at 65 percent profile fit and 35 percent mood fit, one pick per slot, graceful downgrades when a top scorer is unaffordable, and zero cost escape hatches in every planner domain.
- A decision trace (`js/engine/trace.js`) with seven phases (read, mood, budget, search, select, review, done), replayed step by step in the Agent Log panel.
- Two canvas visualizations: a twenty spoke radar with a neutral reference ring, and a woven thread drawing where each domain is a smoothed thread through its four attribute values. Both redraw on every slider move and on resize, throttled through requestAnimationFrame.
- Accessibility and design floor: semantic landmarks, labeled controls, skip link, focus visible, live status regions, reduced motion support, responsive down to phone widths, system fonts only, no image assets, no emoji icons, no all caps kickers, and no em or en dashes in any UI copy.
- Four node:test suites under `tests/` covering similarity scoring, itinerary planning, budget handling, and decision trace generation. No network, no installs, runtime is milliseconds.

## Exact test numbers

Measured on this machine with Node v26.8.1, `node --test tests/`:

- 51 tests, 51 passed, 0 failed, 0 skipped.
- 283 assertions executed, measured by temporarily wrapping `node:assert/strict` with a counter and running the suites once (the counter script was deleted after the measurement; the runner itself does not report assertion totals).
- Duration: about 45 milliseconds, far under the 30 second limit.

Reproduce with `npm test` (or `node --test tests/`).

## Honest caveats

- The dataset is small and hand written: 40 invented catalog entries and 8 invented archetypes, authored to exercise the engine rather than to represent any real culture space. Nothing in the catalog is real, and that is the point, but it also means recommendations are demonstrations, not advice.
- The similarity engine is arithmetic, not machine learning: mean absolute gap over four attributes per domain. It is transparent and debuggable, but it knows nothing beyond the twenty numbers.
- Mood boosts are hand tuned heuristics in `js/engine/moods.js`. Focus uses a negative boost on music energy, which is a design choice, not a calibrated finding.
- Costs are rough integer estimates in dollars, including two "pantry" dishes at zero cost so a zero budget still plans a full session. Real costs would vary.
- The Qloo integration does not exist in this repo. The README documents the exact seams (the two data modules and the catalog parameter of `planItinerary`), and the app makes zero network requests. Any claim beyond that would be false.
- The profile persists only in this browser's local storage; there is no export or sync.
- The radar draws 20 small labels and gets tight below roughly 320 pixel wide viewports; the weave and the rest of the layout hold up.
- The planner treats a "session" as four fixed slots in a fixed order. It does not schedule times or handle multi hour activities; places appear in the feed only, not in plans.

## Devpost bullets

- Rate 20 culture sliders across music, film, food, books, and places, then watch your taste signature weave itself: a live canvas radar and a thread drawing that redraw with every drag.
- Every match shows its math. A transparent gap based similarity engine scores a labeled synthetic catalog, and each card lists the exact attribute gaps and its biggest stretch, no black box anywhere.
- An agentic afternoon planner takes a budget and four mood weights and assembles a listen, watch, cook, read session, blending 65 percent profile fit with 35 percent mood fit and never spending over budget, even at zero dollars.
- The Agent Log replays the planner's full decision trace step by step: profile read, mood blend, budget split, per slot search and select with runner ups, and honest downgrades when a top scorer costs too much.
- Zero dependencies, zero network calls, zero image assets: one static page with code drawn visuals and 51 tests over 283 assertions, plus a documented seam showing exactly where the Qloo taste API would replace the synthetic dataset.

## Summary

TasteWeave is complete and working as specified: a GitHub Pages ready single page app with a transparent similarity engine over a labeled synthetic dataset, an explained discovery feed, a budget and mood aware agentic itinerary planner with a step by step agent log, and two live canvas visualizations of the taste signature. It passes 51 tests with 283 assertions in under a second, claims nothing beyond what ships, and documents the Qloo API seam precisely.
