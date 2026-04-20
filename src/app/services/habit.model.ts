export interface HabitConfig {
  id: string;
  name: string;
  category: string;
  target: number;
  unit: string;
  direction: 'above' | 'below';
  icon: string;
  color: string;
  maxPoints: number;
}

export type HabitTier = 'fail' | 'miss' | 'mid' | 'close' | 'hit';

export interface HabitEntry {
  value: number | null;
  displayValue: string | null;
  status: 'hit' | 'miss' | null;
  progress: number | null;
  tier: HabitTier | null;
  points: number;
}

export interface DayRecord {
  date: string;
  habits: Record<string, HabitEntry>;
  points: Record<string, number>;
  totalPoints: number;
  pointsProgress: number;
}

export interface HabitStreakInfo {
  current: number;
  best: number;
  lastHit: string | null;
  lastMiss: string | null;
}

export interface PointsSeriesEntry {
  date: string;
  totalPoints: number;
  pointsProgress: number;
}

export interface HabitsData {
  generatedAt: string;
  totalMaxPoints: number;
  today: DayRecord | null;
  last30: DayRecord[];
  allHistory: DayRecord[];
  pointsSeries: PointsSeriesEntry[];
  streaks: Record<string, HabitStreakInfo>;
  config: HabitConfig[];
}
