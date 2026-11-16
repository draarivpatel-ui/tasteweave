// Frontier chart: every complete plan as a faint dot on a cost (x) and mean
// fit (y) plane, the Pareto frontier as a stepped line, the budget as a
// vertical rule, the greedy slot-share plan as a ring and the exact optimum as
// a filled gold dot. Pure drawing on a 2D context, so it runs under node:test
// with a recording stand-in.

export const FRONTIER_COLORS = {
  ground: '#1F1913',
  grid: 'rgba(241, 232, 215, 0.10)',
  dots: 'rgba(206, 192, 170, 0.20)',
  frontier: '#F1E8D7',
  budget: 'rgba(229, 168, 59, 0.55)',
  greedy: '#7E9CB9',
  optimal: '#E5A83B',
  label: '#9D8F7B',
};

export function frontierScales(plans, w, h, pad = { l: 44, r: 14, t: 14, b: 30 }) {
  const maxCost = Math.max(10, ...plans.map((p) => p.cost));
  const fits = plans.map((p) => p.fit);
  const lo = Math.max(0, Math.floor((Math.min(...fits, 1) - 0.02) * 20) / 20);
  const hi = Math.min(1, Math.ceil((Math.max(...fits, 0) + 0.01) * 20) / 20);
  const x = (cost) => pad.l + (cost / maxCost) * (w - pad.l - pad.r);
  const y = (fit) => pad.t + (1 - (fit - lo) / Math.max(hi - lo, 0.05)) * (h - pad.t - pad.b);
  return { x, y, maxCost, lo, hi, pad };
}

export function drawFrontier(ctx, w, h, data, colors = FRONTIER_COLORS) {
  const { plans, frontier, greedy, optimal, budget } = data;
  ctx.fillStyle = colors.ground;
  ctx.fillRect(0, 0, w, h);
  if (!plans || plans.length === 0) return { dots: 0 };
  const s = frontierScales(plans, w, h);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.label;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'right';
  for (let f = s.lo; f <= s.hi + 1e-9; f += 0.05) {
    const yy = Math.round(s.y(f)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(s.pad.l, yy);
    ctx.lineTo(w - s.pad.r, yy);
    ctx.stroke();
    ctx.fillText(`${Math.round(f * 100)}`, s.pad.l - 6, yy + 4);
  }
  ctx.textAlign = 'center';
  const step = s.maxCost > 60 ? 20 : 10;
  for (let c = 0; c <= s.maxCost; c += step) ctx.fillText(`$${c}`, s.x(c), h - 10);

  ctx.fillStyle = colors.dots;
  for (const p of plans) ctx.fillRect(s.x(p.cost) - 1, s.y(p.fit) - 1, 2, 2);

  ctx.strokeStyle = colors.budget;
  if (ctx.setLineDash) ctx.setLineDash([4, 4]);
  const bx = Math.round(s.x(Math.min(budget, s.maxCost))) + 0.5;
  ctx.beginPath();
  ctx.moveTo(bx, s.pad.t);
  ctx.lineTo(bx, h - s.pad.b);
  ctx.stroke();
  if (ctx.setLineDash) ctx.setLineDash([]);

  ctx.strokeStyle = colors.frontier;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  frontier.forEach((p, i) => {
    if (i === 0) ctx.moveTo(s.x(p.cost), s.y(p.fit));
    else {
      ctx.lineTo(s.x(p.cost), s.y(frontier[i - 1].fit));
      ctx.lineTo(s.x(p.cost), s.y(p.fit));
    }
  });
  ctx.lineTo(w - s.pad.r, s.y(frontier[frontier.length - 1].fit));
  ctx.stroke();

  if (greedy) {
    ctx.strokeStyle = colors.greedy;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x(greedy.cost), s.y(greedy.fit), 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (optimal) {
    ctx.fillStyle = colors.optimal;
    ctx.beginPath();
    ctx.arc(s.x(optimal.cost), s.y(optimal.fit), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'left';
  return { dots: plans.length, scales: s };
}

export function frontierSummary(cmp) {
  const pct = (v) => Math.round(v * 100);
  const gain = pct(cmp.optimal.meanFit) - pct(cmp.greedy.meanFit);
  const lead =
    gain > 0
      ? `Exact optimum under $${cmp.budget}: mean fit ${pct(cmp.optimal.meanFit)} for $${cmp.optimal.cost}, ${gain} points above the slot-share plan (${pct(cmp.greedy.meanFit)} for $${cmp.greedy.cost}).`
      : `Exact optimum under $${cmp.budget}: mean fit ${pct(cmp.optimal.meanFit)} for $${cmp.optimal.cost}. The slot-share plan already matches it.`;
  return `${lead} ${cmp.plans.length} complete plans scored, ${cmp.frontier.length} on the frontier.`;
}
