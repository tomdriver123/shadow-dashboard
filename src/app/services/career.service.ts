import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { CareerApplication, CareerData, DrillProblem, PipelineOpportunity } from './career.model';

/**
 * Career tab data. Reads the generator output (assets/data/career.json).
 * Source of truth is vault markdown; regenerate with
 *   node dashboard/scripts/generate-career-data.js
 * then call refresh() to refetch.
 */
@Injectable({ providedIn: 'root' })
export class CareerService {
  private http = inject(HttpClient);
  private refresh$ = new BehaviorSubject<void>(undefined);

  private data$: Observable<CareerData> = this.refresh$.pipe(
    switchMap(() => this.http.get<CareerData>('assets/data/career.json')),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getCareerData(): Observable<CareerData> {
    return this.data$;
  }

  refresh(): void {
    this.refresh$.next();
  }

  getApplication(id: string): Observable<CareerApplication | undefined> {
    return this.data$.pipe(map((d) => d.applications.find((a) => a.id === id)));
  }

  getOpportunity(id: string): Observable<PipelineOpportunity | undefined> {
    return this.data$.pipe(map((d) => d.pipeline.find((p) => p.id === id)));
  }

  getDrillProblem(id: string): Observable<DrillProblem | undefined> {
    return this.data$.pipe(map((d) => d.drills.problems.find((p) => p.id === id)));
  }
}
