// TasteWeave UI wiring. Imports the engine and the synthetic dataset, owns no
// scoring logic itself: every number shown comes from js/engine.

import {
  DOMAINS,
  ATTRIBUTES,
  defaultProfile,
  isValidProfile,
  setAttr,
  randomProfile,
  standouts,
  domainAssertiveness,
  NEUTRAL,
} from './js/engine/profile.js';
import { MOODS } from './js/engine/moods.js';
import { domainFit, domainGaps, explainDomainFit, neighborFit, fitPercent } from './js/engine/similarity.js';
import { planItinerary, SLOTS } from './js/engine/itinerary.js';
import { CATALOG } from './js/data/catalog.js';
import { NEIGHBORS } from './js/data/personas.js';

const STORAGE_KEY = 'tasteweave.profile.v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  profile: loadProfile(),
  moods: { energize: 0, unwind: 0, focus: 0, wander: 0 },
  budget: 40,
  filter: 'all',
};

let refreshQueued = false;
let logTimers = [];

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

const $ = (selector) => document.querySelector(selector);

function costLabel(cost) {
  return cost === 0 ? 'Free' : `$${cost}`;
}

function isNeutral(profile) {
  return standouts(profile, 1)[0].distance === 0;
}

function domainColor(domainId) {
  const domain = DOMAINS.find((d) => d.id === domainId);
  return domain ? domain.color : '#e8a33d';
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
        saveProfile();
        scheduleRefresh();
      });
    }
  }
}

function syncSlidersToProfile() {
  for (const domain of DOMAINS) {
    for (const def of ATTRIBUTES[domain.id]) {
      const input = document.getElementById(`${domain.id}-${def.id}`);
      const output = document.getElementById(`${domain.id}-${def.id}-out`);
      const value = state.profile[domain.id][def.id];
      if (input) input.value = String(value);
      if (output) output.textContent = String(value);
    }
  }
}

/* Summaries */

function renderSignatureSummary() {
  const target = $('#signatureSummary');
  if (isNeutral(state.profile)) {
    target.textContent = 'All twenty attributes sit at neutral. Drag a slider to start the weave.';
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

/* Discovery feed */

function whyList(profile, item) {
  const { close, stretch } = explainDomainFit(profile, item);
  const lines = [];
  if (close.length > 0) {
    for (const gap of close) {
      lines.push(`<li>${gap.label}: you ${gap.userValue}, this ${gap.itemValue}, gap ${gap.gap}</li>`);
    }
  } else {
    // No attribute inside the close band: show the two nearest honestly.
    for (const gap of domainGaps(profile, item).slice(0, 2)) {
      lines.push(`<li>${gap.label}: you ${gap.userValue}, this ${gap.itemValue}, gap ${gap.gap}</li>`);
    }
  }
  if (stretch) {
    lines.push(`<li class="stretch">Stretch: ${stretch.label}, you ${stretch.userValue}, this ${stretch.itemValue}</li>`);
  }
  return lines.join('');
}

function feedCard(item, fit) {
  const card = document.createElement('article');
  card.className = `card card-${item.domain}`;
  const pct = fitPercent(fit.score);
  card.innerHTML = `
    <div class="card-top">
      <span class="chip chip-${item.domain}"><span class="dot" aria-hidden="true"></span>${domainLabel(item.domain)}</span>
      <span class="card-fit">${pct}% match</span>
    </div>
    <h3>${item.title}</h3>
    <p class="creator">${item.creator}</p>
    <p class="blurb">${item.blurb}</p>
    <div class="meter" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    <p class="why-label">Why this matched</p>
    <ul class="why">${whyList(state.profile, item)}</ul>`;
  return card;
}

function domainLabel(domainId) {
  const domain = DOMAINS.find((d) => d.id === domainId);
  return domain ? domain.label : domainId;
}

function renderFeed() {
  const grid = $('#feedGrid');
  const scored = CATALOG.map((item) => ({ item, fit: domainFit(state.profile, item) }));
  scored.sort((a, b) => b.fit.score - a.fit.score);
  const shown = state.filter === 'all' ? scored.slice(0, 12) : scored.filter((x) => x.item.domain === state.filter);
  grid.replaceChildren(...shown.map(({ item, fit }) => feedCard(item, fit)));
}

function neighborCard(neighbor, fit) {
  const card = document.createElement('article');
  card.className = 'card card-neighbor';
  const pct = fitPercent(fit.score);
  const shared = fit.shared
    .map((g) => `<li>${g.label}, you ${g.you}, them ${g.them}</li>`)
    .join('');
  const divergent = `<li class="stretch">Most different: ${fit.divergent.label}, you ${fit.divergent.you}, them ${fit.divergent.them}</li>`;
  card.innerHTML = `
    <div class="card-top">
      <span class="chip"><span class="dot" aria-hidden="true"></span>Synthetic archetype</span>
      <span class="card-fit">${pct}% aligned</span>
    </div>
    <h3>${neighbor.name}</h3>
    <p class="blurb">${neighbor.note}</p>
    <div class="meter" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    <p class="why-label">Shared ground</p>
    <ul class="why">${shared}${divergent}</ul>`;
  return card;
}

function renderNeighbors() {
  const grid = $('#neighborGrid');
  const scored = NEIGHBORS.map((neighbor) => ({ neighbor, fit: neighborFit(state.profile, neighbor.profile) }));
  scored.sort((a, b) => b.fit.score - a.fit.score);
  grid.replaceChildren(...scored.slice(0, 4).map(({ neighbor, fit }) => neighborCard(neighbor, fit)));
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
    <div class="card-top">
      <span class="chip chip-${pick.item.domain}"><span class="dot" aria-hidden="true"></span>${pick.verb}</span>
      <span class="card-fit">${pct}% fit</span>
    </div>
    <h3>${pick.item.title}</h3>
    <p class="creator">${pick.item.creator}</p>
    <p class="pick-cost">${costLabel(pick.item.cost)} to enjoy, ${pick.item.domain} domain</p>
    <div class="meter" aria-hidden="true"><span style="width: ${pct}%"></span></div>
    <p class="why-label">Why this pick</p>
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
  phase.textContent = step.phase.charAt(0).toUpperCase() + step.phase.slice(1);
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

/* Canvas drawing */

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

function drawWeave(canvas, profile) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const padX = Math.max(20, w * 0.04);
  const padY = Math.max(18, h * 0.1);
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(243, 236, 221, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const y = padY + (innerH * i) / 10;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(w - padX, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(243, 236, 221, 0.06)';
  for (let i = 0; i < 4; i += 1) {
    const x = padX + (innerW * i) / 3;
    ctx.beginPath();
    ctx.moveTo(x, padY);
    ctx.lineTo(x, h - padY);
    ctx.stroke();
  }
  ctx.restore();

  const order = ['places', 'books', 'food', 'film', 'music'];
  for (const domainId of order) {
    const pts = ATTRIBUTES[domainId].map((def, i) => ({
      x: padX + (innerW * i) / 3,
      y: padY + innerH * (1 - profile[domainId][def.id] / 100),
    }));
    const color = domainColor(domainId);
    strokeThread(ctx, pts, color, 9, 0.1);
    strokeThread(ctx, pts, color, 2.6, 0.92);
    ctx.save();
    ctx.fillStyle = color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawRadar(canvas, profile) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2 + 2;
  const R = Math.min(w, h) / 2 - Math.max(38, Math.min(w, h) * 0.14);

  const spokes = [];
  for (const domain of DOMAINS) {
    for (const def of ATTRIBUTES[domain.id]) {
      spokes.push({ domain: domain.id, label: def.label, value: profile[domain.id][def.id] });
    }
  }
  const total = spokes.length;
  const angleFor = (i) => (Math.PI * 2 * i) / total - Math.PI / 2;
  const pointAt = (i, radius) => ({
    x: cx + Math.cos(angleFor(i)) * radius,
    y: cy + Math.sin(angleFor(i)) * radius,
  });

  ctx.save();
  ctx.strokeStyle = 'rgba(243, 236, 221, 0.09)';
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
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(199, 188, 164, 0.85)';
  for (let i = 0; i < total; i += 1) {
    const ang = angleFor(i);
    const lx = cx + Math.cos(ang) * (R + 16);
    const ly = cy + Math.sin(ang) * (R + 16);
    ctx.textAlign = Math.cos(ang) > 0.35 ? 'left' : Math.cos(ang) < -0.35 ? 'right' : 'center';
    ctx.textBaseline = Math.sin(ang) > 0.35 ? 'top' : Math.sin(ang) < -0.35 ? 'bottom' : 'middle';
    ctx.fillText(spokes[i].label, lx, ly);
  }
  ctx.restore();

  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = 'rgba(243, 236, 221, 0.22)';
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
    const s = spokes[i % total];
    const p = pointAt(i % total, (s.value / 100) * R);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(232, 163, 61, 0.16)';
  ctx.fill();
  ctx.strokeStyle = '#e8a33d';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < total; i += 1) {
    const s = spokes[i];
    const p = pointAt(i, (s.value / 100) * R);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = domainColor(s.domain);
    ctx.fill();
  }
}

function drawCanvases() {
  drawWeave($('#heroWeave'), state.profile);
  drawWeave($('#sigWeave'), state.profile);
  drawRadar($('#radar'), state.profile);
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    renderSignatureSummary();
    renderFeed();
    renderNeighbors();
    renderInterpretation();
    drawCanvases();
  });
}

/* Wiring */

function wire() {
  buildProfileSliders();

  $('#randomize').addEventListener('click', () => {
    state.profile = randomProfile();
    saveProfile();
    syncSlidersToProfile();
    scheduleRefresh();
  });

  $('#resetProfile').addEventListener('click', () => {
    state.profile = defaultProfile();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    syncSlidersToProfile();
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
      drawCanvases();
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
