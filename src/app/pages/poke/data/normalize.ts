import { Town } from './town';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function inRange(value: number | null, limit: number): value is number {
  return value !== null && Math.abs(value) <= limit;
}

function amenityLabel(value: string): string {
  const label = value.replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    const trimmed = text(item);
    if (trimmed !== null) {
      result.push(trimmed);
    }
  }
  return result;
}

export function normalizeTown(raw: unknown): Town | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = text(raw['id']);
  if (id === null) {
    return null;
  }

  const location = isRecord(raw['location']) ? raw['location'] : null;
  const lat = finiteNumber(location?.['lat']);
  const lng = finiteNumber(location?.['lng']);
  const coordinates = inRange(lat, 90) && inRange(lng, 180) ? { lat, lng } : null;

  return {
    id,
    name: text(raw['name']) ?? id,
    description: text(raw['description']),
    coordinates,
    address: text(location?.['address']),
    amenities: strings(raw['amenities']).map(amenityLabel),
    hours: text(raw['hours']),
    images: strings(raw['images']),
    acreage: finiteNumber(raw['acreage']),
    rating: finiteNumber(raw['rating']),
  };
}

export function normalizeTowns(raw: unknown): Town[] {
  if (!Array.isArray(raw)) {
    throw new Error('Expected an array of towns');
  }
  const seen = new Set<string>();
  const towns: Town[] = [];
  for (const row of raw) {
    const town = normalizeTown(row);
    if (town !== null && !seen.has(town.id)) {
      seen.add(town.id);
      towns.push(town);
    }
  }
  return towns;
}
