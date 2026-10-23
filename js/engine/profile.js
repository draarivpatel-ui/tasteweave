// TasteWeave profile model: 5 culture domains, 4 attributes each, 0 to 100.
// Pure data helpers. No DOM, no network.

export const DOMAINS = [
  { id: 'music', label: 'Music', color: '#E5A83B' },
  { id: 'film', label: 'Film', color: '#E07A5F' },
  { id: 'food', label: 'Food', color: '#93B572' },
  { id: 'books', label: 'Books', color: '#7E9CB9' },
  { id: 'places', label: 'Places', color: '#B58BA6' },
];

export const ATTRIBUTES = {
  music: [
    { id: 'energy', label: 'Energy', low: 'Hushed', high: 'Kinetic' },
    { id: 'warmth', label: 'Warmth', low: 'Crisp', high: 'Velvet' },
    { id: 'edge', label: 'Edge', low: 'Polished', high: 'Gritty' },
    { id: 'obscurity', label: 'Obscurity', low: 'Familiar', high: 'Deep Cut' },
  ],
  film: [
    { id: 'pace', label: 'Pace', low: 'Slow Burn', high: 'Propulsive' },
    { id: 'heart', label: 'Heart', low: 'Icy', high: 'Tender' },
    { id: 'darkness', label: 'Darkness', low: 'Sunlit', high: 'Shadowed' },
    { id: 'surrealism', label: 'Surrealism', low: 'Grounded', high: 'Dreamlike' },
  ],
  food: [
    { id: 'heat', label: 'Heat', low: 'Gentle', high: 'Fiery' },
    { id: 'richness', label: 'Richness', low: 'Light', high: 'Indulgent' },
    { id: 'freshness', label: 'Freshness', low: 'Slow Simmered', high: 'Farm Stand' },
    { id: 'adventure', label: 'Adventure', low: 'Safe', high: 'Fearless' },
  ],
  books: [
    { id: 'momentum', label: 'Momentum', low: 'Contemplative', high: 'Gripping' },
    { id: 'lyricism', label: 'Lyricism', low: 'Plain Spoken', high: 'Poetic' },
    { id: 'darkness', label: 'Darkness', low: 'Cozy', high: 'Bleak' },
    { id: 'wonder', label: 'Wonder', low: 'Everyday', high: 'Otherworldly' },
  ],
  places: [
    { id: 'bustle', label: 'Bustle', low: 'Secluded', high: 'Buzzing' },
    { id: 'nature', label: 'Nature', low: 'Urban', high: 'Wild' },
    { id: 'coziness', label: 'Coziness', low: 'Stark', high: 'Snug' },
    { id: 'novelty', label: 'Novelty', low: 'Known', high: 'Undiscovered' },
  ],
};

export const NEUTRAL = 50;
export const TOTAL_ATTRIBUTES = DOMAINS.length * 4;

export function attrKey(domain, attr) {
  return `${domain}.${attr}`;
}

export function attrIds() {
  const keys = [];
  for (const d of DOMAINS) {
    for (const a of ATTRIBUTES[d.id]) keys.push(attrKey(d.id, a.id));
  }
  return keys;
}

export function attrDef(key) {
  const [domain, attr] = key.split('.');
  for (const a of ATTRIBUTES[domain]) {
    if (a.id === attr) return { domain, ...a };
  }
  return null;
}

export function clampAttr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NEUTRAL;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function defaultProfile() {
  const profile = {};
  for (const d of DOMAINS) {
    profile[d.id] = {};
    for (const a of ATTRIBUTES[d.id]) profile[d.id][a.id] = NEUTRAL;
  }
  return profile;
}

export function isValidProfile(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const d of DOMAINS) {
    if (!obj[d.id] || typeof obj[d.id] !== 'object') return false;
    for (const a of ATTRIBUTES[d.id]) {
      const v = obj[d.id][a.id];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return false;
    }
  }
  return true;
}

export function setAttr(profile, domain, attr, value) {
  profile[domain][attr] = clampAttr(value);
  return profile;
}

export function profileVector(profile) {
  return attrIds().map((key) => {
    const [d, a] = key.split('.');
    return profile[d][a];
  });
}

export function randomProfile() {
  const profile = {};
  for (const d of DOMAINS) {
    profile[d.id] = {};
    for (const a of ATTRIBUTES[d.id]) profile[d.id][a.id] = Math.round(Math.random() * 100);
  }
  return profile;
}

// The attributes that sit furthest from neutral, with their direction word.
export function standouts(profile, count = 4) {
  const rows = [];
  for (const d of DOMAINS) {
    for (const a of ATTRIBUTES[d.id]) {
      const value = profile[d.id][a.id];
      const lean = value >= NEUTRAL ? a.high : a.low;
      rows.push({
        key: attrKey(d.id, a.id),
        domain: d.id,
        label: a.label,
        lean,
        value,
        distance: Math.abs(value - NEUTRAL),
      });
    }
  }
  rows.sort((x, y) => y.distance - x.distance);
  return rows.slice(0, count);
}

// Mean distance from neutral per domain: which part of the profile is loudest.
export function domainAssertiveness(profile) {
  const out = [];
  for (const d of DOMAINS) {
    let sum = 0;
    for (const a of ATTRIBUTES[d.id]) sum += Math.abs(profile[d.id][a.id] - NEUTRAL);
    out.push({ domain: d.id, label: d.label, mean: sum / ATTRIBUTES[d.id].length });
  }
  out.sort((x, y) => y.mean - x.mean);
  return out;
}
