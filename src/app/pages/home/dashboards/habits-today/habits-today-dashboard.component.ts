import { Component, OnInit } from '@angular/core';
import { HabitService } from '../../../../services/habit.service';
import { DayRecord, HabitsData, HabitTier } from '../../../../services/habit.model';

/** One habit's compact card in the tile: the config plus today's reading. */
interface HabitChip {
  id: string;
  name: string;
  icon: string;
  color: string;
  tier: HabitTier | null;
  displayValue: string | null;
  points: number;
}

interface BestStreak {
  name: string;
  current: number;
}

// Ring geometry: r = 52 on a 0..120 viewBox, circumference = 2 * PI * 52.
const RING_CIRCUMFERENCE = 326.7;

@Component({
  selector: 'app-habits-today-dashboard',
  templateUrl: './habits-today-dashboard.component.html',
  styleUrls: ['./habits-today-dashboard.component.scss'],
  standalone: false,
})
export class HabitsTodayDashboardComponent implements OnInit {
  data: HabitsData | null = null;
  loading = true;
  error = false;

  readonly ringCircumference = RING_CIRCUMFERENCE;

  constructor(private habitService: HabitService) {}

  ngOnInit(): void {
    this.habitService.getHabits().subscribe({
      next: (data) => {
        this.data = data;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  get today(): DayRecord | null {
    return this.data?.today ?? null;
  }

  get points(): number {
    return this.today?.totalPoints ?? 0;
  }

  get maxPoints(): number {
    return this.data?.totalMaxPoints ?? 75;
  }

  get pct(): number {
    const p = this.today?.pointsProgress ?? 0;
    return Math.min(100, Math.max(0, p));
  }

  /** Same bands as the generator's getTier(), so the ring reads the same as the habit cards. */
  get ringTier(): HabitTier {
    const p = this.pct;
    if (p >= 100) return 'hit';
    if (p >= 75) return 'close';
    if (p >= 50) return 'mid';
    if (p >= 25) return 'miss';
    return 'fail';
  }

  get chips(): HabitChip[] {
    const config = this.data?.config ?? [];
    const habits = this.today?.habits ?? {};
    return config.map((cfg) => {
      const entry = habits[cfg.id];
      return {
        id: cfg.id,
        name: cfg.name,
        icon: cfg.icon,
        color: cfg.color,
        tier: entry?.tier ?? null,
        displayValue: entry?.displayValue ?? null,
        points: entry?.points ?? 0,
      };
    });
  }

  get bestStreak(): BestStreak | null {
    const streaks = this.data?.streaks ?? {};
    const config = this.data?.config ?? [];
    let best: BestStreak | null = null;
    for (const cfg of config) {
      const s = streaks[cfg.id];
      if (!s || s.current <= 0) continue;
      if (!best || s.current > best.current) {
        best = { name: cfg.name, current: s.current };
      }
    }
    return best;
  }
}
