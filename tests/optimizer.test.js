import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, ATTRIBUTES, defaultProfile } from '../js/engine/profile.js';
import { SLOTS, planItinerary, scoreSlot } from '../js/engine/itinerary.js';
import { flattenMoods, moodMass } from '../js/engine/moods.js';
import {
  slotCandidates,
  optimizeItinerary,
  enumeratePlans,
  paretoFrontier,
  frontierAtBudget,
  comparePlanners,
} from '../js/engine/optimizer.js';
import { CATALOG } from '../js/data/catalog.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededProfile(rng) {
  const p = {};
  for (const d of DOMAINS) {
    p[d.id] = {};
    for (const a of ATTRIBUTES[d.id]) p[d.id][a.id] = Math.round(rng() * 100);
  }
  return p;
}

function seededMoods(rng) {
  return { energize: Math.round(rng() * 100), unwind: Math.round(rng() * 100), focus: rng() < 0.5 ? 0 : Math.round(rng() * 100), wander: rng() < 0.5 ? 0 : 60 };
}

const NO_MOODS = { energize: 0, unwind: 0, focus: 0, wander: 0 };

// Independent brute force: every slot may also stay empty. Same objective as
// the optimizer (more filled slots first, then higher score, then lower cost).
function bruteForce({ profile, moods, budget, catalog, constraints }) {
  const { bySlot } = slotCandidates({ profile, moods, catalog, constraints });
  let best = null;
  const walk = (i, cost, score, filled) => {
    if (cost > budget) return;
    if (i === SLOTS.length) {
      const cand = { cost, score, filled };
      if (
        !best ||
        filled > best.filled ||
        (filled === best.filled && score > best.score + 1e-12) ||
        (filled === best.filled && Math.abs(score - best.score) <= 1e-12 && cost < best.cost)
      ) best = cand;
      return;
    }
    walk(i + 1, cost, score, filled);
    for (const c of bySlot[SLOTS[i].id]) walk(i + 1, cost + c.cost, score + c.total, filled + 1);
  };
  walk(0, 0, 0, 0);
  return best;
}

test('optimizer: matches an independent brute force on 120 seeded profiles, moods and budgets', () => {
  const rng = mulberry32(2026);
  for (let trial = 0; trial < 120; trial++) {
    const profile = seededProfile(rng);
    const moods = trial % 3 === 0 ? NO_MOODS : seededMoods(rng);
    const budget = Math.round(rng() * 80);
    const constraints = trial % 4 === 0 ? { minFit: 0.7 } : undefined;
    const opt = optimizeItinerary({ profile, moods, budget, catalog: CATALOG, constraints });
    const bf = bruteForce({ profile, moods, budget, catalog: CATALOG, constraints });
    assert.equal(opt.filledSlots, bf.filled, `trial ${trial} filled`);
    assert.ok(Math.abs(opt.meanFit * SLOTS.length - bf.score) < 1e-9, `trial ${trial} score ${opt.meanFit * 4} vs ${bf.score}`);
    assert.equal(opt.totalCost, bf.cost, `trial ${trial} cost tie-break`);
  }
});

test('optimizer: never exceeds the budget and reports consistent totals (invariant)', () => {
  const rng = mulberry32(7);
  for (let trial = 0; trial < 60; trial++) {
    const budget = Math.round(rng() * 80);
    const opt = optimizeItinerary({ profile: seededProfile(rng), moods: seededMoods(rng), budget, catalog: CATALOG });
    const picks = SLOTS.map((s) => opt.picks[s.id]).filter(Boolean);
    const cost = picks.reduce((sum, p) => sum + p.item.cost, 0);
    assert.ok(cost <= budget);
    assert.equal(opt.totalCost, cost);
    assert.equal(opt.headroom, budget - cost);
    for (const s of SLOTS) {
      if (opt.picks[s.id]) assert.equal(opt.picks[s.id].item.domain, s.domain, 'each slot keeps its domain');
    }
  }
});

test('optimizer: never scores below the greedy slot-share planner on the same inputs', () => {
  const rng = mulberry32(99);
  let strictlyBetter = 0;
  for (let trial = 0; trial < 80; trial++) {
    const args = { profile: seededProfile(rng), moods: seededMoods(rng), budget: Math.round(rng() * 80), catalog: CATALOG };
    const cmp = comparePlanners(args);
    assert.ok(cmp.optimal.filledSlots >= cmp.greedy.filledSlots);
    if (cmp.optimal.filledSlots === cmp.greedy.filledSlots) assert.ok(cmp.optimal.meanFit >= cmp.greedy.meanFit - 1e-12, `trial ${trial}`);
    if (cmp.uplift > 1e-9) strictlyBetter += 1;
  }
  assert.ok(strictlyBetter > 0, 'the exact optimizer finds real gains somewhere');
});

test('optimizer: the default profile at $40 beats the greedy plan (regression)', () => {
  const cmp = comparePlanners({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: CATALOG });
  assert.equal(cmp.greedy.meanFit.toFixed(3), '0.853');
  assert.equal(cmp.optimal.meanFit.toFixed(3), '0.884');
  assert.equal(cmp.optimal.cost, 30);
});

test('optimizer: optimum fit never drops as the budget grows (monotone)', () => {
  const rng = mulberry32(5);
  for (let trial = 0; trial < 12; trial++) {
    const profile = seededProfile(rng);
    const moods = seededMoods(rng);
    let last = -1;
    for (let b = 0; b <= 80; b += 4) {
      const fit = optimizeItinerary({ profile, moods, budget: b, catalog: CATALOG }).meanFit;
      assert.ok(fit >= last - 1e-12, `budget ${b}`);
      last = fit;
    }
  }
});

test('optimizer: constraints exclude items and enforce a minimum slot fit', () => {
  const base = optimizeItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: CATALOG });
  const firstPick = base.picks.listen.item.id;
  const without = optimizeItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: CATALOG, constraints: { exclude: [firstPick] } });
  assert.notEqual(without.picks.listen.item.id, firstPick);
  const strict = optimizeItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: CATALOG, constraints: { minFit: 0.99 } });
  for (const s of SLOTS) {
    if (strict.picks[s.id]) assert.ok(strict.picks[s.id].total >= 0.99);
  }
  assert.ok(strict.trace.steps.some((st) => /stays empty/.test(st.message)), 'empty slots are explained in the trace');
});

test('comparison: a minimum fit of one applies to both planners and their summaries', () => {
  const cmp = comparePlanners({
    profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: CATALOG,
    constraints: { minFit: 1 }
  });
  for (const summary of [cmp.greedy, cmp.optimal]) {
    assert.equal(summary.filledSlots, 0);
    assert.equal(summary.meanFit, 0);
    assert.equal(summary.cost, 0);
    assert.equal(summary.result.totalCost, 0);
    assert.equal(summary.result.headroom, 80);
    assert.ok(SLOTS.every((slot) => summary.result.picks[slot.id] === null));
  }
  assert.equal(cmp.uplift, 0);
  assert.deepEqual(cmp.plans, []);
  assert.deepEqual(cmp.frontier, []);
});

test('comparison: exclusions and the minimum fit produce the same eligible candidates for both planners', () => {
  const args = { profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: CATALOG };
  const base = comparePlanners(args);
  const exclude = SLOTS.map((slot) => base.greedy.result.picks[slot.id].item.id);
  for (const minFit of [0, 0.9, 1]) {
    const constraints = { minFit, exclude };
    const cmp = comparePlanners({ ...args, constraints });
    const { bySlot } = slotCandidates({ ...args, constraints });
    for (const summary of [cmp.greedy, cmp.optimal]) {
      const picks = SLOTS.map((slot) => summary.result.picks[slot.id]).filter(Boolean);
      assert.equal(summary.filledSlots, picks.length);
      assert.equal(summary.cost, picks.reduce((sum, pick) => sum + pick.item.cost, 0));
      assert.ok(Math.abs(summary.meanFit - picks.reduce((sum, pick) => sum + pick.total, 0) / SLOTS.length) < 1e-12);
      for (const pick of picks) {
        assert.ok(!exclude.includes(pick.item.id));
        assert.ok(pick.total >= minFit);
        assert.ok(bySlot[pick.slot].some((candidate) => candidate.item === pick.item));
      }
    }
    assert.ok(cmp.plans.every((plan) => plan.ids.every((id) => !exclude.includes(id))));
    assert.ok(cmp.optimal.filledSlots >= cmp.greedy.filledSlots);
    assert.equal(cmp.uplift, cmp.optimal.meanFit - cmp.greedy.meanFit);
  }
});

test('optimizer: bad budgets are treated as zero, and zero still fills every slot from free entries', () => {
  for (const budget of [-5, 'abc', NaN, null]) {
    const opt = optimizeItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget, catalog: CATALOG });
    assert.equal(opt.budget, 0);
    assert.equal(opt.totalCost, 0);
    assert.equal(opt.filledSlots, SLOTS.length);
  }
});

test('optimizer: the trace walks read, mood, budget, search, one select per slot, review, done', () => {
  const opt = optimizeItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: CATALOG });
  assert.deepEqual(opt.trace.steps.map((s) => s.phase), ['read', 'mood', 'budget', 'search', 'select', 'select', 'select', 'select', 'review', 'done']);
  assert.match(opt.trace.steps[3].message, /\d+ candidate placements checked/);
  assert.equal(opt.strategy, 'optimal');
  assert.equal(opt.allocations, null);
});

test('candidates: sorted best first with deterministic ties, scored exactly like the greedy planner', () => {
  const moods = { energize: 40, unwind: 0, focus: 0, wander: 70 };
  const { bySlot } = slotCandidates({ profile: defaultProfile(), moods, catalog: CATALOG });
  const weights = flattenMoods(moods);
  const mass = moodMass(weights);
  for (const s of SLOTS) {
    const list = bySlot[s.id];
    assert.equal(list.length, 8);
    for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].total >= list[i].total);
    for (const c of list) assert.equal(c.total, scoreSlot(c.item, defaultProfile(), weights, mass).total);
  }
});

test('enumeration: every complete plan appears once, 8 to the 4th', () => {
  const plans = enumeratePlans({ profile: defaultProfile(), moods: NO_MOODS, catalog: CATALOG });
  assert.equal(plans.length, 4096);
  assert.equal(new Set(plans.map((p) => p.ids.join('|'))).size, 4096);
  assert.equal(enumeratePlans({ profile: defaultProfile(), moods: NO_MOODS, catalog: CATALOG, constraints: { minFit: 1.01 } }).length, 0);
});

test('frontier: points are mutually non-dominated and every plan is dominated by or on the frontier', () => {
  const plans = enumeratePlans({ profile: seededProfile(mulberry32(3)), moods: NO_MOODS, catalog: CATALOG });
  const frontier = paretoFrontier(plans);
  for (let i = 1; i < frontier.length; i++) {
    assert.ok(frontier[i].cost > frontier[i - 1].cost, 'cost rises');
    assert.ok(frontier[i].fit > frontier[i - 1].fit, 'fit rises');
  }
  for (const p of plans) {
    const covered = frontier.some((f) => f.cost <= p.cost && f.fit >= p.fit - 1e-12);
    assert.ok(covered, `plan ${p.ids.join(',')} escapes the frontier`);
  }
});

test('frontier: the best frontier plan within budget equals the exact optimum (cross-check)', () => {
  const rng = mulberry32(11);
  for (let trial = 0; trial < 25; trial++) {
    const profile = seededProfile(rng);
    const moods = seededMoods(rng);
    const frontier = paretoFrontier(enumeratePlans({ profile, moods, catalog: CATALOG }));
    const budget = Math.round(rng() * 80);
    const atBudget = frontierAtBudget(frontier, budget);
    const opt = optimizeItinerary({ profile, moods, budget, catalog: CATALOG });
    assert.ok(atBudget, 'free entries make every budget feasible');
    assert.ok(Math.abs(atBudget.fit - opt.meanFit) < 1e-9, `trial ${trial}`);
    assert.ok(atBudget.cost <= budget);
  }
});

test('frontier: edge cases (empty input, ties keep the cheapest, budget below every plan)', () => {
  assert.deepEqual(paretoFrontier([]), []);
  const f = paretoFrontier([{ cost: 5, fit: 0.5 }, { cost: 5, fit: 0.7 }, { cost: 3, fit: 0.7 }, { cost: 9, fit: 0.7 }]);
  assert.deepEqual(f, [{ cost: 3, fit: 0.7 }]);
  assert.equal(frontierAtBudget([{ cost: 4, fit: 0.2 }], 3), null);
});

test('greedy planner is untouched: same picks as before for the default profile', () => {
  const greedy = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: CATALOG });
  assert.equal(greedy.totalCost, 0);
  assert.equal(SLOTS.filter((s) => greedy.picks[s.id]).length, 4);
});
