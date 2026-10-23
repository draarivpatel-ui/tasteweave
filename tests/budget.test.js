import { test } from 'node:test';
import assert from 'node:assert/strict';

import { allocateBudget, sanitizeBudget, planItinerary, SLOTS } from '../js/engine/itinerary.js';
import { defaultProfile } from '../js/engine/profile.js';
import { CATALOG } from '../js/data/catalog.js';

const MOODS = { energize: 70, unwind: 20, focus: 0, wander: 10 };

test('budget 40 splits into the documented slot shares', () => {
  assert.deepEqual(allocateBudget(40), { listen: 7, watch: 12, cook: 13, read: 8 });
});

test('budget 0 allocates zero to every slot', () => {
  assert.deepEqual(allocateBudget(0), { listen: 0, watch: 0, cook: 0, read: 0 });
});

test('allocations never go negative and never exceed the budget', () => {
  for (const budget of [0, 1, 7, 13, 44, 80, 250]) {
    const allocations = allocateBudget(budget);
    const sum = SLOTS.reduce((acc, slot) => acc + allocations[slot.id], 0);
    assert.ok(sum <= budget, `allocation sum ${sum} exceeds budget ${budget}`);
    for (const slot of SLOTS) {
      assert.ok(allocations[slot.id] >= 0, `negative allocation for ${slot.id} at budget ${budget}`);
    }
  }
});

test('allocations are finite numbers', () => {
  const allocations = allocateBudget(66);
  for (const slot of SLOTS) {
    assert.ok(Number.isFinite(allocations[slot.id]), `non finite allocation for ${slot.id}`);
  }
});

test('sanitizeBudget guards against invalid input', () => {
  assert.equal(sanitizeBudget('abc'), 0);
  assert.equal(sanitizeBudget(-5), 0);
  assert.equal(sanitizeBudget(12.7), 13);
  assert.equal(sanitizeBudget(null), 0);
  assert.equal(sanitizeBudget(undefined), 0);
});

test('the planner never exceeds the budget across a sweep of budgets', () => {
  for (const budget of [0, 5, 17, 40, 66, 80]) {
    const result = planItinerary({ profile: defaultProfile(), moods: MOODS, budget, catalog: CATALOG });
    assert.ok(result.totalCost <= budget, `spent ${result.totalCost} over budget ${budget}`);
    assert.equal(result.headroom, budget - result.totalCost);
  }
});

test('a zero budget on the real catalog yields an all free session', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: MOODS, budget: 0, catalog: CATALOG });
  assert.equal(result.totalCost, 0);
  for (const slot of SLOTS) {
    assert.equal(result.picks[slot.id].item.cost, 0, `${slot.id} picked a paid item at budget 0`);
  }
});

test('an invalid budget is treated as zero, not a crash', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: MOODS, budget: 'not a number', catalog: CATALOG });
  assert.equal(result.budget, 0);
  assert.equal(result.totalCost, 0);
});
