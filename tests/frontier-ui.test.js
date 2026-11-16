import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { drawFrontier, frontierScales, frontierSummary } from '../js/ui/frontier-view.js';
import { comparePlanners } from '../js/engine/optimizer.js';
import { defaultProfile } from '../js/engine/profile.js';
import { CATALOG } from '../js/data/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

const NO_MOODS = { energize: 0, unwind: 0, focus: 0, wander: 0 };

function recorder() {
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        target[key] = value;
        calls.push(['set', key, value]);
        return true;
      },
    }
  );
  return { ctx, calls };
}

function chartData(budget) {
  const cmp = comparePlanners({ profile: defaultProfile(), moods: NO_MOODS, budget, catalog: CATALOG });
  return {
    cmp,
    data: {
      plans: cmp.plans,
      frontier: cmp.frontier,
      budget: cmp.budget,
      greedy: { cost: cmp.greedy.cost, fit: cmp.greedy.meanFit },
      optimal: { cost: cmp.optimal.cost, fit: cmp.optimal.meanFit },
    },
  };
}

test('frontier view: draws one dot per plan, the frontier, the budget rule and both markers', () => {
  const { data } = chartData(40);
  const { ctx, calls } = recorder();
  const out = drawFrontier(ctx, 640, 280, data);
  assert.equal(out.dots, 4096);
  const rects = calls.filter((c) => c[0] === 'fillRect');
  assert.equal(rects.length, 1 + 4096, 'background plus one dot per plan');
  assert.equal(calls.filter((c) => c[0] === 'arc').length, 2, 'greedy ring and optimum dot');
  assert.ok(calls.some((c) => c[0] === 'setLineDash' && c[1].length === 2), 'dashed budget rule');
  const strokes = calls.filter((c) => c[0] === 'stroke').length;
  assert.ok(strokes >= 3);
});

test('frontier view: every dot lands inside the plot area', () => {
  const { data } = chartData(40);
  const s = frontierScales(data.plans, 640, 280);
  for (const p of data.plans) {
    const x = s.x(p.cost);
    const y = s.y(p.fit);
    assert.ok(x >= s.pad.l - 1e-9 && x <= 640 - s.pad.r + 1e-9);
    assert.ok(y >= s.pad.t - 1e-9 && y <= 280 - s.pad.b + 1e-9, `fit ${p.fit} maps to ${y}`);
  }
});

test('frontier view: an empty plan list only paints the background', () => {
  const { ctx, calls } = recorder();
  const out = drawFrontier(ctx, 300, 200, { plans: [], frontier: [], budget: 10 });
  assert.equal(out.dots, 0);
  assert.equal(calls.filter((c) => c[0] === 'fillRect').length, 1);
});

test('frontier summary: reports the gain over slot shares, or says they match', () => {
  const at40 = frontierSummary(chartData(40).cmp);
  assert.match(at40, /^Exact optimum under \$40: mean fit 88 for \$30, 3 points above the slot-share plan \(85 for \$0\)\./);
  assert.match(at40, /4096 complete plans scored, \d+ on the frontier\.$/);
  assert.match(frontierSummary(chartData(0).cmp), /The slot-share plan already matches it\./);
});

test('page: the planner offers both strategies, a P shortcut on the button, and the frontier figure', () => {
  assert.match(html, /name="plan-strategy" value="greedy" checked/);
  assert.match(html, /name="plan-strategy" value="optimal"/);
  assert.match(html, /Plan My Afternoon <kbd>P<\/kbd>/);
  assert.match(html, /<canvas id="frontierCanvas" role="img" aria-label="[^"]{60,}"/);
  assert.match(html, /id="frontierSummary"[^>]*aria-live="polite"/);
});

test('page: synthetic and computed data carry visible badges', () => {
  assert.match(html, /data-badge-synthetic">Synthetic catalog, 40 invented entries/);
  assert.match(html, /data-badge-synthetic">Synthetic archetypes, not real people/);
  assert.match(html, /data-badge-computed">Computed in this tab/);
  assert.match(html, /data-badge-local">Saved in this browser only/);
});

test('page: titles stand alone with no tagline, dek or helper line under them', () => {
  for (const cls of ['lede', 'section-dek', 'master-hint', 'section-note']) {
    assert.ok(!new RegExp(`class="${cls}"`).test(html), cls);
  }
});

test('app: shortcuts skip modified keys and text fields, P plans and O switches strategy', () => {
  assert.match(app, /event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey/);
  assert.match(app, /key === 'p'/);
  assert.match(app, /key === 'o'/);
  assert.match(app, /state\.strategy === 'optimal' \? optimizeItinerary\(args\) : planItinerary\(args\)/);
  assert.match(app, /scheduleFrontier\(\)/);
});

test('app: O toggles the selected strategy after a manual radio change, even before planning', () => {
  const match = app.match(/document\.addEventListener\('keydown', (\(event\) => \{[\s\S]*?\n  \})\);/);
  assert.ok(match, 'the wired keydown handler exists');
  const state = { strategy: 'greedy' };
  let selected = 'greedy';
  const radios = ['greedy', 'optimal'].map((value) => ({
    value,
    get checked() { return selected === value; },
    set checked(checked) { if (checked) selected = value; }
  }));
  const planned = [];
  const document = {
    querySelector(selector) {
      if (selector === 'input[name="plan-strategy"]:checked') return radios.find((radio) => radio.checked);
      const value = selector.match(/\[value="([^"]+)"\]/);
      return value ? radios.find((radio) => radio.value === value[1]) : null;
    }
  };
  const handleKey = vm.runInNewContext(`(${match[1]})`, {
    document,
    state,
    runPlanner() {
      state.strategy = selected;
      planned.push(selected);
    }
  });
  const press = (key, target = { tagName: 'BODY' }, extra = {}) => {
    const event = { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    handleKey(event);
    return event;
  };

  radios[1].checked = true;
  assert.equal(state.strategy, 'greedy', 'manual selection leaves the cached strategy stale');
  assert.equal(press('O').defaultPrevented, true);
  assert.equal(selected, 'greedy');
  assert.deepEqual(planned, ['greedy']);
  press('o');
  assert.equal(selected, 'optimal');
  radios[0].checked = true;
  assert.equal(state.strategy, 'optimal');
  press('o', { tagName: 'INPUT', type: 'radio' });
  assert.equal(selected, 'optimal', 'focused radios also toggle from their checked value');
  assert.equal(state.strategy, 'optimal');
  assert.deepEqual(planned, ['greedy', 'optimal', 'optimal']);

  for (const target of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'TEXTAREA' }, { isContentEditable: true }]) {
    assert.equal(press('o', target).defaultPrevented, false);
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(press('o', undefined, { [modifier]: true }).defaultPrevented, false);
  }
  assert.equal(planned.length, 3, 'ignored keys never trigger the planner');
});

test('css: new components are styled and the chart keeps a usable height on phones', () => {
  for (const sel of ['.data-badge', '.strategy-toggle', '.frontier-figure', '#frontierCanvas', '.frontier-key', '.band-head']) {
    assert.ok(css.includes(sel), sel);
  }
  assert.match(css, /#frontierCanvas \{[^}]*min-height: 240px/);
});

test('repo: no em or en dashes in shipped files', () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'js/engine/optimizer.js', 'js/ui/frontier-view.js', 'README.md']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.ok(!/[\u2013\u2014]/.test(text), file);
  }
});
