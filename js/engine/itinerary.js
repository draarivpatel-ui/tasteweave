// The agentic afternoon planner. Given a profile, mood weights, a budget and
// a catalog, it assembles a listen, watch, cook, read session and writes a
// decision trace the agent log can replay. Data agnostic: it takes whatever
// catalog it is handed, so a real taste API could replace the synthetic one.

import { DOMAINS, ATTRIBUTES, TOTAL_ATTRIBUTES, standouts } from './profile.js';
import { domainFit, moodAlignment, explainDomainFit, fitPercent } from './similarity.js';
import { flattenMoods, moodMass } from './moods.js';
import { createTrace } from './trace.js';

export const SLOTS = [
  { id: 'listen', domain: 'music', verb: 'Listen', share: 0.18 },
  { id: 'watch', domain: 'film', verb: 'Watch', share: 0.3 },
  { id: 'cook', domain: 'food', verb: 'Cook', share: 0.34 },
  { id: 'read', domain: 'books', verb: 'Read', share: 0.18 },
];

export const PROFILE_WEIGHT = 0.65;
export const MOOD_WEIGHT = 0.35;

export function sanitizeBudget(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

// Integer budget shares per slot. Floors each share and hands the remainder
// to the last slot, so the sum never exceeds the budget.
export function allocateBudget(budget) {
  const safe = sanitizeBudget(budget);
  const allocations = {};
  let used = 0;
  SLOTS.forEach((slot, index) => {
    if (index === SLOTS.length - 1) {
      allocations[slot.id] = Math.max(0, safe - used);
    } else {
      const value = Math.floor(safe * slot.share);
      allocations[slot.id] = value;
      used += value;
    }
  });
  return allocations;
}

export function scoreSlot(item, profile, moodWeights, mass) {
  const fit = domainFit(profile, item).score;
  if (!mass) return { profileFit: fit, moodFit: null, total: fit };
  const moodFit = moodAlignment(item, moodWeights);
  return { profileFit: fit, moodFit, total: PROFILE_WEIGHT * fit + MOOD_WEIGHT * moodFit };
}

function reasonFor(profile, item, moodWeights, mass) {
  const { close, stretch } = explainDomainFit(profile, item);
  const parts = close.map((g) => `${g.label} (you ${g.userValue}, this ${g.itemValue})`);
  let text = parts.length
    ? `Sits close to your taste on ${parts.join(', ')}.`
    : 'No attribute lands within the close band, so profile fit alone carried this pick.';
  if (stretch) text += ` It stretches you on ${stretch.label} (you ${stretch.userValue}, this ${stretch.itemValue}).`;
  if (mass > 0) {
    const align = moodAlignment(item, moodWeights);
    if (align >= 0.6) text += ' It also points the same way as your mood blend.';
    else if (align >= 0.45) text += ' It fits your mood blend moderately well.';
    else text += ' It fits your mood blend loosely; profile fit carried the pick.';
  }
  return text;
}

function standoutText(profile) {
  return standouts(profile, 3)
    .map((s) => `${s.label} ${s.value}`)
    .join(', ');
}

export function planItinerary({ profile, moods, budget, catalog }) {
  const trace = createTrace();
  const safeBudget = sanitizeBudget(budget);
  const weights = flattenMoods(moods);
  const mass = moodMass(weights);
  const moodSummary = ['energize', 'unwind', 'focus', 'wander']
    .map((id) => `${id} ${Math.max(0, Math.min(100, Math.round(Number(moods && moods[id]) || 0)))}`)
    .join(', ');

  trace.step(
    'read',
    `Read your profile: ${TOTAL_ATTRIBUTES} attributes across ${DOMAINS.length} domains. Standouts: ${standoutText(profile)}.`
  );

  if (mass > 0) {
    trace.step(
      'mood',
      `Mood blend: ${moodSummary}. Scoring uses ${Math.round(PROFILE_WEIGHT * 100)} percent profile fit and ${Math.round(MOOD_WEIGHT * 100)} percent mood fit.`
    );
  } else {
    trace.step('mood', `Mood blend: ${moodSummary}. No mood weight set, so picks follow profile fit alone.`);
  }

  const allocations = allocateBudget(safeBudget);
  trace.step(
    'budget',
    `Budget $${safeBudget} split by slot: ${SLOTS.map((s) => `${s.verb} $${allocations[s.id]}`).join(', ')}.`
  );

  const picks = {};
  let totalCost = 0;

  for (const slot of SLOTS) {
    const candidates = catalog.filter((item) => item.domain === slot.domain);
    const scored = candidates
      .map((item) => ({ item, score: scoreSlot(item, profile, weights, mass) }))
      .sort((a, b) => b.score.total - a.score.total);
    const best = scored[0];
    const affordable = scored.filter((x) => x.item.cost <= allocations[slot.id]);
    const chosen = affordable[0];

    trace.step(
      'search',
      `${slot.verb}: scored ${candidates.length} ${slot.domain} candidates against your profile${mass > 0 ? ' and mood blend' : ''}, then filtered to ${affordable.length} within the $${allocations[slot.id]} slot share.`
    );

    if (!chosen) {
      trace.step('select', `${slot.verb}: nothing in the catalog fits this slot share, so the slot stays empty.`);
      picks[slot.id] = null;
      continue;
    }

    totalCost += chosen.item.cost;
    const runnerUp = affordable[1];
    const reason = reasonFor(profile, chosen.item, weights, mass);

    let message = `${slot.verb}: picked ${chosen.item.title} by ${chosen.item.creator} for $${chosen.item.cost} (fit ${fitPercent(chosen.score.total)}).`;
    if (best && best.item.id !== chosen.item.id) {
      message += ` The top scorer, ${best.item.title} at $${best.item.cost}, sits over this slot share, so the plan stayed under budget.`;
    }
    if (runnerUp) {
      message += ` Runner up: ${runnerUp.item.title} (fit ${fitPercent(runnerUp.score.total)}).`;
    }

    trace.step('select', message, {
      slot: slot.id,
      chosen: chosen.item.title,
      creator: chosen.item.creator,
      cost: chosen.item.cost,
      fit: fitPercent(chosen.score.total),
      runnerUp: runnerUp ? runnerUp.item.title : null,
      reason,
    });

    picks[slot.id] = {
      slot: slot.id,
      verb: slot.verb,
      item: chosen.item,
      profileFit: chosen.score.profileFit,
      moodFit: chosen.score.moodFit,
      total: chosen.score.total,
      reason,
    };
  }

  const headroom = safeBudget - totalCost;
  trace.step(
    'review',
    `Total cost $${totalCost} of the $${safeBudget} budget, leaving $${headroom} headroom. Every pick sits within its slot share.`
  );
  trace.step('done', 'Plan ready. Each pick card shows its why, and you can run the planner again with new moods or budget.');

  return { picks, totalCost, headroom, budget: safeBudget, allocations, trace, moodMass: mass };
}
