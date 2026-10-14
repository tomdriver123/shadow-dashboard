export interface SpeciesRef {
  name: string;
  growthRate?: string | null;
  display: string;
  dex: number | null;
  types?: string[];
  sprite: string | null;
}

export interface FormRef extends SpeciesRef {}

export interface Evolution {
  name: string;
  display: string;
  dex: number | null;
  sprite?: string | null;
  trigger: string | null;
  minLevel: number | null;
  item: string | null;
}

export interface XpBySource {
  question: number;
  drill: number;
  share: number;
  hunt: number;
}

export interface PartySlot {
  slot: number;
  track: string;
  trackLabel: string;
  type: string;
  species: SpeciesRef | null;
  form: FormRef | null;
  nickname: string | null;
  xp: number;
  level: number | null;
  levelXp: number;
  nextLevelXp: number;
  progress: number;
  evolution: Evolution | null;
  xpBySource: XpBySource;
}

export interface PokedexEntry {
  species: string;
  display: string;
  dex: number | null;
  sprite: string | null;
  firstSeen: string | null;
  /** Date of the first catch this ledger knows of, or null when only seen. */
  caught: string | boolean | null;
  town: string | null;
  question: string | null;
  seasons: number[];
}

export interface Scout {
  track: string | null;
  trackLabel: string | null;
  company: string | null;
  stage: string | null;
  stageType: string | null;
  date: string | null;
  reason: string | null;
}

export interface GateState {
  open: boolean;
  reason: string;
}

export interface XpLogEntry {
  date: string;
  source: string;
  label: string;
  track: string | null;
  xp: number;
}

export interface Trainer {
  name: string;
  xpTotal: number;
  pokedex: { seen: number; caught: number; seasonCaught: number; cap: number };
}

export interface Season {
  number: number;
  started: string;
}

export interface GameData {
  generatedAt: string;
  warnings: string[];
  season: Season;
  trainer: Trainer;
  party: PartySlot[];
  pokedex: { entries: PokedexEntry[] };
  scout: Scout | null;
  gates: { mewtwo: GateState; moltres: GateState; lavender: GateState };
  routes: [string, string][];
  grid?: unknown;
  xpLog: XpLogEntry[];
}
