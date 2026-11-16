// Exact planning under a budget, and the taste versus cost Pareto frontier.
//
// The slot-share planner in itinerary.js is greedy: it fixes each slot's share
// of the budget first, then picks the best item inside each share. That is easy
// to explain but can leave fit on the table, for example when a cheap music
// pick would free money for a much better film. This module solves the same
// problem exactly as a multiple-choice knapsack (one item per slot, total cost
// within budget) by dynamic programming over whole-dollar costs, and it maps
// every complete plan onto a cost and fit plane so the trade-off is visible.
//
// Plan fit is the mean of the four slot scores, each in [0, 1], using exactly
// the same slot scoring as the greedy planner (profile fit, blended with mood
// fit when any mood is set). Pure functions, no DOM, no network.

import { SLOTS, scoreSlot, sanitizeBudget, planItinerary } from './itinerary.js';
import { flattenMoods, moodMass } from './moods.js';
import { explainDomainFit, fitPercent } from './similarity.js';
import { createTrace } from './trace.js';

// Filling more slots always beats a higher score with fewer slots. A plan's
// score sum is at most SLOTS.length, so this factor keeps the order strict.
const FILL_WEIGHT = 10;

function sanitizeConstraints(constraints = {}) {
  const minFit = Number(constraints.minFit);
  return {
    minFit: Number.isFinite(minFit) ? Math.max(0, Math.min(1, minFit)) : 0,
    exclude: new Set(Array.isArray(constraints.exclude) ? constraints.exclude : []),
  };
}

// Scored, eligible candidates for each slot, best first, ties broken by lower
// cost and then by id so every result is deterministic.
export function slotCandidates({ profile, moods, catalog, constraints }) {
  const weights = flattenMoods(moods);
  const mass = moodMass(weights);
  const rules = sanitizeConstraints(constraints);
  const bySlot = {};
  for (const slot of SLOTS) {
    bySlot[slot.id] = catalog
      .filter((item) => item.domain === slot.domain && !rules.exclude.has(item.id))
      .map((item) => {
        const score = scoreSlot(item, profile, weights, mass);
        const cost = Math.max(0, Math.round(Number(item.cost) || 0));
        return { item, cost, total: score.total, profileFit: score.profileFit, moodFit: score.moodFit };
      })
      .filter((entry) => entry.total >= rules.minFit)
      .sort((a, b) => b.total - a.total || a.cost - b.cost || (a.item.id < b.item.id ? -1 : 1));
  }
  return { bySlot, weights, mass };
}

function better(a, b) {
  if (!b) return true;
  if (a.value !== b.value) return a.value > b.value;
  return a.cost < b.cost;
}

// Exact optimum by dynamic programming. dp[c] holds the best partial plan that
// spends exactly c dollars over the slots seen so far.
export function optimizeItinerary({ profile, moods, budget, catalog, constraints }) {
  const safeBudget = sanitizeBudget(budget);
  const { bySlot, weights, mass } = slotCandidates({ profile, moods, catalog, constraints });

  let dp = new Array(safeBudget + 1).fill(null);
  dp[0] = { value: 0, filled: 0, score: 0, cost: 0, choices: [] };
  let states = 0;

  for (const slot of SLOTS) {
    const next = new Array(safeBudget + 1).fill(null);
    for (let c = 0; c <= safeBudget; c++) {
      const base = dp[c];
      if (!base) continue;
      // Option 1: leave this slot empty.
      const skip = { ...base, choices: [...base.choices, null] };
      if (better(skip, next[c])) next[c] = skip;
      // Option 2: any affordable candidate.
      for (const cand of bySlot[slot.id]) {
        const cost = c + cand.cost;
        if (cost > safeBudget) continue;
        states += 1;
        const filled = base.filled + 1;
        const score = base.score + cand.total;
        const option = { value: filled * FILL_WEIGHT + score, filled, score, cost, choices: [...base.choices, cand] };
        if (better(option, next[cost])) next[cost] = option;
      }
    }
    dp = next;
  }

  let best = null;
  for (const entry of dp) {
    if (entry && better(entry, best)) best = entry;
  }

  const picks = {};
  SLOTS.forEach((slot, index) => {
    const cand = best.choices[index];
    picks[slot.id] = cand
      ? {
          slot: slot.id,
          verb: slot.verb,
          item: cand.item,
          profileFit: cand.profileFit,
          moodFit: cand.moodFit,
          total: cand.total,
          reason: optimumReason(profile, cand),
        }
      : null;
  });

  const trace = buildOptimumTrace({ best, picks, safeBudget, bySlot, mass, states });
  return {
    strategy: 'optimal',
    picks,
    totalCost: best.cost,
    headroom: safeBudget - best.cost,
    budget: safeBudget,
    allocations: null,
    filledSlots: best.filled,
    meanFit: best.filled ? best.score / SLOTS.length : 0,
    statesExplored: states,
    trace,
    moodMass: mass,
  };
}

function optimumReason(profile, cand) {
  const { close, stretch } = explainDomainFit(profile, cand.item);
  let text = close.length
    ? `Sits close to your taste on ${close.map((g) => `${g.label} (you ${g.userValue}, this ${g.itemValue})`).join(', ')}.`
    : 'No attribute lands within the close band; this pick earns its place on total plan fit.';
  if (stretch) text += ` It stretches you on ${stretch.label} (you ${stretch.userValue}, this ${stretch.itemValue}).`;
  return text;
}

function buildOptimumTrace({ best, picks, safeBudget, bySlot, mass, states }) {
  const trace = createTrace();
  const sizes = SLOTS.map((s) => `${bySlot[s.id].length} ${s.domain}`).join(', ');
  trace.step('read', `Exact optimizer: one pick per slot from ${sizes} candidates, total cost at most $${safeBudget}.`);
  trace.step('mood', mass > 0 ? 'Mood blend is active, so each slot score mixes profile fit and mood fit.' : 'No mood weight set, so slot scores are profile fit alone.');
  trace.step('budget', `No fixed slot shares. Money moves to whichever slot gains the most fit per dollar spent.`);
  trace.step('search', `Dynamic programming over every whole-dollar spend from $0 to $${safeBudget}: ${states} candidate placements checked.`);
  for (const slot of SLOTS) {
    const pick = picks[slot.id];
    trace.step(
      'select',
      pick
        ? `${slot.verb}: ${pick.item.title} by ${pick.item.creator} for $${pick.item.cost} (fit ${fitPercent(pick.total)}).`
        : `${slot.verb}: no affordable candidate passes the constraints, so the slot stays empty.`,
      pick ? { slot: slot.id, chosen: pick.item.title, cost: pick.item.cost, fit: fitPercent(pick.total) } : { slot: slot.id, chosen: null }
    );
  }
  trace.step('review', `Total cost $${best.cost} of $${safeBudget}, mean plan fit ${fitPercent(best.filled ? best.score / SLOTS.length : 0)}. No other combination within budget scores higher.`);
  trace.step('done', 'Optimal plan ready. The frontier chart shows how much fit each extra dollar buys.');
  return trace;
}

// Every complete plan (one candidate in each slot) as a point on the cost and
// fit plane. With eight candidates per slot that is 8 to the 4th, 4096 plans.
export function enumeratePlans({ profile, moods, catalog, constraints }) {
  const { bySlot } = slotCandidates({ profile, moods, catalog, constraints });
  const lists = SLOTS.map((s) => bySlot[s.id]);
  const plans = [];
  if (lists.some((list) => list.length === 0)) return plans;
  const walk = (index, cost, score, ids) => {
    if (index === lists.length) {
      plans.push({ ids, cost, fit: score / SLOTS.length });
      return;
    }
    for (const cand of lists[index]) {
      walk(index + 1, cost + cand.cost, score + cand.total, [...ids, cand.item.id]);
    }
  };
  walk(0, 0, 0, []);
  return plans;
}

// Non-dominated plans: no other plan is both cheaper or equal and fitter or
// equal with one strict. Sorted by rising cost, so fit rises strictly too.
export function paretoFrontier(points) {
  const sorted = [...points].sort((a, b) => a.cost - b.cost || b.fit - a.fit);
  const frontier = [];
  let bestFit = -Infinity;
  for (const p of sorted) {
    if (p.fit > bestFit + 1e-12) {
      frontier.push(p);
      bestFit = p.fit;
    }
  }
  return frontier;
}

// The fittest frontier plan that costs at most the budget, or null.
export function frontierAtBudget(frontier, budget) {
  let pick = null;
  for (const p of frontier) {
    if (p.cost <= budget) pick = p;
  }
  return pick;
}

// Side by side: the greedy slot-share plan and the exact optimum, plus the
// frontier they both sit on or under.
export function comparePlanners({ profile, moods, budget, catalog, constraints }) {
  const { bySlot } = slotCandidates({ profile, moods, catalog, constraints });
  const eligible = new Set(Object.values(bySlot).flatMap((entries) => entries.map((entry) => entry.item)));
  const greedyCatalog = catalog.filter((item) => eligible.has(item));
  const greedy = planItinerary({ profile, moods, budget, catalog: greedyCatalog });
  const optimal = optimizeItinerary({ profile, moods, budget, catalog, constraints });
  const greedyFilled = SLOTS.filter((s) => greedy.picks[s.id]).length;
  const greedyFit = SLOTS.reduce((sum, s) => sum + (greedy.picks[s.id] ? greedy.picks[s.id].total : 0), 0) / SLOTS.length;
  const plans = enumeratePlans({ profile, moods, catalog, constraints });
  const frontier = paretoFrontier(plans);
  return {
    budget: optimal.budget,
    greedy: { result: greedy, filledSlots: greedyFilled, meanFit: greedyFit, cost: greedy.totalCost },
    optimal: { result: optimal, filledSlots: optimal.filledSlots, meanFit: optimal.meanFit, cost: optimal.totalCost },
    uplift: optimal.meanFit - greedyFit,
    plans,
    frontier,
  };
}
