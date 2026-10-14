import { PoolEntry, Town, TownGate, TownMode } from './town';

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

const MODES: TownMode[] = ['home', 'scout', 'mcq', 'external', 'reflection', 'league'];

function bool(value: unknown): boolean {
  return value === true;
}

function normalizePool(value: unknown): PoolEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const pool: PoolEntry[] = [];
  for (const row of value) {
    if (!isRecord(row)) {
      continue;
    }
    const species = text(row['species']);
    if (species === null) {
      continue;
    }
    pool.push({
      species,
      display: text(row['display']) ?? species,
      dex: finiteNumber(row['dex']),
      types: strings(row['types']),
      sprite: text(row['sprite']),
      gift: bool(row['gift']),
      gated: bool(row['gated']),
    });
  }
  return pool;
}

function normalizeGates(value: unknown): TownGate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const gates: TownGate[] = [];
  for (const row of value) {
    if (!isRecord(row)) {
      continue;
    }
    gates.push({
      scope: row['scope'] === 'species' ? 'species' : 'town',
      species: text(row['species']),
      kind: text(row['kind']) ?? '',
      open: bool(row['open']),
      reason: text(row['reason']) ?? '',
    });
  }
  return gates;
}

function normalizeGrid(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = finiteNumber(value['x']);
  const y = finiteNumber(value['y']);
  return x === null || y === null ? null : { x, y };
}

export function normalizeTown(raw: unknown): Town | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = text(raw['id']);
  if (id === null) {
    return null;
  }
  // The generator writes 'quiz' for the multiple choice towns.
  const rawMode = raw['mode'] === 'quiz' ? 'mcq' : raw['mode'];
  const mode = MODES.find((m) => m === rawMode) ?? 'mcq';

  return {
    id,
    name: text(raw['name']) ?? id,
    order: finiteNumber(raw['order']) ?? 0,
    role: text(raw['role']),
    description: text(raw['description']),
    mode,
    track: text(raw['track']),
    trackLabel: text(raw['trackLabel']),
    type: text(raw['type']),
    banks: strings(raw['banks']),
    external: text(raw['external']),
    grid: normalizeGrid(raw['grid']),
    pool: normalizePool(raw['pool']),
    gates: normalizeGates(raw['gates']),
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
