// Mood weights: how the four mood sliders tilt scoring inside each domain.
// A positive boost prefers high values of an attribute, a negative boost
// prefers low values. Weights are multiplied by the slider value (0 to 1).
// Hand tuned heuristics, documented here so the planner stays explainable.

export const MOODS = [
  {
    id: 'energize',
    label: 'Energize',
    blurb: 'Loud, fast, bright picks.',
    boosts: {
      'music.energy': 1,
      'film.pace': 0.8,
      'food.heat': 0.6,
      'books.momentum': 0.8,
      'places.bustle': 0.6,
    },
  },
  {
    id: 'unwind',
    label: 'Unwind',
    blurb: 'Soft, warm, comforting picks.',
    boosts: {
      'music.warmth': 1,
      'film.heart': 0.8,
      'food.richness': 0.6,
      'books.lyricism': 0.6,
      'places.coziness': 0.8,
    },
  },
  {
    id: 'focus',
    label: 'Focus',
    blurb: 'Quiet, deep, absorbing picks.',
    boosts: {
      'music.energy': -0.9,
      'music.obscurity': 0.4,
      'film.pace': -0.4,
      'books.momentum': 0.7,
      'food.freshness': 0.3,
    },
  },
  {
    id: 'wander',
    label: 'Wander',
    blurb: 'Strange, new, exploratory picks.',
    boosts: {
      'music.obscurity': 0.8,
      'film.surrealism': 1,
      'food.adventure': 1,
      'books.wonder': 0.8,
      'places.novelty': 1,
    },
  },
];

// moodValues: { energize: 0..100, unwind: 0..100, focus: 0..100, wander: 0..100 }
export function flattenMoods(moodValues) {
  const weights = {};
  for (const mood of MOODS) {
    const raw = Number(moodValues && moodValues[mood.id]);
    const strength = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) / 100 : 0;
    for (const [key, boost] of Object.entries(mood.boosts)) {
      weights[key] = (weights[key] || 0) + strength * boost;
    }
  }
  return weights;
}

export function moodMass(weights) {
  let mass = 0;
  for (const w of Object.values(weights)) mass += Math.abs(w);
  return mass;
}
