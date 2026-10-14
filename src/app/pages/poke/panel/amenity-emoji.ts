const FALLBACK = '🌳';

const EMOJI: Record<string, string> = {
  playground: '🛝',
  'dog run': '🐕',
  trails: '🥾',
  restrooms: '🚻',
  towning: '🅿️',
  lake: '🏞️',
  'picnic areas': '🧺',
  waterfront: '🌊',
  'bike path': '🚲',
  'wildlife viewing': '🦆',
  'splash pad': '💦',
  basketball: '🏀',
  'water fountain': '🚰',
  'sports fields': '⚽',
  gardens: '🌷',
  cafe: '☕',
  'gift shop': '🛍️',
  'accessible paths': '♿',
  fishing: '🎣',
  'kayak launch': '🛶',
  'event lawn': '🎪',
  wifi: '📶',
  'food vendors': '🌮',
  boardwalk: '🚶',
  'skate town': '🛹',
  lighting: '💡',
};

/** Decorative emoji for an amenity label; an unknown label gets a tree. */
export function amenityEmoji(label: string): string {
  const key = label.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EMOJI, key) ? EMOJI[key] : FALLBACK;
}
