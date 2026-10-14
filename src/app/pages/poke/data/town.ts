export type TownMode = 'home' | 'scout' | 'mcq' | 'external' | 'reflection' | 'league';

export interface PoolEntry {
  species: string;
  display: string;
  dex: number | null;
  types: string[];
  sprite: string | null;
  gift: boolean;
  gated: boolean;
}

export interface TownGate {
  scope: 'species' | 'town';
  species: string | null;
  kind: string;
  open: boolean;
  reason: string;
}

export interface Town {
  id: string;
  name: string;
  order: number;
  role: string | null;
  description: string | null;
  mode: TownMode;
  track: string | null;
  trackLabel: string | null;
  type: string | null;
  banks: string[];
  external: string | null;
  grid: { x: number; y: number } | null;
  pool: PoolEntry[];
  gates: TownGate[];
}
