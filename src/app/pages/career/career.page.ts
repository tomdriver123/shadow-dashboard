import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { CareerService } from '../../services/career.service';
import { careerScopeFromRoute } from '../../services/career-scope';
import { PortalService } from '../../services/portal.service';
import {
  AccuracyPoint,
  CareerData,
  KNOWN_BANDS,
  KNOWN_EMPLOYMENT_TYPES,
  KNOWN_LOCATIONS,
  LinkedinViewPoint,
  NeedsYouKind,
  PipelineOpportunity,
  ScheduleEvent,
} from '../../services/career.model';

Chart.register(...registerables);

// ── Palette (career-ui-brief.md; validated against the dark surface, do not
// substitute). Accent never appears as a chart series. ──────────────────────
const CAREER_COLORS = {
  accent: '#f59e0b',
  awaiting: '#3b82f6',
  advanced: '#059669',
  rejected: '#ef4444',
  muted: 'rgba(255, 255, 255, 0.28)',
};
const CAREER_RAMP = ['#fbbf24', '#f59e0b', '#d97706', '#b45309'];

type ChartTableView = 'chart' | 'table';

interface WeeklyRow {
  weekStart: string;
  awaiting: number;
  advanced: number;
  rejected: number;
  submitted: number;
}

interface FunnelRow {
  stage: string;
  count: number;
  widthPct: number;
  color: string;
  conversionPct: number | null;
}

interface MixSegment {
  key: string;
  count: number;
  pct: number;
  color: string;
}

interface MixDimension {
  title: string;
  segments: MixSegment[];
}

@Component({
  selector: 'app-career',
  templateUrl: './career.page.html',
  styleUrls: ['./career.page.scss'],
  standalone: false,
})
export class CareerPage implements OnInit, OnDestroy {
  private careerService = inject(CareerService);
  private ngZone = inject(NgZone);

  readonly scope = careerScopeFromRoute(inject(ActivatedRoute));
  readonly portal = inject(PortalService);

  data: CareerData | null = null;
  loading = true;
  error = false;

  weeklyView: ChartTableView = 'chart';
  funnelView: ChartTableView = 'chart';

  private sub: Subscription | null = null;
  private weeklyChart: Chart | null = null;

  ngOnInit(): void {
    this.sub = this.careerService.getCareerData(this.scope).subscribe({
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
    this.weeklyChart?.destroy();
  }

  // ── Chart.js ViewChild (setter pattern for *ngIf), same shape as
  // habits.page.ts: build lazily outside Angular, destroy on toggle away. ──
  @ViewChild('weeklyChart') set weeklyChartRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    if (ref && !this.weeklyChart && this.data) {
      this.ngZone.runOutsideAngular(() => this.buildWeeklyChart(ref.nativeElement));
    }
  }

  setWeeklyView(view: ChartTableView): void {
    if (view === this.weeklyView) return;
    if (view === 'table') {
      this.weeklyChart?.destroy();
      this.weeklyChart = null;
    }
    this.weeklyView = view;
  }

  setFunnelView(view: ChartTableView): void {
    this.funnelView = view;
  }

  trackByIndex(index: number): number {
    return index;
  }

  get generatedAt(): string {
    if (!this.data?.generatedAt) return '';
    return new Date(this.data.generatedAt).toLocaleString();
  }

  // ── Needs you ─────────────────────────────────────────────────────────
  needsYouIcon(kind: NeedsYouKind): string {
    switch (kind) {
      case 'pipeline':
        return 'briefcase-outline';
      case 'comms':
        return 'mail-outline';
      case 'drills':
        return 'school-outline';
      case 'queue':
        return 'layers-outline';
      default:
        return 'alert-circle-outline';
    }
  }

  // ── Next up ───────────────────────────────────────────────────────────
  get upcomingPreview(): ScheduleEvent[] {
    return this.data?.schedule.upcoming.slice(0, 3) ?? [];
  }

  get pipelineWaitingOnThem(): PipelineOpportunity[] {
    return (this.data?.pipeline ?? []).filter((p) => p.ball === 'them').slice(0, 3);
  }

  get nextUpcomingDate(): string | null {
    return this.data?.schedule.upcoming[0]?.date ?? null;
  }

  // ── KPI helpers ───────────────────────────────────────────────────────
  get responseRatePct(): string {
    const r = this.data?.kpis.responseRate;
    return r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`;
  }

  get drillAccuracyPct(): string {
    const a = this.data?.kpis.drillAccuracy;
    return a === null || a === undefined ? '—' : `${Math.round(a * 100)}%`;
  }

  get kbAccuracyPct(): string {
    const a = this.data?.kb?.accuracy;
    return a === null || a === undefined ? '—' : `${Math.round(a * 100)}%`;
  }

  // Not exposed on CareerKpis or DrillsData; derived here from problem
  // state so the drill snapshot can show learned/due/overdue as three
  // distinct, mutually exclusive counts.
  get drillsOverdueCount(): number {
    return (this.data?.drills.problems ?? []).filter((p) => p.state === 'overdue').length;
  }

  get drillSparklinePoints(): string {
    const series = (this.data?.drills.accuracySeries ?? []).filter(
      (p): p is AccuracyPoint & { rate: number } => p.rate !== null,
    );
    return this.buildSparkline(series.map((p) => p.rate), 0, 1);
  }

  // ── Weekly chart ──────────────────────────────────────────────────────
  get weeklyRows(): WeeklyRow[] {
    const weekly = this.data?.metrics.weekly ?? [];
    return weekly.map((w) => ({
      weekStart: w.weekStart,
      advanced: w.advanced,
      rejected: w.rejected,
      submitted: w.submitted,
      // WeeklyMetric has no explicit "awaiting" bucket; derive it.
      awaiting: Math.max(0, w.submitted - w.advanced - w.rejected),
    }));
  }

  private buildWeeklyChart(canvas: HTMLCanvasElement): void {
    const rows = this.weeklyRows;
    const labels = rows.map((r) => this.formatWeekLabel(r.weekStart));

    this.weeklyChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Awaiting',
            data: rows.map((r) => r.awaiting),
            backgroundColor: CAREER_COLORS.awaiting,
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.7,
            stack: 'weekly',
          },
          {
            label: 'Advanced',
            data: rows.map((r) => r.advanced),
            backgroundColor: CAREER_COLORS.advanced,
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.7,
            stack: 'weekly',
          },
          {
            label: 'Rejected',
            data: rows.map((r) => r.rejected),
            backgroundColor: CAREER_COLORS.rejected,
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.7,
            stack: 'weekly',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: 'rgba(255, 255, 255, 0.4)', font: { size: 10 } },
          },
        },
        plugins: {
          legend: {
            display: true,
            labels: { color: 'rgba(255, 255, 255, 0.7)' },
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                return idx === undefined ? '' : `Week of ${labels[idx]}`;
              },
            },
          },
        },
      },
    });
  }

  private formatWeekLabel(weekStart: string): string {
    const dt = new Date(weekStart + 'T12:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ── Funnel ────────────────────────────────────────────────────────────
  get funnelRows(): FunnelRow[] {
    const funnel = this.data?.metrics.funnel ?? [];
    const first = funnel[0]?.count ?? 0;
    return funnel.map((f, i) => {
      const prevCount = i > 0 ? funnel[i - 1].count : null;
      const conversionPct = i > 0 && prevCount ? Math.round((f.count / prevCount) * 100) : null;
      return {
        stage: f.stage,
        count: f.count,
        widthPct: first > 0 ? Math.min(100, (f.count / first) * 100) : 0,
        color: this.rampColor(i, funnel.length),
        conversionPct,
      };
    });
  }

  private rampColor(index: number, total: number): string {
    if (total <= 1) return CAREER_RAMP[0];
    const pos = Math.round((index / (total - 1)) * (CAREER_RAMP.length - 1));
    return CAREER_RAMP[pos];
  }

  // ── Mix strip ─────────────────────────────────────────────────────────
  // Segments are assigned colors by a fixed key order (the documented
  // KNOWN_* vocabularies from career.model.ts), never by count. Sorting by
  // count would repaint a category's color whenever its rank shifted.
  get mixDimensions(): MixDimension[] {
    const mix = this.data?.metrics.mix;
    if (!mix) return [];
    return [
      { title: 'Location', segments: this.buildMixSegments(mix.location, KNOWN_LOCATIONS) },
      { title: 'Band', segments: this.buildMixSegments(mix.band, KNOWN_BANDS) },
      { title: 'Employment', segments: this.buildMixSegments(mix.employment, KNOWN_EMPLOYMENT_TYPES) },
    ];
  }

  private buildMixSegments(record: Record<string, number>, knownOrder: string[]): MixSegment[] {
    const present = Object.entries(record).filter(([, count]) => count > 0);
    const total = present.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return [];

    const presentKeys = present.map(([key]) => key);
    const orderedKeys = [
      ...knownOrder.filter((key) => presentKeys.includes(key)),
      ...presentKeys.filter((key) => !knownOrder.includes(key)),
    ];

    const colors = [CAREER_COLORS.awaiting, CAREER_COLORS.advanced, CAREER_COLORS.accent];
    const countOf = (key: string): number => record[key] ?? 0;
    const top = orderedKeys.slice(0, 3);
    const rest = orderedKeys.slice(3);

    const segments: MixSegment[] = top.map((key, i) => ({
      key,
      count: countOf(key),
      pct: (countOf(key) / total) * 100,
      color: colors[i],
    }));

    if (rest.length) {
      const restCount = rest.reduce((sum, key) => sum + countOf(key), 0);
      segments.push({ key: 'other', count: restCount, pct: (restCount / total) * 100, color: CAREER_COLORS.muted });
    }

    return segments;
  }

  // ── LinkedIn views ────────────────────────────────────────────────────
  get latestLinkedinViews(): number | null {
    const points = this.data?.metrics.linkedinViews ?? [];
    for (let i = points.length - 1; i >= 0; i--) {
      const v = points[i].views;
      if (v !== null) return v;
    }
    return null;
  }

  get linkedinSparklinePoints(): string {
    const series = (this.data?.metrics.linkedinViews ?? []).filter(
      (p): p is LinkedinViewPoint & { views: number } => p.views !== null,
    );
    if (!series.length) return '';
    const values = series.map((p) => p.views);
    return this.buildSparkline(values, Math.min(...values), Math.max(...values));
  }

  // Shared inline-SVG sparkline builder (viewBox 0 0 120 32), same idea as
  // the hand rolled line in habits.page.html. `min`/`max` set the vertical
  // scale; equal values (or a single point) fall back to a flat mid line.
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
}
