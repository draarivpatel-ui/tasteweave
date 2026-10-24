// TasteWeave presentation layer. Imports the engine and the synthetic dataset.
// It owns no scoring logic: every number shown comes from js/engine, and every
// drawing is done in code on a canvas with no images and no network.

import {
  DOMAINS,
  ATTRIBUTES,
  NEUTRAL,
  defaultProfile,
  isValidProfile,
  setAttr,
  randomProfile,
  standouts,
  domainAssertiveness,
} from './js/engine/profile.js';
import { MOODS } from './js/engine/moods.js';
import { domainFit, domainGaps, explainDomainFit, neighborFit, fitPercent } from './js/engine/similarity.js';
import { planItinerary, SLOTS } from './js/engine/itinerary.js';
import { CATALOG } from './js/data/catalog.js';
import { NEIGHBORS } from './js/data/personas.js';

const STORAGE_KEY = 'tasteweave.profile.v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionOK = () => !reduceMotion.matches;

// Draw order for the weave: quietest domains woven first so the loud ones sit
// on top, mirroring how the engine ranks assertiveness.
const THREAD_ORDER = ['places', 'books', 'food', 'film', 'music'];

// Stable catalog numbering: entry numbers follow the dataset order, scores
// decide the sorting. That is how a printed catalog behaves too.
const ENTRY_NUMBER = new Map(CATALOG.map((item, index) => [item.id, index + 1]));

const state = {
  profile: loadProfile(),
  moods: { energize: 0, unwind: 0, focus: 0, wander: 0 },
  budget: 40,
  filter: 'all',
};

let refreshQueued = false;
let logTimers = [];

const $ = (selector) => document.querySelector(selector);

// The three canvas views. Module scripts run after the HTML is parsed, so the
// elements exist by the time this file executes.
const weaveViews = {
  hero: createWeaveView($('#heroWeave'), { idle: true }),
  plate: createWeaveView($('#sigWeave')),
  radar: createRadarView($('#radar')),
};

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    renderSignatureSummary();
    renderFeed();
    renderNeighbors();
    renderInterpretation();
    weaveViews.hero.setProfile(state.profile);
    weaveViews.plate.setProfile(state.profile);
    weaveViews.radar.setProfile(state.profile);
  });
}

/* Storage */

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidProfile(parsed)) return parsed;
    }
  } catch {
    // Private browsing or blocked storage: fall through to a neutral profile.
  }
  return defaultProfile();
}

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profile));
  } catch {
    // Storage unavailable: the profile simply lives in the tab.
  }
}

/* Helpers */

function costLabel(cost) {
  return cost === 0 ? 'Free' : `$${cost}`;
}

function isNeutral(profile) {
  return standouts(profile, 1)[0].distance === 0;
}

function domainColor(domainId) {
  const domain = DOMAINS.find((d) => d.id === domainId);
  return domain ? domain.color : '#E5A83B';
}

function domainLabel(domainId) {
  const domain = DOMAINS.find((d) => d.id === domainId);
  return domain ? domain.label : domainId;
}

function domainMean(profile, domainId) {
  const defs = ATTRIBUTES[domainId];
  let sum = 0;
  for (const def of defs) sum += profile[domainId][def.id];
  return Math.round(sum / defs.length);
}

/* Canvas plumbing */

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function strokeThread(ctx, pts, color, width, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Start a callback the first time a canvas scrolls into view. Under reduced
// motion, or without IntersectionObserver, it fires immediately.
function whenSeen(el, onSeen) {
  if (!motionOK() || !('IntersectionObserver' in window)) {
    onSeen();
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          onSeen();
        }
      }
    },
    { threshold: 0.05 }
  );
  observer.observe(el);
}

/* The weave: five dye threads over a faint warp grid. Threads draw in when
 * first seen, glide to new heights when the profile changes, and the hero
 * loom keeps a slow sway at rest. Paused offscreen, static under reduced
 * motion, and throttled when settled to stay light on the CPU. */

function createWeaveView(canvas, { idle = false } = {}) {
  let profile = null;
  let cur = null;
  let lastSize = '';
  let started = false;
  let progress = 0;
  let raf = 0;
  let lastFrame = 0;
  let inView = true;

  function geometry(w, h) {
    const padX = Math.max(22, w * 0.05);
    const padY = Math.max(20, h * 0.12);
    return { padX, padY, innerW: w - padX * 2, innerH: h - padY * 2 };
  }

  function computePoints(w, h) {
    const { padX, padY, innerW, innerH } = geometry(w, h);
    return THREAD_ORDER.map((domainId) =>
      ATTRIBUTES[domainId].map((def, i) => ({
        x: padX + (innerW * i) / (ATTRIBUTES[domainId].length - 1),
        y: padY + innerH * (1 - profile[domainId][def.id] / 100),
      }))
    );
  }

  function drawGrid(ctx, w, h) {
    const { padX, padY, innerW, innerH } = geometry(w, h);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(241, 232, 215, 0.05)';
    for (let i = 0; i <= 8; i += 1) {
      const y = padY + (innerH * i) / 8;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(241, 232, 215, 0.07)';
    for (let i = 0; i < 7; i += 1) {
      const x = padX + (innerW * i) / 6;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, h - padY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paint(ts) {
    raf = 0;
    if (!profile || !started) return;
    if (idle && (!inView || document.hidden)) return;
    if (idle && motionOK() && ts - lastFrame < 40 && progress >= 1) {
      // Settled: coast at a slow cadence instead of burning frames.
      raf = requestAnimationFrame(paint);
      return;
    }
    lastFrame = ts;

    const { ctx, w, h } = setupCanvas(canvas);
    if (!ctx) return;
    const sizeKey = `${w}x${h}`;
    const sizeChanged = sizeKey !== lastSize;
    lastSize = sizeKey;

    const targetPts = computePoints(w, h);
    if (!cur || sizeChanged) {
      cur = targetPts.map((pts) => pts.map((p) => ({ x: p.x, y: p.y })));
    }
    let maxDelta = 0;
    for (let t = 0; t < targetPts.length; t += 1) {
      for (let i = 0; i < targetPts[t].length; i += 1) {
        const c = cur[t][i];
        if (motionOK()) {
          c.x += (targetPts[t][i].x - c.x) * 0.22;
          c.y += (targetPts[t][i].y - c.y) * 0.22;
        } else {
          c.x = targetPts[t][i].x;
          c.y = targetPts[t][i].y;
        }
        maxDelta = Math.max(
          maxDelta,
          Math.abs(targetPts[t][i].x - c.x),
          Math.abs(targetPts[t][i].y - c.y)
        );
      }
    }
    if (progress < 1) progress = Math.min(1, progress + 0.022);

    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);

    const { padX, innerW } = geometry(w, h);
    const swayTime = idle && motionOK() ? (ts || 0) * 0.0006 : 0;

    for (let t = 0; t < THREAD_ORDER.length; t += 1) {
      const threadProgress = Math.max(0, Math.min(1, (progress - t * 0.11) / 0.55));
      if (threadProgress <= 0) continue;
      const pts = cur[t].map((p, i) => ({
        x: p.x,
        y: p.y + (swayTime ? Math.sin(swayTime + t * 1.7 + i * 0.9) * 2.2 : 0),
      }));
      const domain = DOMAINS.find((d) => d.id === THREAD_ORDER[t]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, padX + innerW * easeOutCubic(threadProgress) + 2, h);
      ctx.clip();
      strokeThread(ctx, pts, domain.color, 10, 0.08);
      strokeThread(ctx, pts, domain.color, 2.4, 0.95);
      ctx.fillStyle = domain.color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const settled = progress >= 1 && maxDelta <= 0.35;
    if (idle && motionOK()) {
      if (inView && !document.hidden) raf = requestAnimationFrame(paint);
    } else if (!settled && motionOK()) {
      raf = requestAnimationFrame(paint);
    }
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(paint);
  }

  whenSeen(canvas, () => {
    started = true;
    if (!motionOK()) progress = 1;
    kick();
  });

  if (idle && 'IntersectionObserver' in window) {
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          inView = entry.isIntersecting;
          if (inView && started) kick();
        }
      },
      { threshold: 0.02 }
    );
    watcher.observe(canvas);
  } else if (idle && !('IntersectionObserver' in window)) {
    inView = true;
  }

  return {
    setProfile(next) {
      profile = next;
      if (!started) {
        if (!motionOK()) {
          started = true;
          progress = 1;
          kick();
        }
        return;
      }
      if (!motionOK()) progress = 1;
      kick();
    },
    resize() {
      if (started && profile) kick();
    },
  };
}

/* The radar: twenty spokes, one per attribute. Rings and labels fade in while
 * the gold shape blooms out from the center, then glides as sliders move. */

function createRadarView(canvas) {
  let profile = null;
  let curVals = null;
  let started = false;
  let progress = 0;
  let raf = 0;

  function spokes() {
    const rows = [];
    for (const domain of DOMAINS) {
      for (const def of ATTRIBUTES[domain.id]) {
        rows.push({ domain: domain.id, label: def.label, value: profile[domain.id][def.id] });
      }
    }
    return rows;
  }

  function paint() {
    raf = 0;
    if (!profile || !started) return;
    const { ctx, w, h } = setupCanvas(canvas);
    if (!ctx) return;
    const rows = spokes();
    if (!curVals) curVals = rows.map((r) => (motionOK() ? 0 : r.value));

    let maxDelta = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (motionOK()) {
        curVals[i] += (rows[i].value - curVals[i]) * 0.16;
      } else {
        curVals[i] = rows[i].value;
      }
      maxDelta = Math.max(maxDelta, Math.abs(rows[i].value - curVals[i]));
    }
    if (progress < 1) progress = Math.min(1, progress + 0.025);
    const reveal = easeOutCubic(progress);

    const cx = w / 2;
    const cy = h / 2 + 2;
    const R = Math.min(w, h) / 2 - Math.max(38, Math.min(w, h) * 0.16);
    const total = rows.length;
    const angleFor = (i) => (Math.PI * 2 * i) / total - Math.PI / 2;
    const pointAt = (i, radius) => ({
      x: cx + Math.cos(angleFor(i)) * radius,
      y: cy + Math.sin(angleFor(i)) * radius,
    });

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.strokeStyle = 'rgba(241, 232, 215, 0.09)';
    ctx.lineWidth = 1;
    for (const ring of [25, 50, 75, 100]) {
      ctx.beginPath();
      for (let i = 0; i <= total; i += 1) {
        const p = pointAt(i % total, (ring / 100) * R);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < total; i += 1) {
      const p = pointAt(i, R);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = reveal * 0.9;
    ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.fillStyle = 'rgba(157, 143, 123, 0.95)';
    for (let i = 0; i < total; i += 1) {
      const ang = angleFor(i);
      const lx = cx + Math.cos(ang) * (R + 14);
      const ly = cy + Math.sin(ang) * (R + 14);
      ctx.textAlign = Math.cos(ang) > 0.35 ? 'left' : Math.cos(ang) < -0.35 ? 'right' : 'center';
      ctx.textBaseline = Math.sin(ang) > 0.35 ? 'top' : Math.sin(ang) < -0.35 ? 'bottom' : 'middle';
      ctx.fillText(rows[i].label, lx, ly);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(229, 168, 59, 0.32)';
    ctx.beginPath();
    for (let i = 0; i <= total; i += 1) {
      const p = pointAt(i % total, (NEUTRAL / 100) * R);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= total; i += 1) {
      const p = pointAt(i % total, (Math.max(0, curVals[i % total]) / 100) * R);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(229, 168, 59, ${0.12 * reveal})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(229, 168, 59, ${0.08 * reveal})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = `rgba(229, 168, 59, ${0.95 * reveal})`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    if (reveal > 0.6) {
      ctx.save();
      ctx.globalAlpha = (reveal - 0.6) / 0.4;
      for (let i = 0; i < total; i += 1) {
        const p = pointAt(i, (Math.max(0, curVals[i]) / 100) * R);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = domainColor(rows[i].domain);
        ctx.fill();
      }
      ctx.restore();
    }

    if ((progress < 1 || maxDelta > 0.35) && motionOK()) {
      raf = requestAnimationFrame(paint);
    }
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(paint);
  }

  whenSeen(canvas, () => {
    started = true;
    if (!motionOK()) progress = 1;
    kick();
  });

  return {
    setProfile(next) {
      profile = next;
      if (!started) {
        if (!motionOK()) {
          started = true;
          progress = 1;
          kick();
        }
        return;
      }
      if (!motionOK()) progress = 1;
      kick();
    },
    resize() {
      if (started && profile) kick();
    },
  };
}

/* Profile sliders */

function buildProfileSliders() {
  for (const domain of DOMAINS) {
    const card = document.querySelector(`.domain-card[data-domain="${domain.id}"]`);
    const rows = card.querySelector('.slider-rows');
    for (const def of ATTRIBUTES[domain.id]) {
      const id = `${domain.id}-${def.id}`;
      const value = state.profile[domain.id][def.id];
      const row = document.createElement('div');
      row.className = 'slider-row';
      row.innerHTML = `
        <div class="slider-head">
          <label for="${id}">${def.label}</label>
          <output id="${id}-out" for="${id}">${value}</output>
        </div>
        <input type="range" id="${id}" min="0" max="100" step="1" value="${value}" aria-describedby="${id}-ends">
        <div class="slider-ends" id="${id}-ends"><span>${def.low}</span><span>${def.high}</span></div>`;
      rows.appendChild(row);
      row.querySelector('input').addEventListener('input', (event) => {
        setAttr(state.profile, domain.id, def.id, event.target.value);
        row.querySelector('output').textContent = event.target.value;
        syncMasterSlider(domain.id);
        updateMeanReadout(domain.id);
        saveProfile();
        scheduleRefresh();
      });
    }
  }
}

/* Hero master threads: one slider per domain, setting all four of its
 * attributes at once so the weave answers immediately. */

function buildMasterThreads() {
  const wrap = $('#masterThreads');
  for (const domain of DOMAINS) {
    const value = domainMean(state.profile, domain.id);
    const row = document.createElement('div');
    row.className = 'master-row';
    row.style.setProperty('--chip', domainColor(domain.id));
    row.innerHTML = `
      <label class="master-label" for="master-${domain.id}"><span class="dot" aria-hidden="true"></span>${domain.label}</label>
      <input class="master-slider" type="range" id="master-${domain.id}" min="0" max="100" step="1" value="${value}">
      <output class="master-out" id="master-${domain.id}-out" for="master-${domain.id}">${value}</output>`;
    wrap.appendChild(row);
    row.querySelector('input').addEventListener('input', (event) => {
      const v = Number(event.target.value) || 0;
      for (const def of ATTRIBUTES[domain.id]) setAttr(state.profile, domain.id, def.id, v);
      syncFineSliders(domain.id);
      updateMeanReadout(domain.id);
      saveProfile();
      scheduleRefresh();
    });
  }
}

function syncFineSliders(domainId) {
  for (const def of ATTRIBUTES[domainId]) {
    const input = document.getElementById(`${domainId}-${def.id}`);
    const output = document.getElementById(`${domainId}-${def.id}-out`);
    const value = state.profile[domainId][def.id];
    if (input) input.value = String(value);
    if (output) output.textContent = String(value);
  }
}

function syncMasterSlider(domainId) {
  const mean = domainMean(state.profile, domainId);
  const input = document.getElementById(`master-${domainId}`);
  const output = document.getElementById(`master-${domainId}-out`);
  if (input) input.value = String(mean);
  if (output) output.textContent = String(mean);
}

function updateMeanReadout(domainId) {
  const el = document.getElementById(`mean-${domainId}`);
  if (el) el.textContent = `Mean ${domainMean(state.profile, domainId)}`;
}

function syncAllControls() {
  for (const domain of DOMAINS) {
    syncFineSliders(domain.id);
    syncMasterSlider(domain.id);
    updateMeanReadout(domain.id);
  }
}

/* Summaries */

function renderSignatureSummary() {
  const target = $('#signatureSummary');
  if (isNeutral(state.profile)) {
    target.textContent = 'All twenty attributes sit at neutral. Pull a master thread to start the weave.';
    return;
  }
  const top = standouts(state.profile, 3)
    .map((s) => `${s.lean} ${s.label} (${s.value})`)
    .join(', ');
  target.textContent = `Loudest right now: ${top}. Most distinctive domain: ${domainAssertiveness(state.profile)[0].label}.`;
}

function renderInterpretation() {
  const target = $('#sigInterpretation');
  if (isNeutral(state.profile)) {
    target.textContent = 'A perfectly neutral profile weaves five flat threads. Move a few sliders and the loom starts to speak.';
    return;
  }
  const rows = standouts(state.profile, 2);
  const byDomain = domainAssertiveness(state.profile);
  const leads = rows.map((s) => `you lean ${s.lean} on ${s.label} (${s.value})`).join(' and ');
  target.textContent = `Across the twenty sliders, ${leads}. ${byDomain[0].label} is your most distinctive domain and ${byDomain[byDomain.length - 1].label} your quietest. Both drawings update the moment a slider moves.`;
}

/* Discovery feed: catalog entries with their numbers and their math */

function whyList(profile, item) {
  const { close, stretch } = explainDomainFit(profile, item);
  const gaps = close.length > 0 ? close : domainGaps(profile, item).slice(0, 2);
  const rows = gaps.map(
    (gap) => `
      <li class="gap-row">
        <span class="gap-attr">${gap.label}</span>
        <span class="gap-nums">You ${gap.userValue}, Here ${gap.itemValue}</span>
        <span class="gap-delta">Gap ${gap.gap}</span>
      </li>`
  );
  if (stretch) {
    rows.push(`
      <li class="gap-row gap-stretch">
        <span class="gap-attr">Stretch</span>
        <span class="gap-nums">${stretch.label}, You ${stretch.userValue}, Here ${stretch.itemValue}</span>
      </li>`);
  }
  return rows.join('');
}

function feedCard(item, fit) {
  const card = document.createElement('article');
  card.className = `card card-${item.domain}`;
  const pct = fitPercent(fit.score);
  const entryNo = String(ENTRY_NUMBER.get(item.id) || 0).padStart(2, '0');
  card.innerHTML = `
    <div class="card-meta">
      <span class="card-no">Entry ${entryNo}</span>
      <span class="chip chip-${item.domain}"><span class="dot" aria-hidden="true"></span>${domainLabel(item.domain)}</span>
      <span class="card-fit">${pct}% Fit</span>
    </div>
    <h3>${item.title}</h3>
    <p class="card-creator">${item.creator}</p>
    <p class="card-blurb">${item.blurb}</p>
    <div class="fit-rule" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    <div class="card-gaps">
      <p class="gaps-title">Why This Matched</p>
      <ul class="why">${whyList(state.profile, item)}</ul>
    </div>
    <p class="card-cost">Cost to enjoy: ${costLabel(item.cost)}</p>`;
  return card;
}

function renderFeed() {
  const grid = $('#feedGrid');
  const scored = CATALOG.map((item) => ({ item, fit: domainFit(state.profile, item) }));
  scored.sort((a, b) => b.fit.score - a.fit.score);
  const shown = state.filter === 'all' ? scored.slice(0, 12) : scored.filter((x) => x.item.domain === state.filter);
  grid.replaceChildren(...shown.map(({ item, fit }) => feedCard(item, fit)));
}

/* Taste neighbors: a ledger of rows, not a card grid */

function neighborRow(neighbor, fit) {
  const row = document.createElement('article');
  row.className = 'neighbor-row';
  row.setAttribute('role', 'listitem');
  const pct = fitPercent(fit.score);
  const shared = fit.shared
    .map(
      (g) => `
        <li class="gap-row">
          <span class="gap-attr">${g.label}</span>
          <span class="gap-nums">You ${g.you}, Them ${g.them}</span>
        </li>`
    )
    .join('');
  const divergent = `
    <li class="gap-row gap-stretch">
      <span class="gap-attr">Most Different</span>
      <span class="gap-nums">${fit.divergent.label}, You ${fit.divergent.you}, Them ${fit.divergent.them}</span>
    </li>`;
  row.innerHTML = `
    <div class="neighbor-id">
      <h3>${neighbor.name}</h3>
      <p class="neighbor-note">${neighbor.note}</p>
    </div>
    <div class="neighbor-fit">
      <span class="neighbor-pct">${pct}%</span>
      <span class="neighbor-fit-label">aligned across all twenty attributes</span>
      <div class="fit-rule" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    </div>
    <div class="neighbor-detail">
      <p class="gaps-title">Shared Ground</p>
      <ul class="why">${shared}${divergent}</ul>
    </div>`;
  return row;
}

function renderNeighbors() {
  const grid = $('#neighborGrid');
  const scored = NEIGHBORS.map((neighbor) => ({ neighbor, fit: neighborFit(state.profile, neighbor.profile) }));
  scored.sort((a, b) => b.fit.score - a.fit.score);
  grid.replaceChildren(...scored.slice(0, 4).map(({ neighbor, fit }) => neighborRow(neighbor, fit)));
}

/* Planner */

function readPlannerControls() {
  state.budget = Number($('#budgetRange').value) || 0;
  $('#budgetOutput').textContent = `$${state.budget}`;
  for (const mood of MOODS) {
    state.moods[mood.id] = Number($(`#mood-${mood.id}`).value) || 0;
    $(`#mood-${mood.id}-out`).textContent = String(state.moods[mood.id]);
  }
}

function pickCard(pick) {
  const card = document.createElement('article');
  card.className = `card pick-card card-${pick.item.domain}`;
  const pct = fitPercent(pick.total);
  card.innerHTML = `
    <div class="slip-head">
      <span class="slip-verb">${pick.verb}</span>
      <span class="chip chip-${pick.item.domain}"><span class="dot" aria-hidden="true"></span>${domainLabel(pick.item.domain)}</span>
      <span class="card-fit">${pct}% Fit</span>
    </div>
    <h3>${pick.item.title}</h3>
    <p class="card-creator">${pick.item.creator}</p>
    <p class="pick-cost">Cost ${costLabel(pick.item.cost)}, ${domainLabel(pick.item.domain)} domain</p>
    <div class="fit-rule" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    <p class="pick-reason">${pick.reason}</p>`;
  return card;
}

function renderPicks(result) {
  const grid = $('#pickGrid');
  const cards = SLOTS.map((slot) => (result.picks[slot.id] ? pickCard(result.picks[slot.id]) : null)).filter(Boolean);
  grid.replaceChildren(...cards);
  $('#planSummary').textContent =
    `Total cost $${result.totalCost} of the $${result.budget} budget, $${result.headroom} headroom. Slot shares: ` +
    SLOTS.map((s) => `${s.verb} $${result.allocations[s.id]}`).join(', ') + '.';
}

function stepToLi(step) {
  const li = document.createElement('li');
  li.className = `log-step phase-${step.phase}`;
  const message = document.createElement('p');
  message.className = 'log-msg';
  message.textContent = step.message;
  const phase = document.createElement('span');
  phase.className = 'log-phase';
  phase.textContent = `Step ${String(step.id).padStart(2, '0')}, ${step.phase.charAt(0).toUpperCase()}${step.phase.slice(1)}`;
  li.append(phase, message);
  return li;
}

function renderLog(trace) {
  const list = $('#agentLog');
  logTimers.forEach(clearTimeout);
  logTimers = [];
  const items = trace.steps.map(stepToLi);
  list.replaceChildren();
  if (reduceMotion.matches) {
    items.forEach((li) => list.appendChild(li));
    return;
  }
  items.forEach((li, index) => {
    logTimers.push(
      setTimeout(() => {
        list.appendChild(li);
        list.scrollTop = list.scrollHeight;
      }, index * 170)
    );
  });
}

function runPlanner(event) {
  if (event) event.preventDefault();
  readPlannerControls();
  const result = planItinerary({
    profile: state.profile,
    moods: state.moods,
    budget: state.budget,
    catalog: CATALOG,
  });
  renderPicks(result);
  renderLog(result.trace);
  $('#plannerStatus').textContent =
    `Planner finished: 4 picks, $${result.totalCost} of $${result.budget} spent, $${result.headroom} left.`;
  $('#planSummary').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'nearest' });
}

/* Wiring */

function wire() {
  buildMasterThreads();
  buildProfileSliders();
  syncAllControls();

  $('#randomize').addEventListener('click', () => {
    state.profile = randomProfile();
    saveProfile();
    syncAllControls();
    scheduleRefresh();
  });

  $('#resetProfile').addEventListener('click', () => {
    state.profile = defaultProfile();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    syncAllControls();
    scheduleRefresh();
  });

  for (const radio of document.querySelectorAll('input[name="domain-filter"]')) {
    radio.addEventListener('change', (event) => {
      state.filter = event.target.value;
      renderFeed();
    });
  }

  $('#budgetRange').addEventListener('input', (event) => {
    state.budget = Number(event.target.value) || 0;
    $('#budgetOutput').textContent = `$${state.budget}`;
  });

  for (const mood of MOODS) {
    $(`#mood-${mood.id}`).addEventListener('input', (event) => {
      state.moods[mood.id] = Number(event.target.value) || 0;
      $(`#mood-${mood.id}-out`).textContent = event.target.value;
    });
  }

  $('#plannerForm').addEventListener('submit', runPlanner);

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      weaveViews.hero.resize();
      weaveViews.plate.resize();
      weaveViews.radar.resize();
    });
  });

  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08 }
    );
    reveals.forEach((el) => observer.observe(el));
  }

  readPlannerControls();
  scheduleRefresh();
}

wire();
