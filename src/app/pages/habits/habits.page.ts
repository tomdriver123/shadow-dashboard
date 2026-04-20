import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { HabitService } from '../../services/habit.service';
import {
  HabitsData,
  HabitConfig,
  DayRecord,
  HabitEntry,
  HabitStreakInfo,
  HabitTier,
} from '../../services/habit.model';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type HistoryView = 'bar' | 'line' | 'table';

@Component({
  selector: 'app-habits',
  templateUrl: './habits.page.html',
  styleUrls: ['./habits.page.scss'],
  standalone: false,
})
export class HabitsPage implements OnInit, OnDestroy {
  data: HabitsData | null = null;
  loading = true;
  error = false;

  historyView: HistoryView = 'bar';
  selectedHabitId = 'steps';
  selectedDate: string | null = null; // null = today

  private chart: Chart | null = null;

  constructor(private habitService: HabitService, private ngZone: NgZone) {}

  ngOnInit() {
    this.habitService.getHabits().subscribe({
      next: (d) => {
        this.data = d;
        this.loading = false;
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

  ngOnDestroy() {
    this.chart?.destroy();
  }

  // ── Chart.js ViewChild (setter pattern for *ngIf) ───────────────────────
  @ViewChild('pointsChart') set pointsChartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    if (ref && !this.chart && this.data) {
      this.ngZone.runOutsideAngular(() => this.buildPointsChart(ref.nativeElement));
    }
  }

  // ── Core data accessors ─────────────────────────────────────────────────

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

  get totalMaxPoints(): number {
    return this.data?.totalMaxPoints ?? 75;
  }

  // ── Day navigation ──────────────────────────────────────────────────────

  get displayedDay(): DayRecord | null {
    if (!this.selectedDate) return this.today;
    return this.data?.allHistory.find(d => d.date === this.selectedDate) ?? null;
  }

  get displayedDate(): string {
    if (!this.selectedDate) return this.today?.date ?? new Date().toISOString().slice(0, 10);
    return this.selectedDate;
  }

  get displayedDateFormatted(): string {
    const d = new Date(this.displayedDate + 'T12:00:00');
    if (this.isViewingToday) return 'Today';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  get isViewingToday(): boolean {
    return this.selectedDate === null;
  }

  get canNavigatePrev(): boolean {
    const history = this.data?.allHistory ?? [];
    if (!history.length) return false;
    const currentDate = this.displayedDate;
    const idx = history.findIndex(d => d.date === currentDate);
    return idx > 0 || idx === -1;
  }

  get canNavigateNext(): boolean {
    const history = this.data?.allHistory ?? [];
    if (!history.length) return false;
    if (this.isViewingToday) return false;
    const idx = history.findIndex(d => d.date === this.selectedDate);
    if (idx === -1) return true;
    return idx < history.length - 1 || this.selectedDate !== this.today?.date;
  }

  navigateDay(offset: number): void {
    const history = this.data?.allHistory ?? [];
    if (!history.length) return;
    const currentDate = this.displayedDate;
    const dates = history.map(d => d.date);
    let idx = dates.indexOf(currentDate);

    if (idx === -1) {
      // Current date not in history — jump to the closest
      if (offset < 0) idx = dates.length - 1;
      else idx = 0;
    } else {
      idx = Math.max(0, Math.min(dates.length - 1, idx + offset));
    }

    const newDate = dates[idx];
    this.selectedDate = (newDate === this.today?.date) ? null : newDate;
  }

  goToToday(): void {
    this.selectedDate = null;
  }

  // ── Displayed day helpers ───────────────────────────────────────────────

  get displayedTotalPoints(): number {
    return this.displayedDay?.totalPoints ?? 0;
  }

  get displayedPointsProgress(): number {
    return this.displayedDay?.pointsProgress ?? 0;
  }

  getDisplayedEntry(habitId: string): HabitEntry | null {
    return this.displayedDay?.habits[habitId] ?? null;
  }

  getHabitPoints(habitId: string): number {
    return this.displayedDay?.points?.[habitId] ?? 0;
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

  tierClass(tier: HabitTier | null | undefined): string {
    return tier ?? 'no-data';
  }

  tierLabel(tier: HabitTier | null | undefined): string {
    if (!tier) return '—';
    return tier.toUpperCase();
  }

  private minutesAfterMidnightToClock(totalMin: number): string {
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    let displayHour: number;
    let ampm: string;
    if (h === 0)       { displayHour = 12; ampm = 'AM'; }
    else if (h < 12)   { displayHour = h;  ampm = 'AM'; }
    else if (h === 12) { displayHour = 12; ampm = 'PM'; }
    else               { displayHour = h - 12; ampm = 'PM'; }
    return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  formatTarget(cfg: HabitConfig): string {
    if (cfg.id === 'sleep_timing') {
      // target stored as minutes-after-9pm; convert to clock time
      return this.minutesAfterMidnightToClock((21 * 60 + cfg.target) % (24 * 60));
    }
    if (cfg.id === 'wake_timing') {
      return this.minutesAfterMidnightToClock(cfg.target);
    }
    if (cfg.unit === 'steps') return `${cfg.target.toLocaleString()} steps`;
    if (cfg.unit === 'hours') return `${cfg.target}h`;
    if (cfg.unit === 'minutes') return `${cfg.target}m`;
    return `${cfg.target} ${cfg.unit}`;
  }

  // ── History chart ───────────────────────────────────────────────────────

  get selectedConfig(): HabitConfig | undefined {
    return this.getHabitConfig(this.selectedHabitId);
  }

  get chartData(): Array<{ date: string; value: number | null; progress: number | null; status: string | null; tier: HabitTier | null; label: string }> {
    return this.last30.map(day => {
      const h = day.habits[this.selectedHabitId];
      const dateObj = new Date(day.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date: day.date,
        value: h?.value ?? null,
        progress: h?.progress ?? null,
        status: h?.status ?? null,
        tier: h?.tier ?? null,
        label,
      };
    });
  }

  get maxChartValue(): number {
    const vals = this.chartData.map(d => d.value ?? 0);
    const max = Math.max(...vals, this.selectedConfig?.target ?? 0);
    return max * 1.1;
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

  // ── Heatmap ─────────────────────────────────────────────────────────────

  get heatmapDays(): Array<{ date: string; label: string; tiers: Record<string, HabitTier | null> }> {
    return this.last30.map(day => {
      const dateObj = new Date(day.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const tiers: Record<string, HabitTier | null> = {};
      for (const cfg of this.config) {
        tiers[cfg.id] = day.habits[cfg.id]?.tier ?? null;
      }
      return { date: day.date, label, tiers };
    });
  }

  heatmapClass(tier: HabitTier | null): string {
    if (!tier) return 'cell-empty';
    return `cell-${tier}`;
  }

  setHistoryView(v: HistoryView) {
    this.historyView = v;
  }

  selectHabit(id: string) {
    this.selectedHabitId = id;
  }

  // ── Points line chart (Chart.js) ────────────────────────────────────────

  private buildPointsChart(canvas: HTMLCanvasElement): void {
    if (!this.data) return;
    const series = this.data.pointsSeries;

    const labels = series.map(d => {
      const dt = new Date(d.date + 'T12:00:00');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const dataPoints = series.map(d => d.totalPoints > 0 ? d.totalPoints : null);

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Daily Points',
            data: dataPoints,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 6,
            spanGaps: false,
          },
          {
            label: 'Max (75)',
            data: Array(labels.length).fill(75),
            borderColor: 'rgba(255, 255, 255, 0.15)',
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            min: 0,
            max: 80,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 11 } },
          },
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.4)',
              font: { size: 10 },
              maxRotation: 45,
              autoSkip: true,
              maxTicksLimit: 15,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                if (idx === undefined) return '';
                return series[idx]?.date ?? '';
              },
              label: (ctx) => {
                if (ctx.datasetIndex === 1) return '';
                const idx = ctx.dataIndex;
                const entry = series[idx];
                if (!entry || entry.totalPoints === 0) return 'No data';
                return `${entry.totalPoints.toFixed(1)} pts (${entry.pointsProgress}%)`;
              },
            },
          },
        },
      },
    });
  }
}
