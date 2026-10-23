import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planItinerary, scoreSlot, SLOTS, PROFILE_WEIGHT, MOOD_WEIGHT } from '../js/engine/itinerary.js';
import { defaultProfile } from '../js/engine/profile.js';
import { CATALOG } from '../js/data/catalog.js';

const NO_MOODS = { energize: 0, unwind: 0, focus: 0, wander: 0 };
const ENERGIZE = { energize: 100, unwind: 0, focus: 0, wander: 0 };

// Hand built fixture so upgrade and downgrade behavior is deterministic.
const mini = [
  { id: 'm1', domain: 'music', title: 'Quiet A', creator: 'A', blurb: '', cost: 0, attrs: { energy: 10, warmth: 50, edge: 50, obscurity: 50 } },
  { id: 'm2', domain: 'music', title: 'Loud B', creator: 'B', blurb: '', cost: 12, attrs: { energy: 95, warmth: 50, edge: 50, obscurity: 50 } },
  { id: 'f1', domain: 'film', title: 'Calm C', creator: 'C', blurb: '', cost: 0, attrs: { pace: 10, heart: 50, darkness: 50, surrealism: 50 } },
  { id: 'f2', domain: 'film', title: 'Fast D', creator: 'D', blurb: '', cost: 16, attrs: { pace: 95, heart: 50, darkness: 50, surrealism: 50 } },
  { id: 'fo1', domain: 'food', title: 'Plain E', creator: 'E', blurb: '', cost: 0, attrs: { heat: 50, richness: 50, freshness: 50, adventure: 50 } },
  { id: 'fo2', domain: 'food', title: 'Spicy F', creator: 'F', blurb: '', cost: 10, attrs: { heat: 95, richness: 50, freshness: 50, adventure: 50 } },
  { id: 'b1', domain: 'books', title: 'Slow G', creator: 'G', blurb: '', cost: 0, attrs: { momentum: 10, lyricism: 50, darkness: 50, wonder: 50 } },
  { id: 'b2', domain: 'books', title: 'Quick H', creator: 'H', blurb: '', cost: 8, attrs: { momentum: 95, lyricism: 50, darkness: 50, wonder: 50 } },
];

test('the planner fills all four slots', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: mini });
  assert.equal(Object.keys(result.picks).length, 4);
  for (const slot of SLOTS) {
    assert.ok(result.picks[slot.id] !== null && result.picks[slot.id] !== undefined, `slot ${slot.id} empty`);
  }
});

test('each pick comes from the slot domain', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: mini });
  assert.equal(result.picks.listen.item.domain, 'music');
  assert.equal(result.picks.watch.item.domain, 'film');
  assert.equal(result.picks.cook.item.domain, 'food');
  assert.equal(result.picks.read.item.domain, 'books');
});

test('a zero budget still assembles a session from zero cost picks', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: ENERGIZE, budget: 0, catalog: mini });
  assert.equal(result.picks.listen.item.cost, 0);
  assert.equal(result.picks.watch.item.cost, 0);
  assert.equal(result.picks.cook.item.cost, 0);
  assert.equal(result.picks.read.item.cost, 0);
  assert.equal(result.totalCost, 0);
  assert.equal(result.headroom, 0);
});

test('a generous budget upgrades to higher scoring, costlier picks', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: ENERGIZE, budget: 80, catalog: mini });
  assert.equal(result.picks.listen.item.title, 'Loud B');
  assert.equal(result.picks.watch.item.title, 'Fast D');
  assert.equal(result.picks.cook.item.title, 'Spicy F');
  assert.equal(result.picks.read.item.title, 'Quick H');
});

test('mood weights change which item a slot picks', () => {
  const flat = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 80, catalog: mini });
  const tilted = planItinerary({ profile: defaultProfile(), moods: ENERGIZE, budget: 80, catalog: mini });
  assert.notEqual(flat.picks.listen.item.id, tilted.picks.listen.item.id);
  assert.equal(flat.picks.listen.item.title, 'Quiet A');
  assert.equal(tilted.picks.listen.item.title, 'Loud B');
});

test('a slot downgrades gracefully when the top scorer costs too much', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: ENERGIZE, budget: 0, catalog: mini });
  const selectSteps = result.trace.steps.filter((s) => s.phase === 'select');
  assert.match(selectSteps[0].message, /stayed under budget/);
  assert.equal(result.picks.listen.item.title, 'Quiet A');
});

test('every pick carries a nonempty explanation', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: mini });
  for (const slot of SLOTS) {
    const reason = result.picks[slot.id].reason;
    assert.ok(typeof reason === 'string' && reason.length > 10, `weak reason for ${slot.id}`);
  }
});

test('pick totals are finite numbers', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: NO_MOODS, budget: 40, catalog: mini });
  for (const slot of SLOTS) {
    assert.ok(Number.isFinite(result.picks[slot.id].total), `non finite total for ${slot.id}`);
  }
});

test('costs sum to the reported total and headroom', () => {
  const result = planItinerary({ profile: defaultProfile(), moods: ENERGIZE, budget: 80, catalog: mini });
  const sum = SLOTS.reduce((acc, slot) => acc + result.picks[slot.id].item.cost, 0);
  assert.equal(result.totalCost, sum);
  assert.equal(result.totalCost, 46);
  assert.equal(result.headroom, 34);
});

test('scoreSlot blends profile and mood fit at the documented weights', () => {
  const weights = { 'music.energy': 1 };
  const { total, moodFit } = scoreSlot(mini[1], defaultProfile(), weights, 1);
  const expected = PROFILE_WEIGHT * 0.8875 + MOOD_WEIGHT * 0.95;
  assert.ok(Math.abs(total - expected) < 1e-9, `expected ${expected}, got ${total}`);
  assert.ok(Math.abs(moodFit - 0.95) < 1e-9);
});

test('scoreSlot with no mood mass falls back to pure profile fit', () => {
  const { total, moodFit } = scoreSlot(mini[1], defaultProfile(), {}, 0);
  assert.ok(Math.abs(total - 0.8875) < 1e-9);
  assert.equal(moodFit, null);
});

test('the real catalog plans a full session with every slot filled', () => {
  const result = planItinerary({
    profile: defaultProfile(),
    moods: { energize: 60, unwind: 20, focus: 0, wander: 10 },
    budget: 45,
    catalog: CATALOG,
  });
  assert.equal(Object.keys(result.picks).length, 4);
  for (const slot of SLOTS) {
    assert.ok(result.picks[slot.id], `real catalog left ${slot.id} empty`);
    assert.ok(result.picks[slot.id].item.cost <= result.allocations[slot.id]);
  }
});

test('the real catalog keeps a zero cost escape hatch in every planner domain', () => {
  for (const slot of SLOTS) {
    const free = CATALOG.some((item) => item.domain === slot.domain && item.cost === 0);
    assert.ok(free, `no zero cost item in ${slot.domain}`);
  }
});
