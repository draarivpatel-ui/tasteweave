import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOMAINS,
  ATTRIBUTES,
  defaultProfile,
  isValidProfile,
  setAttr,
  randomProfile,
  standouts,
  domainAssertiveness,
} from '../js/engine/profile.js';
import { MOODS } from '../js/engine/moods.js';
import {
  domainFit,
  domainGaps,
  explainDomainFit,
  neighborFit,
  fitPercent,
} from '../js/engine/similarity.js';
import { planItinerary, SLOTS } from '../js/engine/itinerary.js';
import { CATALOG } from '../js/data/catalog.js';
import { NEIGHBORS } from '../js/data/personas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const stylesCss = fs.readFileSync(path.join(repoRoot, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(repoRoot, 'app.js'), 'utf8');
const readmeMd = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

test('DOM Smoke 01: index.html starts with HTML5 doctype and lang=en', () => {
  assert.match(indexHtml.trimStart(), /^<!doctype html>/i);
  assert.match(indexHtml, /<html\s+lang="en">/i);
});

test('DOM Smoke 02: index.html contains UTF-8 charset and responsive viewport meta tags', () => {
  assert.match(indexHtml, /<meta\s+charset="utf-8">/i);
  assert.match(indexHtml, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1">/i);
});

test('DOM Smoke 03: index.html contains non-empty title, meta description, and JSON-LD schema', () => {
  assert.match(indexHtml, /<title>TasteWeave:\s*A Taste Graph Planner<\/title>/);
  assert.match(indexHtml, /<meta\s+name="description"\s+content="[^"]{40,}">/);
  assert.match(indexHtml, /"@type":\s*"WebApplication"/);
});

test('DOM Smoke 04: OpenGraph and Twitter meta tags are complete', () => {
  assert.match(indexHtml, /property="og:title"\s+content="[^"]+"/);
  assert.match(indexHtml, /property="og:description"\s+content="[^"]+"/);
  assert.match(indexHtml, /property="og:type"\s+content="website"/);
  assert.match(indexHtml, /property="og:url"\s+content="https:\/\/[^"]+"/);
  assert.match(indexHtml, /name="twitter:card"\s+content="summary"/);
});

test('DOM Smoke 05: inline SVG favicon and theme-color exist in <head>', () => {
  assert.match(indexHtml, /<meta\s+name="theme-color"\s+content="#17120D">/i);
  assert.match(indexHtml, /<link\s+rel="icon"\s+href="data:image\/svg\+xml,/);
});

test('DOM Smoke 06: index.html contains exactly one <h1> element and valid heading hierarchy', () => {
  const h1Matches = indexHtml.match(/<h1\b[^>]*>/gi) || [];
  assert.equal(h1Matches.length, 1);
  const levels = [...indexHtml.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  assert.equal(levels[0], 1);
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(
      levels[i] <= levels[i - 1] + 1,
      `Heading level jumped from h${levels[i - 1]} to h${levels[i]}`
    );
  }
});

test('DOM Smoke 07: all id attributes in index.html are unique', () => {
  const ids = [...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 30);
  const uniqueIds = new Set(ids);
  assert.equal(uniqueIds.size, ids.length, 'Duplicate IDs found in index.html');
});

test('DOM Smoke 08: accessible skip-link, noscript banner, and semantic landmarks exist', () => {
  assert.match(indexHtml, /<a\s+class="skip-link"\s+href="#main">/);
  assert.match(indexHtml, /<noscript>[\s\S]*?<\/noscript>/);
  assert.match(indexHtml, /<header\s+class="topbar">/);
  assert.match(indexHtml, /<nav\s+class="site-nav"\s+aria-label="Sections">/);
  assert.match(indexHtml, /<main\s+id="main">/);
  assert.match(indexHtml, /<footer\s+class="site-footer">/);
});

test('DOM Smoke 09: every aria-labelledby and label[for] in index.html resolves to an existing ID', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const rawRefs = [...indexHtml.matchAll(/\baria-labelledby="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(rawRefs.length >= 6);
  for (const raw of rawRefs) {
    for (const ref of raw.trim().split(/\s+/)) {
      assert.ok(htmlIds.has(ref), `aria-labelledby target #${ref} is missing in index.html`);
    }
  }
  const forIds = [...indexHtml.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(forIds.length >= 5);
  for (const id of forIds) {
    assert.ok(htmlIds.has(id), `label[for="${id}"] has no matching control ID`);
  }
});

test('DOM Smoke 10: all static DOM IDs and domain cards wired in app.js exist in index.html', () => {
  const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const staticSelectors = [...appJs.matchAll(/\$\(\s*'#([^']+)'\s*\)/g)].map((m) => m[1]);
  assert.ok(staticSelectors.length >= 12);
  for (const id of staticSelectors) {
    assert.ok(htmlIds.has(id), `Static ID #${id} queried in app.js is missing from index.html`);
  }
  for (const domain of DOMAINS) {
    assert.ok(htmlIds.has(`mean-${domain.id}`), `Missing #mean-${domain.id}`);
    assert.match(indexHtml, new RegExp(`data-domain="${domain.id}"`));
  }
  for (const mood of MOODS) {
    assert.ok(htmlIds.has(`mood-${mood.id}`), `Missing #mood-${mood.id}`);
    assert.ok(htmlIds.has(`mood-${mood.id}-out`), `Missing #mood-${mood.id}-out`);
  }
});

test('DOM Smoke 11: styles.css enforces overflow-x: clip, focus-visible outline, and reduced-motion guard', () => {
  assert.match(stylesCss, /overflow-x:\s*clip/);
  assert.match(stylesCss, /:focus-visible\s*\{[\s\S]*?outline:/);
  assert.match(stylesCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(stylesCss, /font-variant-numeric:\s*tabular-nums/);
});

test('DOM Smoke 12: zero em-dashes, en-dashes, or emoji across index.html, styles.css, app.js, and README.md', () => {
  assert.equal(/[\u2013\u2014]/.test(indexHtml), false);
  assert.equal(/[\u2013\u2014]/.test(stylesCss), false);
  assert.equal(/[\u2013\u2014]/.test(appJs), false);
  assert.equal(/[\u2013\u2014]/.test(readmeMd), false);
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(indexHtml), false);
  assert.equal(emojiRegex.test(stylesCss), false);
  assert.equal(emojiRegex.test(appJs), false);
});

test('DOM Smoke 13: engine functions execute cleanly on UI catalog, neighbors, and planner presets', () => {
  const profile = defaultProfile();
  assert.equal(isValidProfile(profile), true);
  setAttr(profile, 'music', ATTRIBUTES.music[0].id, 85);
  assert.equal(standouts(profile, 2).length, 2);
  assert.equal(domainAssertiveness(profile).length, DOMAINS.length);

  for (const item of CATALOG) {
    const fit = domainFit(profile, item);
    assert.ok(fitPercent(fit.score) >= 0 && fitPercent(fit.score) <= 100);
    const gaps = domainGaps(profile, item);
    assert.equal(gaps.length, 4);
    const explained = explainDomainFit(profile, item);
    assert.ok(Array.isArray(explained.close));
  }

  for (const neighbor of NEIGHBORS) {
    const nFit = neighborFit(profile, neighbor.profile);
    assert.ok(nFit.score >= 0 && nFit.score <= 1);
    assert.equal(nFit.shared.length, 3);
    assert.ok(nFit.divergent);
  }

  const rand = randomProfile();
  assert.equal(isValidProfile(rand), true);
  const plan = planItinerary({
    profile: rand,
    moods: { energize: 40, unwind: 20, focus: 60, wander: 10 },
    budget: 40,
    catalog: CATALOG,
  });
  assert.ok(plan.totalCost <= 40);
  for (const slot of SLOTS) {
    assert.ok(plan.picks[slot.id], `Missing pick for slot ${slot.id}`);
  }
  assert.ok(plan.trace.steps.length >= 6);
});
