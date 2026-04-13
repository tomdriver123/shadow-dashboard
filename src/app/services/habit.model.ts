export interface HabitConfig {
  id: string;
  name: string;
  category: string;
  target: number;
  unit: string;
  direction: 'above' | 'below';
  icon: string;
  color: string;
}

export interface HabitEntry {
  value: number | null;
  displayValue: string | null;
  status: 'hit' | 'miss' | null;
  progress: number | null;
}

export interface DayRecord {
  date: string;
  habits: Record<string, HabitEntry>;
}

export interface HabitStreakInfo {
  current: number;
  best: number;
  lastHit: string | null;
  lastMiss: string | null;
}

export interface HabitsData {
  generatedAt: string;
  today: DayRecord | null;
  last30: DayRecord[];
  allHistory: DayRecord[];
  streaks: Record<string, HabitStreakInfo>;
  config: HabitConfig[];
}
