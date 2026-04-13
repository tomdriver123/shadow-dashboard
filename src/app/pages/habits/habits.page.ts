import { Component, OnInit } from '@angular/core';
import { HabitService } from '../../services/habit.service';
import {
  HabitsData,
  HabitConfig,
  DayRecord,
  HabitStreakInfo,
} from '../../services/habit.model';

type HistoryView = 'bar' | 'line' | 'table';

@Component({
  selector: 'app-habits',
  templateUrl: './habits.page.html',
  styleUrls: ['./habits.page.scss'],
  standalone: false,
})
export class HabitsPage implements OnInit {
  data: HabitsData | null = null;
  loading = true;
  error = false;

  historyView: HistoryView = 'bar';
  selectedHabitId = 'steps';

  constructor(private habitService: HabitService) {}

  ngOnInit() {
    this.habitService.getHabits().subscribe({
      next: (d) => {
        this.data = d;
        this.loading = false;
        // Default to first habit with data
        if (d.config?.length) {
          this.selectedHabitId = d.config[0].id;
        }
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

  get config(): HabitConfig[] {
    return this.data?.config ?? [];
  }

  get last30(): DayRecord[] {
    return this.data?.last30 ?? [];
  }

  get streaks(): Record<string, HabitStreakInfo> {
    return this.data?.streaks ?? {};
  }

  get generatedAt(): string {
    if (!this.data?.generatedAt) return '';
    return new Date(this.data.generatedAt).toLocaleString();
  }

  getHabitConfig(id: string): HabitConfig | undefined {
    return this.config.find(c => c.id === id);
  }

  getStreakInfo(id: string): HabitStreakInfo {
    return this.streaks[id] ?? { current: 0, best: 0, lastHit: null, lastMiss: null };
  }

  getTodayEntry(habitId: string) {
    return this.today?.habits[habitId] ?? null;
  }

  getProgressClass(status: string | null): string {
    if (status === 'hit') return 'hit';
    if (status === 'miss') return 'miss';
    return 'no-data';
  }

  // ── History chart ────────────────────────────────────────────────────────

  get selectedConfig(): HabitConfig | undefined {
    return this.getHabitConfig(this.selectedHabitId);
  }

  get chartData(): Array<{ date: string; value: number | null; progress: number | null; status: string | null; label: string }> {
    return this.last30.map(day => {
      const h = day.habits[this.selectedHabitId];
      const dateObj = new Date(day.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date: day.date,
        value: h?.value ?? null,
        progress: h?.progress ?? null,
        status: h?.status ?? null,
        label,
      };
    });
  }

  get maxChartValue(): number {
    const vals = this.chartData.map(d => d.value ?? 0);
    const max = Math.max(...vals, this.selectedConfig?.target ?? 0);
    return max * 1.1; // 10% headroom
  }

  barHeight(progress: number | null): number {
    if (progress === null) return 0;
    return Math.max(2, progress);
  }

  linePoints(): string {
    const data = this.chartData;
    if (!data.length) return '';
    const w = 100 / data.length;
    return data
      .map((d, i) => {
        const x = i * w + w / 2;
        const y = d.progress !== null ? 100 - d.progress : null;
        return y !== null ? `${x},${y}` : null;
      })
      .filter(Boolean)
      .join(' ');
  }

  // ── Heatmap ──────────────────────────────────────────────────────────────

  get heatmapDays(): Array<{ date: string; label: string; statuses: Record<string, string | null> }> {
    return this.last30.map(day => {
      const dateObj = new Date(day.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const statuses: Record<string, string | null> = {};
      for (const cfg of this.config) {
        statuses[cfg.id] = day.habits[cfg.id]?.status ?? null;
      }
      return { date: day.date, label, statuses };
    });
  }

  heatmapClass(status: string | null): string {
    if (status === 'hit') return 'cell-hit';
    if (status === 'miss') return 'cell-miss';
    return 'cell-empty';
  }

  setHistoryView(v: HistoryView) {
    this.historyView = v;
  }

  selectHabit(id: string) {
    this.selectedHabitId = id;
  }

  formatTarget(cfg: HabitConfig): string {
    if (cfg.unit === 'steps') return `${cfg.target.toLocaleString()} steps`;
    if (cfg.unit === 'hours') return `${cfg.target}h`;
    if (cfg.unit === 'minutes') return `${cfg.target}m`;
    return `${cfg.target} ${cfg.unit}`;
  }
}
