// SYNTHETIC NEIGHBOR ARCHETYPES. These are invented taste profiles, not real
// people. They exist so the discovery feed can show "taste neighbors" with
// explained overlap. This module is the second documented seam where a live
// taste API would plug in.

export const NEIGHBORS_NOTE =
  'Synthetic archetypes: 8 invented profiles used to demonstrate neighbor matching. Not real people.';

export const NEIGHBORS = [
  {
    id: 'night-market-walker',
    name: 'The Night Market Walker',
    note: 'Chases street food heat and loud, crowded streets.',
    profile: {
      music: { energy: 85, warmth: 40, edge: 60, obscurity: 55 },
      film: { pace: 70, heart: 45, darkness: 50, surrealism: 60 },
      food: { heat: 85, richness: 60, freshness: 55, adventure: 90 },
      books: { momentum: 75, lyricism: 40, darkness: 55, wonder: 60 },
      places: { bustle: 95, nature: 20, coziness: 30, novelty: 85 },
    },
  },
  {
    id: 'cabin-rereader',
    name: 'The Cabin Rereader',
    note: 'Slow mornings, worn paperbacks, one heavy blanket.',
    profile: {
      music: { energy: 20, warmth: 85, edge: 15, obscurity: 35 },
      film: { pace: 25, heart: 85, darkness: 30, surrealism: 20 },
      food: { heat: 15, richness: 85, freshness: 40, adventure: 20 },
      books: { momentum: 25, lyricism: 80, darkness: 25, wonder: 35 },
      places: { bustle: 10, nature: 60, coziness: 90, novelty: 25 },
    },
  },
  {
    id: 'art-matinee-loyalist',
    name: 'The Art Matinee Loyalist',
    note: 'First show of the day, last row, always reading the credits.',
    profile: {
      music: { energy: 45, warmth: 55, edge: 45, obscurity: 70 },
      film: { pace: 30, heart: 70, darkness: 60, surrealism: 85 },
      food: { heat: 40, richness: 55, freshness: 65, adventure: 60 },
      books: { momentum: 35, lyricism: 85, darkness: 50, wonder: 75 },
      places: { bustle: 40, nature: 30, coziness: 55, novelty: 70 },
    },
  },
  {
    id: 'fermentation-tinkerer',
    name: 'The Fermentation Tinkerer',
    note: 'Keeps four jars going and labels them all wrongly.',
    profile: {
      music: { energy: 55, warmth: 45, edge: 55, obscurity: 65 },
      film: { pace: 50, heart: 40, darkness: 45, surrealism: 55 },
      food: { heat: 70, richness: 45, freshness: 80, adventure: 85 },
      books: { momentum: 45, lyricism: 50, darkness: 40, wonder: 65 },
      places: { bustle: 50, nature: 45, coziness: 50, novelty: 75 },
    },
  },
  {
    id: 'stadium-chorus',
    name: 'The Stadium Chorus',
    note: 'Knows every word to the big songs and owns a foam finger.',
    profile: {
      music: { energy: 90, warmth: 60, edge: 25, obscurity: 15 },
      film: { pace: 75, heart: 65, darkness: 30, surrealism: 20 },
      food: { heat: 50, richness: 70, freshness: 45, adventure: 30 },
      books: { momentum: 70, lyricism: 40, darkness: 30, wonder: 25 },
      places: { bustle: 80, nature: 30, coziness: 45, novelty: 35 },
    },
  },
  {
    id: 'deep-cut-archivist',
    name: 'The Deep Cut Archivist',
    note: 'Owns a folder of b-sides sorted by recording year.',
    profile: {
      music: { energy: 50, warmth: 50, edge: 70, obscurity: 95 },
      film: { pace: 45, heart: 45, darkness: 65, surrealism: 75 },
      food: { heat: 55, richness: 50, freshness: 50, adventure: 70 },
      books: { momentum: 50, lyricism: 60, darkness: 55, wonder: 60 },
      places: { bustle: 45, nature: 40, coziness: 50, novelty: 80 },
    },
  },
  {
    id: 'sunrise-trail-runner',
    name: 'The Sunrise Trail Runner',
    note: 'Out the door at six, back with berries and strong opinions.',
    profile: {
      music: { energy: 75, warmth: 50, edge: 35, obscurity: 30 },
      film: { pace: 55, heart: 55, darkness: 25, surrealism: 25 },
      food: { heat: 35, richness: 30, freshness: 85, adventure: 45 },
      books: { momentum: 55, lyricism: 45, darkness: 25, wonder: 50 },
      places: { bustle: 30, nature: 90, coziness: 40, novelty: 55 },
    },
  },
  {
    id: 'velvet-cinema-romantic',
    name: 'The Velvet Cinema Romantic',
    note: 'Cries at the third act and defends every sequel she loves.',
    profile: {
      music: { energy: 35, warmth: 80, edge: 30, obscurity: 45 },
      film: { pace: 35, heart: 90, darkness: 35, surrealism: 50 },
      food: { heat: 30, richness: 80, freshness: 50, adventure: 35 },
      books: { momentum: 40, lyricism: 85, darkness: 35, wonder: 55 },
      places: { bustle: 35, nature: 45, coziness: 70, novelty: 45 },
    },
  },
];
