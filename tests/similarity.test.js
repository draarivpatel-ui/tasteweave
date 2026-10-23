import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  domainGaps,
  domainFit,
  explainDomainFit,
  moodAlignment,
  neighborFit,
  fitPercent,
} from '../js/engine/similarity.js';
import { defaultProfile, profileVector, attrIds, standouts } from '../js/engine/profile.js';
import { CATALOG } from '../js/data/catalog.js';
import { NEIGHBORS } from '../js/data/personas.js';
import { flattenMoods } from '../js/engine/moods.js';

const atNeutral = { id: 'x', domain: 'music', title: 'X', creator: 'Y', blurb: '', cost: 0, attrs: { energy: 50, warmth: 50, edge: 50, obscurity: 50 } };

function profileWith(domain, attr, value) {
  const p = defaultProfile();
  p[domain][attr] = value;
  return p;
}

test('domainFit scores a perfect alignment at 1', () => {
  const { score } = domainFit(defaultProfile(), atNeutral);
  assert.equal(score, 1);
});

test('domainFit scores maximal distance at 0', () => {
  const zero = { music: { energy: 0, warmth: 0, edge: 0, obscurity: 0 } };
  const far = { id: 'y', domain: 'music', title: 'Y', creator: 'Z', blurb: '', cost: 0, attrs: { energy: 100, warmth: 100, edge: 100, obscurity: 100 } };
  const { score } = domainFit(zero, far);
  assert.equal(score, 0);
});

test('every catalog item scores within 0 to 1 against a neutral profile', () => {
  const profile = defaultProfile();
  for (const item of CATALOG) {
    const { score } = domainFit(profile, item);
    assert.ok(score >= 0 && score <= 1, `score out of range for ${item.id}: ${score}`);
  }
});

test('domainGaps returns gaps sorted closest first', () => {
  const item = CATALOG[0];
  const gaps = domainGaps(profileWith('music', 'energy', 33), item);
  const values = gaps.map((g) => g.gap);
  assert.deepEqual(values, [...values].sort((a, b) => a - b));
});

test('explainDomainFit caps close matches at three and skips stretch when near', () => {
  const profile = defaultProfile();
  const explanation = explainDomainFit(profile, atNeutral);
  assert.equal(explanation.close.length, 3);
  assert.equal(explanation.stretch, null);
});

test('explainDomainFit reports a stretch when an attribute is far away', () => {
  const profile = profileWith('music', 'energy', 100);
  const explanation = explainDomainFit(profile, atNeutral);
  assert.equal(explanation.stretch.label, 'Energy');
  assert.equal(explanation.stretch.gap, 50);
});

test('neighborFit gives identical profiles a perfect score', () => {
  const a = defaultProfile();
  const { score } = neighborFit(a, defaultProfile());
  assert.equal(score, 1);
});

test('neighborFit is symmetric', () => {
  const a = profileWith('music', 'energy', 90);
  const b = profileWith('food', 'heat', 5);
  assert.equal(neighborFit(a, b).score, neighborFit(b, a).score);
});

test('neighborFit reports five per domain scores', () => {
  const result = neighborFit(defaultProfile(), defaultProfile());
  assert.equal(Object.keys(result.perDomain).length, 5);
});

test('neighborFit shared attributes are closer than the divergent one', () => {
  const a = profileWith('books', 'wonder', 95);
  const b = profileWith('places', 'bustle', 5);
  const result = neighborFit(a, b);
  assert.equal(result.shared.length, 3);
  assert.ok(result.divergent.gap >= result.shared[2].gap);
});

test('fitPercent rounds scores to whole numbers', () => {
  assert.equal(fitPercent(0.874), 87);
  assert.equal(fitPercent(1), 100);
  assert.equal(fitPercent(0), 0);
});

test('moodAlignment ranges from 0 to 1 with 0.5 at neutral', () => {
  const weights = { 'music.energy': 1 };
  assert.equal(moodAlignment({ domain: 'music', attrs: { energy: 100 } }, weights), 1);
  assert.equal(moodAlignment({ domain: 'music', attrs: { energy: 0 } }, weights), 0);
  assert.equal(moodAlignment({ domain: 'music', attrs: { energy: 50 } }, weights), 0.5);
});

test('moodAlignment ignores weights from other domains', () => {
  const align = moodAlignment({ domain: 'music', attrs: { energy: 100 } }, { 'film.pace': 1 });
  assert.equal(align, 0.5);
});

test('moodAlignment stays within bounds for every item at full mood tilt', () => {
  const weights = flattenMoods({ energize: 100, unwind: 100, focus: 100, wander: 100 });
  for (const item of CATALOG) {
    const align = moodAlignment(item, weights);
    assert.ok(align >= 0 && align <= 1, `alignment out of range for ${item.id}: ${align}`);
  }
});

test('profileVector and attrIds cover twenty attributes', () => {
  assert.equal(attrIds().length, 20);
  assert.equal(profileVector(defaultProfile()).length, 20);
});

test('standouts leads with the attribute furthest from neutral', () => {
  const rows = standouts(profileWith('music', 'energy', 95), 1);
  assert.equal(rows[0].label, 'Energy');
});

test('neighbor archetypes produce valid scores for a neutral profile', () => {
  const profile = defaultProfile();
  for (const neighbor of NEIGHBORS) {
    const { score } = neighborFit(profile, neighbor.profile);
    assert.ok(score >= 0 && score <= 1, `neighbor score out of range for ${neighbor.id}: ${score}`);
  }
});
