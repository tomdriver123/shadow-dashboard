import { LatLng, latLng } from 'leaflet';

/** Grid units: x grows right, y grows down (Gen 1 town map). Leaflet CRS.Simple has y up. */
export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 18;
export const GRID_MARGIN = 2;

export function gridToLatLng(grid: { x: number; y: number }): LatLng {
  return latLng(-grid.y, grid.x);
}
