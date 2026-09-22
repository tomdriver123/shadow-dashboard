import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { CareerService } from '../../../services/career.service';
import { careerScopeFromRoute } from '../../../services/career-scope';
import {
  CareerData,
  KbAttempt,
  KbLevelStat,
  KbQuestion,
  KbRecallItem,
  KbTopicState,
} from '../../../services/career.model';

type KbFilter = 'all' | 'due' | 'overdue' | 'missed' | 'passed' | 'learned';
type KbLevelFilter = 'all' | 'fundamentals' | 'medium' | 'senior';
type KbLevel = 'fundamentals' | 'medium' | 'senior';

interface FilterOption<T extends string> {
  value: T;
  label: string;
}

// Fixed order everywhere accuracy-by-level is shown; never alphabetical or
// data driven, so the ramp reads left to right.
const KB_LEVELS: KbLevel[] = ['fundamentals', 'medium', 'senior'];

/**
 * Knowledge base list: KPI snapshot, accuracy-by-level meters, filterable
 * question table, and the current position / weak spots notes from the
 * quiz log. Data source: CareerService (assets/data/career.json), the
 * `kb` block built by parseKbBank + buildKb in generate-career-data.js.
 * Route is shared with Sabrina's scope (kb: null there), so this page
 * renders an empty state when data.kb is null rather than assuming Tom.
 */
@Component({
  selector: 'app-career-kb',
  templateUrl: './kb.page.html',
  styleUrls: ['./kb.page.scss'],
  standalone: false,
})
export class KbPage implements OnInit, OnDestroy {
  private readonly careerService = inject(CareerService);

  readonly scope = careerScopeFromRoute(inject(ActivatedRoute));
  readonly levels = KB_LEVELS;

  data: CareerData | null = null;
  loading = true;
  error = false;

  activeFilter: KbFilter = 'all';
  activeLevel: KbLevelFilter = 'all';
  search = '';
  positionExpanded = false;
  weakSpotsExpanded = false;

  readonly filters: FilterOption<KbFilter>[] = [
    { value: 'all', label: 'All' },
    { value: 'due', label: 'Due' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'missed', label: 'Missed' },
    { value: 'passed', label: 'Passed' },
    { value: 'learned', label: 'Learned' },
  ];

  readonly levelFilters: FilterOption<KbLevelFilter>[] = [
    { value: 'all', label: 'Any level' },
    { value: 'fundamentals', label: 'Fundamentals' },
    { value: 'medium', label: 'Medium' },
    { value: 'senior', label: 'Senior' },
  ];

  private sub: Subscription | null = null;

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
  }

  trackByIndex(index: number): number {
    return index;
  }

  // ── Data accessors ───────────────────────────────────────────────────
  get items(): KbQuestion[] {
    return this.data?.kb?.items ?? [];
  }

  get topicStates(): KbTopicState[] {
    return this.data?.kb?.topicStates ?? [];
  }

  get recallDue(): KbRecallItem[] {
    return this.data?.kb?.recallDue ?? [];
  }

  get currentPositionMd(): string {
    return this.data?.kb?.currentPositionMd ?? '';
  }

  get weakSpotsMd(): string {
    return this.data?.kb?.weakSpotsMd ?? '';
  }

  get accuracyPct(): string {
    return this.formatPct(this.data?.kb?.accuracy ?? null);
  }

  // ── Dates (string comparisons only, never Date objects) ───────────────
  private get todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  isOverdue(status: string, due: string | null): boolean {
    return status === 'due' && !!due && due < this.todayIso;
  }

  get recallOverdueCount(): number {
    return this.recallDue.filter((r) => !!r.due && r.due < this.todayIso).length;
  }

  formatDateOrDash(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDate(new Date(`${dateStr}T12:00:00`), 'MMM d', 'en-US');
  }

  // ── Topic promotion tiles ──────────────────────────────────────────────
  nextLevel(level: string): string {
    return level === 'fundamentals' ? 'medium' : 'senior';
  }

  topicPromoteLabel(t: KbTopicState): string {
    if (t.toPromote === null) return 'top level';
    return `${t.toPromote} pass${t.toPromote === 1 ? '' : 'es'} to ${this.nextLevel(t.level)}`;
  }

  // ── Accuracy by level (stat tile form, single accent hue, no chart) ────
  levelStat(level: KbLevel): KbLevelStat {
    return this.data?.kb?.byLevel?.[level] ?? { asked: 0, passed: 0 };
  }

  levelPct(level: KbLevel): number | null {
    const s = this.levelStat(level);
    return s.asked === 0 ? null : s.passed / s.asked;
  }

  levelMeterWidth(level: KbLevel): number {
    const pct = this.levelPct(level);
    return pct === null ? 0 : Math.round(pct * 100);
  }

  formatPct(fraction: number | null | undefined): string {
    return fraction === null || fraction === undefined ? '—' : `${Math.round(fraction * 100)}%`;
  }

  // ── Latest mcq attempt (ties broken by array order, last wins) ─────────
  private latestMcqAttempt(q: KbQuestion): KbAttempt | null {
    let latest: KbAttempt | null = null;
    for (const a of q.attempts) {
      if (a.mode !== 'mcq') continue;
      if (!latest || a.date >= latest.date) latest = a;
    }
    return latest;
  }

  latestResult(q: KbQuestion): string | null {
    return this.latestMcqAttempt(q)?.result ?? null;
  }

  latestResultOrDash(q: KbQuestion): string {
    return this.latestResult(q) ?? '—';
  }

  // ── Filters + search ────────────────────────────────────────────────────
  setFilter(f: KbFilter): void {
    this.activeFilter = f;
  }

  setLevelFilter(l: KbLevelFilter): void {
    this.activeLevel = l;
  }

  private matchesFilter(q: KbQuestion): boolean {
    switch (this.activeFilter) {
      case 'due':
        return q.status === 'due';
      case 'overdue':
        return this.isOverdue(q.status, q.due);
      case 'learned':
        return q.status === 'learned';
      case 'missed': {
        const r = this.latestResult(q);
        return r === 'miss' || r === 'guess';
      }
      case 'passed':
        return this.latestResult(q) === 'pass';
      default:
        return true;
    }
  }

  get filteredItems(): KbQuestion[] {
    let list = this.items;
    if (this.activeLevel !== 'all') {
      list = list.filter((q) => q.level === this.activeLevel);
    }
    list = list.filter((q) => this.matchesFilter(q));
    const q = this.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q) ||
          item.key.toLowerCase().includes(q),
      );
    }
    return list;
  }

  // ── Badges ───────────────────────────────────────────────────────────────
  statusBadgeClass(status: string): string {
    switch (status) {
      case 'learned':
        return 'badge--advanced';
      case 'due':
        return 'badge--accent';
      case 'retired':
        return 'badge--muted';
      default:
        return 'badge--muted'; // asked
    }
  }

  statusLabel(q: KbQuestion): string {
    return this.isOverdue(q.status, q.due) ? 'overdue' : q.status;
  }
}
