import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, TimeoutError, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, tap, timeout } from 'rxjs/operators';
import { FinanceService } from './finance.service';
import { HabitService } from './habit.service';
import { JobsService } from './jobs.service';
import { BrainService } from './brain.service';
import { AgentService } from './agent.service';
import { CareerService } from './career.service';
import { CAREER_SCOPES, CareerPerson } from './career-scope';

export type RefreshTarget = 'finance' | 'habits' | 'career' | 'jobs' | 'brain' | 'agents' | 'all';

export interface RefreshStepResult {
  name: string;
  ok: boolean;
  ms: number;
  optional: boolean;
  tail: string;
}

export interface RefreshTargetState {
  lastRun: string | null;
  ok: boolean;
  durationMs: number;
  error: string | null;
  warnings: string[];
  synced: boolean;
  steps: RefreshStepResult[];
}

export interface RefreshState {
  generatedAt: string | null;
  targets: Record<string, RefreshTargetState>;
}

export interface RefreshDataInfo {
  generatedAt: string | null;
  mtime: string | null;
}

export interface RefreshStatus {
  ok: boolean;
  state: RefreshState;
  running: RefreshTarget[];
  data: Record<string, RefreshDataInfo>;
}

export interface RefreshRunResult {
  ok: boolean;
  target: RefreshTarget;
  targets: Record<string, RefreshTargetState>;
}

export interface RefreshOptions {
  person?: CareerPerson;
}

/**
 * Talks to the local vault API refresh routes (dashboard/server/vault-api.js,
 * which shells out to dashboard/scripts/refresh.js) and fans a completed run
 * out to every page level data service so each one refetches its regenerated
 * JSON. Falls back to the committed assets/data/refresh.json snapshot when
 * the API is unreachable, so the dashboard still shows automation health
 * with the API offline.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  private http = inject(HttpClient);
  private finance = inject(FinanceService);
  private habits = inject(HabitService);
  private jobs = inject(JobsService);
  private brain = inject(BrainService);
  private agents = inject(AgentService);
  private career = inject(CareerService);

  private statusSubject = new BehaviorSubject<RefreshStatus | null>(null);
  private runningSubject = new BehaviorSubject<ReadonlySet<RefreshTarget>>(new Set());
  private availableSubject = new BehaviorSubject<boolean | null>(null);

  readonly status$: Observable<RefreshStatus | null> = this.statusSubject.asObservable();
  readonly running$: Observable<ReadonlySet<RefreshTarget>> = this.runningSubject.asObservable();
  readonly apiAvailable$: Observable<boolean | null> = this.availableSubject.asObservable();

  /**
   * Refetches the refresh status. On any failure (offline, timeout, bad
   * response) this marks the API unavailable and falls back to the
   * committed static snapshot, wrapped into the same shape the live route
   * returns. A failure on the fallback too leaves the last known status in
   * place rather than clearing it.
   */
  loadStatus(): void {
    this.http.get<RefreshStatus>('/api/refresh/status').pipe(
      timeout(4000),
      tap(() => this.setAvailable(true)),
      catchError(() => {
        this.setAvailable(false);
        return this.http.get<RefreshState>('assets/data/refresh.json').pipe(
          map((state): RefreshStatus => ({ ok: true, state, running: [], data: {} })),
          catchError(() => of(null)),
        );
      }),
    ).subscribe((status) => {
      if (status) this.statusSubject.next(status);
    });
  }

  isRunning(target: RefreshTarget): Observable<boolean> {
    return this.running$.pipe(
      map((running) => running.has(target)),
      distinctUntilChanged(),
    );
  }

  targetState(target: RefreshTarget): RefreshTargetState | null {
    return this.statusSubject.value?.state.targets[target] ?? null;
  }

  /**
   * Kicks off a run for one target, waits for the orchestrator's result,
   * then fans the update out to the data services that depend on it and
   * refetches status so every other button's freshness stays current.
   * Errors propagate to the caller; a transport level failure (status 0)
   * or a timeout also marks the API unavailable.
   */
  refresh(target: RefreshTarget, opts?: RefreshOptions): Observable<RefreshRunResult> {
    this.markRunning(target, true);
    const person = opts?.person;
    const url = `/api/refresh/${target}${person ? `?person=${person}` : ''}`;
    return this.http.post<RefreshRunResult>(url, {}).pipe(
      timeout(185000),
      tap(() => {
        this.setAvailable(true);
        this.fanOut(target, person);
        this.loadStatus();
      }),
      catchError((err) => {
        if (err instanceof TimeoutError || (err instanceof HttpErrorResponse && err.status === 0)) {
          this.setAvailable(false);
        }
        return throwError(() => err);
      }),
      finalize(() => this.markRunning(target, false)),
    );
  }

  private fanOut(target: RefreshTarget, person?: CareerPerson): void {
    const hits = (t: Exclude<RefreshTarget, 'all'>) => target === 'all' || target === t;

    if (hits('finance')) this.finance.refresh();
    if (hits('habits')) this.habits.refresh();
    if (hits('jobs')) this.jobs.refresh();
    if (hits('brain')) this.brain.refresh();
    if (hits('agents')) this.agents.refresh();
    if (hits('career')) {
      if (person) {
        this.career.refresh(CAREER_SCOPES[person]);
      } else {
        this.career.refresh(CAREER_SCOPES.tom);
        this.career.refresh(CAREER_SCOPES.sabrina);
      }
    }
  }

  private markRunning(target: RefreshTarget, running: boolean): void {
    const next = new Set(this.runningSubject.value);
    if (running) next.add(target);
    else next.delete(target);
    this.runningSubject.next(next);
  }

  private setAvailable(value: boolean): void {
    if (this.availableSubject.value !== value) this.availableSubject.next(value);
  }
}
