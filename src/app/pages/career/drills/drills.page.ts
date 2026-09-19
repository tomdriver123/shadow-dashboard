import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { CareerService } from '../../../services/career.service';
import { CareerData, DrillProblem, PatternAgg } from '../../../services/career.model';

Chart.register(...registerables);

// ── Palette (career-ui-brief.md; hardcoded per page, no shared partial) ────
const CAREER_COLORS = {
  accent: '#f59e0b',
  advanced: '#059669',
};

type DrillFilter = 'all' | 'due' | 'overdue' | 'struggling' | 'scheduled' | 'learned';
type ChartTableView = 'chart' | 'table';

const STATE_PRIORITY: Record<string, number> = {
  overdue: 0,
  due: 1,
  struggling: 2,
  scheduled: 3,
  learned: 4,
};

interface FilterOption {
  value: DrillFilter;
  label: string;
}

/**
 * Drills list: KPI snapshot, filterable/searchable problem table, guided
 * decision rate chart (cumulative learned rendered as a companion sparkline,
 * never a second Chart.js axis), per topic bars, and the current position /
 * weak spots notes from the drill log.
 * Data source: CareerService (assets/data/career.json, generated from the vault).
 */
@Component({
  selector: 'app-career-drills',
  templateUrl: './drills.page.html',
  styleUrls: ['./drills.page.scss'],
  standalone: false,
})
export class DrillsPage implements OnInit, OnDestroy {
  private readonly careerService = inject(CareerService);
  private readonly ngZone = inject(NgZone);

  data: CareerData | null = null;
  loading = true;
  error = false;

  activeFilter: DrillFilter = 'all';
  search = '';
  chartView: ChartTableView = 'chart';
  positionExpanded = false;
  weakSpotsExpanded = false;

  readonly filters: FilterOption[] = [
    { value: 'all', label: 'All' },
    { value: 'due', label: 'Due' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'struggling', label: 'Struggling' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'learned', label: 'Learned' },
  ];

  private sub: Subscription | null = null;
  private chart: Chart | null = null;

  ngOnInit(): void {
    this.sub = this.careerService.getCareerData().subscribe({
      next: (d) => {
        this.data = d;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.chart?.destroy();
  }

  // ── Chart.js ViewChild (setter pattern for *ngIf), same shape as
  // habits.page.ts / career.page.ts: build lazily outside Angular, destroy
  // on toggle away so the canvas never goes stale. ────────────────────────
  @ViewChild('accuracyChart') set accuracyChartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    if (ref && !this.chart && this.data) {
      this.ngZone.runOutsideAngular(() => this.buildChart(ref.nativeElement));
    }
  }

  setChartView(view: ChartTableView): void {
    if (view === this.chartView) return;
    if (view === 'table') {
      this.chart?.destroy();
      this.chart = null;
    }
    this.chartView = view;
  }

  trackByIndex(index: number): number {
    return index;
  }

  get problems(): DrillProblem[] {
    return this.data?.drills.problems ?? [];
  }

  get patterns(): PatternAgg[] {
    return this.data?.drills.patterns ?? [];
  }

  get currentPositionMd(): string {
    return this.data?.drills.currentPositionMd ?? '';
  }

  get weakSpotsMd(): string {
    return this.data?.drills.weakSpotsMd ?? '';
  }

  get accuracySeries() {
    return this.data?.drills.accuracySeries ?? [];
  }

  // ── KPI mini row ─────────────────────────────────────────────────────
  get learnedCount(): number {
    return this.problems.filter((p) => p.state === 'learned').length;
  }

  get dueTodayCount(): number {
    return this.problems.filter((p) => p.state === 'due').length;
  }

  get overdueCount(): number {
    return this.problems.filter((p) => p.state === 'overdue').length;
  }

  get strugglingCount(): number {
    return this.problems.filter((p) => p.state === 'struggling').length;
  }

  // Prefer the generator's own drillAccuracy kpi; fall back to a
  // patterns-weighted average when it is null (e.g. no sessions yet).
  get guidedAccuracyLabel(): string {
    const fromKpi = this.data?.kpis.drillAccuracy;
    const rate = fromKpi !== null && fromKpi !== undefined ? fromKpi : this.accuracyFromPatterns();
    return this.formatPct(rate);
  }

  private accuracyFromPatterns(): number | null {
    const patterns = this.patterns;
    const totalAttempted = patterns.reduce((sum, p) => sum + p.attempted, 0);
    if (!totalAttempted) return null;
    const weighted = patterns.reduce((sum, p) => sum + (p.decisionRate ?? 0) * p.attempted, 0);
    return weighted / totalAttempted;
  }

  // ── Filters + search ─────────────────────────────────────────────────
  setFilter(f: DrillFilter): void {
    this.activeFilter = f;
  }

  get filteredProblems(): DrillProblem[] {
    let list = this.problems;
    if (this.activeFilter !== 'all') {
      list = list.filter((p) => p.state === this.activeFilter);
    }
    const q = this.search.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const pa = STATE_PRIORITY[a.state] ?? 9;
      const pb = STATE_PRIORITY[b.state] ?? 9;
      return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
    });
  }

  stateBadgeClass(state: string): string {
    switch (state) {
      case 'learned':
        return 'badge--advanced';
      case 'due':
      case 'overdue':
        return 'badge--accent';
      case 'struggling':
        return 'badge--rejected';
      default:
        return 'badge--muted'; // scheduled
    }
  }

  formatPct(fraction: number | null | undefined): string {
    return fraction === null || fraction === undefined ? '—' : `${Math.round(fraction * 100)}%`;
  }

  formatDateOrDash(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDate(new Date(`${dateStr}T12:00:00`), 'MMM d', 'en-US');
  }

  // ── Per topic bars ───────────────────────────────────────────────────
  private get maxAttempted(): number {
    return Math.max(1, ...this.patterns.map((p) => p.attempted));
  }

  topicBarWidthPct(attempted: number): number {
    return (attempted / this.maxAttempted) * 100;
  }

  topicLearnedPct(p: PatternAgg): number {
    if (!p.attempted) return 0;
    return (p.learned / p.attempted) * 100;
  }

  // ── Cumulative learned sparkline (companion to the chart; never a
  // second Chart.js axis) ─────────────────────────────────────────────
  get latestCumulativeLearned(): number {
    const series = this.accuracySeries;
    return series.length ? series[series.length - 1].cumulativeLearned : 0;
  }

  get cumulativeSparklinePoints(): string {
    const values = this.accuracySeries.map((s) => s.cumulativeLearned);
    return this.buildSparkline(values, 0, Math.max(1, ...values));
  }

  // Shared inline-SVG sparkline builder (viewBox 0 0 120 32), same
  // convention as career.page.ts / habits.page.html.
  private buildSparkline(values: number[], min: number, max: number): string {
    if (!values.length) return '';
    const range = max - min || 1;
    const w = values.length > 1 ? 120 / (values.length - 1) : 0;
    return values
      .map((v, i) => {
        const x = values.length > 1 ? i * w : 60;
        const clamped = Math.max(min, Math.min(max, v));
        const y = 32 - ((clamped - min) / range) * 32;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  private formatDateLabel(dateStr: string): string {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private buildChart(canvas: HTMLCanvasElement): void {
    const series = this.accuracySeries;
    const labels = series.map((s) => this.formatDateLabel(s.date));
    const rates = series.map((s) => (s.rate === null ? null : Math.round(s.rate * 100)));

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Guided decision rate',
            data: rates,
            borderColor: CAREER_COLORS.accent,
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.25,
            spanGaps: true,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 }, callback: (value) => `${value}%` },
          },
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.4)',
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y}% guided decisions`,
            },
          },
        },
      },
    });
  }
}
