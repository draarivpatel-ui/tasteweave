import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planItinerary } from '../js/engine/itinerary.js';
import { createTrace, PHASES } from '../js/engine/trace.js';
import { defaultProfile } from '../js/engine/profile.js';
import { CATALOG } from '../js/data/catalog.js';

const MOODS = { energize: 60, unwind: 20, focus: 0, wander: 10 };

function planned() {
  return planItinerary({ profile: defaultProfile(), moods: MOODS, budget: 45, catalog: CATALOG });
}

test('a full plan writes a trace of at least eight steps', () => {
  const { trace } = planned();
  assert.ok(trace.size >= 8, `trace only has ${trace.size} steps`);
});

test('the trace opens by reading the profile, then mood, then budget', () => {
  const { trace } = planned();
  assert.equal(trace.steps[0].phase, 'read');
  assert.equal(trace.steps[1].phase, 'mood');
  assert.equal(trace.steps[2].phase, 'budget');
});

test('the trace closes with review and done phases', () => {
  const { trace } = planned();
  const phases = trace.steps.map((s) => s.phase);
  assert.ok(phases.includes('review'));
  assert.ok(phases.includes('done'));
});

test('every phase used is a known phase', () => {
  const { trace } = planned();
  for (const step of trace.steps) {
    assert.ok(PHASES.includes(step.phase), `unknown phase ${step.phase}`);
  }
});

test('the trace logs one search and one select per slot', () => {
  const { trace } = planned();
  assert.equal(trace.steps.filter((s) => s.phase === 'search').length, 4);
  assert.equal(trace.steps.filter((s) => s.phase === 'select').length, 4);
});

test('every step has an id, a phase and a nonempty message', () => {
  const { trace } = planned();
  assert.ok(trace.steps.every((s) => Number.isInteger(s.id) && s.id > 0));
  assert.ok(trace.steps.every((s) => typeof s.phase === 'string' && s.phase.length > 0));
  assert.ok(trace.steps.every((s) => typeof s.message === 'string' && s.message.length > 0));
});

test('step ids increase by one from the first step', () => {
  const { trace } = planned();
  assert.deepEqual(trace.steps.map((s) => s.id), trace.steps.map((_, i) => i + 1));
});

test('select steps carry the data the pick cards render', () => {
  const { trace } = planned();
  const selects = trace.steps.filter((s) => s.phase === 'select');
  for (const step of selects) {
    assert.ok(typeof step.data.chosen === 'string' && step.data.chosen.length > 0);
    assert.ok(typeof step.data.cost === 'number' && step.data.cost >= 0);
    assert.ok(step.data.fit >= 0 && step.data.fit <= 100);
    assert.ok(typeof step.data.reason === 'string' && step.data.reason.length > 0);
    assert.ok(step.data.runnerUp === null || typeof step.data.runnerUp === 'string');
  }
});

test('the budget step reports the dollar split', () => {
  const { trace } = planned();
  const budgetStep = trace.steps.find((s) => s.phase === 'budget');
  assert.match(budgetStep.message, /\$45/);
  assert.match(budgetStep.message, /Cook \$15/);
});

test('the mood step documents the scoring blend when moods are active', () => {
  const { trace } = planned();
  const moodStep = trace.steps.find((s) => s.phase === 'mood');
  assert.match(moodStep.message, /65 percent/);
  assert.match(moodStep.message, /35 percent/);
});

test('the trace serializes to plain JSON without losing steps', () => {
  const { trace } = planned();
  const json = trace.toJSON();
  assert.equal(json.length, trace.size);
  assert.equal(json[0].message, trace.steps[0].message);
});

test('a fresh trace starts empty and grows one step at a time', () => {
  const trace = createTrace();
  assert.equal(trace.size, 0);
  trace.step('read', 'first');
  trace.step('mood', 'second');
  assert.equal(trace.size, 2);
  assert.equal(trace.steps[1].id, 2);
});

test('a plan with no moods still traces a complete decision', () => {
  const { trace } = planItinerary({
    profile: defaultProfile(),
    moods: { energize: 0, unwind: 0, focus: 0, wander: 0 },
    budget: 20,
    catalog: CATALOG,
  });
  const moodStep = trace.steps.find((s) => s.phase === 'mood');
  assert.match(moodStep.message, /profile fit alone/);
  assert.equal(trace.steps.filter((s) => s.phase === 'select').length, 4);
});
