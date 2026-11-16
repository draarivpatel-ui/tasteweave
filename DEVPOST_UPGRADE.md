# TasteWeave Devpost update

Paste-ready sections for the Devpost project page. Every number below was copied from `npm test` and from `comparePlanners` on the current code. Rerun both before pasting if the code changes. The catalog and archetypes are synthetic, and the page says so wherever they appear.

## Inspiration

Recommendation apps rarely show their work. I wanted a taste planner where every score can be traced back to plain numbers, and where the planning agent writes down each decision it makes, so a person can check it instead of trusting it.

## What it does

You set twenty taste sliders across music, film, food, books and places. TasteWeave scores a 40 entry synthetic catalog against you with a transparent gap formula, finds taste neighbor archetypes, draws your taste signature on canvas, and plans an afternoon session (one thing to listen to, watch, cook and read) inside a budget, writing its full decision trace to an on-page ledger.

The planner now has two strategies. Slot shares splits the budget into fixed shares first. Exact optimum treats the session as a multiple-choice knapsack and solves it exactly by dynamic programming, so money flows to whichever slot gains the most fit. A frontier chart plots all 4096 complete plans by cost and fit and draws the Pareto frontier, with both strategies marked on it.

| Budget | Slot shares mean fit | Exact optimum mean fit |
| --- | --- | --- |
| `$20` | 85 | 87 |
| `$40` | 85 | 88 |
| `$60` | 88 | 89 |

These figures are for the neutral starting profile with no mood set.

## How we built it

Plain JavaScript modules, no build step, no dependencies and no network calls. The engine is pure functions with the catalog passed in as data, which leaves a clean seam for a live taste API. The frontier chart is a pure drawing function, so its output is tested against a recording canvas.

## Challenges

An optimizer is only worth showing if it is provably right. The test suite compares it with an independent brute force on 120 seeded random profiles, moods and budgets, checks that the best frontier plan within each budget matches it on 25 more, and confirms it never overspends, never scores below the greedy planner and never loses fit as the budget grows.

Nutrition was left out on purpose. The catalog has no nutrition data, and inventing figures for invented dishes would have put made-up measurements on screen.

## Accomplishments

95 automated tests pass. Synthetic data, computed numbers and browser-only storage each carry a visible badge. Keyboard shortcuts plan the afternoon (P) and switch strategies (O).

## What's next

Replacing the synthetic catalog with live taste API entities through the documented data seam, and adding per-slot constraints such as a maximum cook time.

## Built with

JavaScript, HTML canvas, CSS, Node.js test runner
