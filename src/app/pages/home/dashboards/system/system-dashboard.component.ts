import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { RefreshService, RefreshStatus, RefreshTarget, RefreshTargetState } from '../../../../services/refresh.service';

type CadenceTarget = Exclude<RefreshTarget, 'all'>;

// Hours between expected runs, per target's launchd cadence, used to flag a
// row stale even when its last run technically succeeded.
const CADENCE_HOURS: Record<CadenceTarget, number> = {
  finance: 9,
  habits: 4,
  jobs: 26,
  career: 26,
  brain: 26,
  agents: 26,
};

const ROW_ORDER: CadenceTarget[] = ['finance', 'habits', 'career', 'jobs', 'brain', 'agents'];

const ROW_LABELS: Record<CadenceTarget, string> = {
  finance: 'Finance',
  habits: 'Habits',
  career: 'Career',
  jobs: 'Job hunt',
  brain: 'Brain',
  agents: 'Agents',
};

export interface SystemRow {
  target: RefreshTarget;
  label: string;
  lastRun: string | null;
  ok: boolean | null;
  stale: boolean;
  relative: string;
  detail: string;
}

const TICK_MS = 60000;

/**
 * Automation health tile: one row per data generator, its last run, whether
 * it succeeded, and whether it is overdue against its own launchd cadence.
 * Reads services/refresh.service.ts, which already falls back to the
 * committed assets/data/refresh.json snapshot when the local API is down.
 */
@Component({
  selector: 'app-system-dashboard',
  templateUrl: './system-dashboard.component.html',
  styleUrls: ['./system-dashboard.component.scss'],
  standalone: false,
})
export class SystemDashboardComponent implements OnInit, OnDestroy {
  rows: SystemRow[] = [];
  apiAvailable: boolean | null = null;

  private refresh = inject(RefreshService);
  private destroy$ = new Subject<void>();
  private latestStatus: RefreshStatus | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.refresh.loadStatus();

    this.refresh.status$.pipe(takeUntil(this.destroy$)).subscribe((status) => {
      this.latestStatus = status;
      this.rebuildRows();
    });

    this.refresh.apiAvailable$.pipe(takeUntil(this.destroy$)).subscribe((available) => {
      this.apiAvailable = available;
    });

    this.intervalId = setInterval(() => this.rebuildRows(), TICK_MS);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.destroy$.next();
    this.destroy$.complete();
  }

  badgeColor(row: SystemRow): string {
    if (row.ok === false) return 'danger';
    if (row.stale) return 'warning';
    return 'success';
  }

  badgeText(row: SystemRow): string {
    if (row.ok === false) return 'failed';
    if (row.stale) return 'stale';
    return 'ok';
  }

  private rebuildRows(): void {
    const status = this.latestStatus;
    this.rows = ROW_ORDER.map((target) => {
      const state: RefreshTargetState | null = status?.state?.targets?.[target] ?? null;
      const info = status?.data?.[target] ?? null;
      const lastRun = state?.lastRun ?? info?.generatedAt ?? info?.mtime ?? null;
      const ok = state?.ok ?? null;
      const stale = this.isStale(lastRun, CADENCE_HOURS[target]);
      const detail = ok === false
        ? (state?.error ?? '')
        : (state?.warnings?.length ? state.warnings.join('; ') : '');

      return {
        target,
        label: ROW_LABELS[target],
        lastRun,
        ok,
        stale,
        relative: this.formatRelative(lastRun),
        detail,
      };
    });
  }

  private isStale(lastRun: string | null, cadenceHours: number): boolean {
    if (!lastRun) return true;
    const then = new Date(lastRun).getTime();
    if (Number.isNaN(then)) return true;
    const ageHours = (Date.now() - then) / (1000 * 60 * 60);
    return ageHours > cadenceHours;
  }

  private formatRelative(iso: string | null): string {
    if (!iso) return 'never';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return 'never';
    const diffSec = Math.floor((Date.now() - then) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} h ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
