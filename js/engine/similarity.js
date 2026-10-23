// Transparent similarity scoring. Every number the UI shows comes from here,
// and every score can be traced back to attribute by attribute gaps.

import { DOMAINS, ATTRIBUTES, attrKey } from './profile.js';

// Per attribute gaps for a catalog item against a profile, closest first.
export function domainGaps(profile, item) {
  const defs = ATTRIBUTES[item.domain];
  const gaps = defs.map((def) => {
    const userValue = profile[item.domain][def.id];
    const itemValue = item.attrs[def.id];
    return {
      key: attrKey(item.domain, def.id),
      label: def.label,
      userValue,
      itemValue,
      gap: Math.abs(userValue - itemValue),
    };
  });
  gaps.sort((a, b) => a.gap - b.gap);
  return gaps;
}

// Fit in [0, 1]: 1 means every attribute lands exactly on the item's value.
export function domainFit(profile, item) {
  const gaps = domainGaps(profile, item);
  const meanGap = gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length;
  return { score: 1 - meanGap / 100, gaps };
}

export function fitPercent(score) {
  return Math.round(score * 100);
}

// Why an item matched: the closest attributes, and the honest stretch.
export function explainDomainFit(profile, item, closeThreshold = 15, stretchThreshold = 30) {
  const gaps = domainGaps(profile, item);
  return {
    close: gaps.filter((g) => g.gap <= closeThreshold).slice(0, 3),
    stretch: gaps[gaps.length - 1].gap >= stretchThreshold ? gaps[gaps.length - 1] : null,
  };
}

// Mood alignment in [0, 1] for one item: 1 means the item sits exactly where
// the mood weights push, 0 means it sits opposite. Neutral at 0.5.
export function moodAlignment(item, moodWeights) {
  let sum = 0;
  let mass = 0;
  for (const [key, w] of Object.entries(moodWeights || {})) {
    if (!w) continue;
    const [domain, attr] = key.split('.');
    if (domain !== item.domain) continue;
    mass += Math.abs(w);
    sum += w * ((item.attrs[attr] / 100) * 2 - 1);
  }
  if (mass === 0) return 0.5;
  return 0.5 + 0.5 * (sum / mass);
}

// Similarity between two full 20 attribute profiles. Symmetric by construction.
export function neighborFit(profileA, profileB) {
  const perDomain = {};
  const flat = [];
  let totalGap = 0;
  let count = 0;
  for (const d of DOMAINS) {
    let domainGap = 0;
    for (const a of ATTRIBUTES[d.id]) {
      const gap = Math.abs(profileA[d.id][a.id] - profileB[d.id][a.id]);
      domainGap += gap;
      totalGap += gap;
      count += 1;
      flat.push({
        key: attrKey(d.id, a.id),
        domain: d.id,
        label: a.label,
        you: profileA[d.id][a.id],
        them: profileB[d.id][a.id],
        gap,
      });
    }
    perDomain[d.id] = 1 - domainGap / ATTRIBUTES[d.id].length / 100;
  }
  flat.sort((x, y) => x.gap - y.gap);
  return {
    score: 1 - totalGap / count / 100,
    perDomain,
    shared: flat.slice(0, 3),
    divergent: flat[flat.length - 1],
  };
}
