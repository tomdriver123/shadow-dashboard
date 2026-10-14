/** Gen 1 type colors. Text on each stays readable with the paired ink color. */
export const TYPE_COLORS: Record<string, { bg: string; ink: string }> = {
  normal: { bg: '#a8a878', ink: '#1c1c10' },
  fire: { bg: '#e8672a', ink: '#1f0a00' },
  water: { bg: '#5a8be0', ink: '#04122e' },
  electric: { bg: '#f5cf2b', ink: '#2a2200' },
  grass: { bg: '#6fbf4a', ink: '#0b2000' },
  ice: { bg: '#8fd6d6', ink: '#06292b' },
  fighting: { bg: '#c03028', ink: '#ffffff' },
  poison: { bg: '#a040a0', ink: '#ffffff' },
  ground: { bg: '#d9bc66', ink: '#2b2000' },
  flying: { bg: '#a890f0', ink: '#16093d' },
  psychic: { bg: '#f85888', ink: '#2e0010' },
  bug: { bg: '#a8b820', ink: '#1d2300' },
  rock: { bg: '#b8a038', ink: '#221b00' },
  ghost: { bg: '#705898', ink: '#ffffff' },
  dragon: { bg: '#7038f8', ink: '#ffffff' },
};

const FALLBACK = { bg: '#9aa0a6', ink: '#111111' };

export function typeColor(type: string | null | undefined): { bg: string; ink: string } {
  return (type && TYPE_COLORS[type.toLowerCase()]) || FALLBACK;
}
