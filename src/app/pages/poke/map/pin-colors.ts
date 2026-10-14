export const PIN_PATH =
  'M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0zm0 19a5 5 0 1 1 0-10 5 5 0 0 1 0 10z';

export const PIN_COLORS = [
  '#c1121f',
  '#e36414',
  '#b8860b',
  '#2a9d3f',
  '#0f766e',
  '#0284c7',
  '#6d28d9',
  '#c026d3',
  '#be185d',
  '#8d5524',
  '#475569',
  '#6b8e23',
] as const;

/** The color for the town at this position in the list; wraps after the last color. */
export function pinColor(index: number): string {
  return PIN_COLORS[index % PIN_COLORS.length];
}
