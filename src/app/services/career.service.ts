import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';
import { CareerApplication, CareerData, DrillProblem, PipelineOpportunity } from './career.model';
import { CareerScope } from './career-scope';

/**
 * Career tab data. Reads the generator output for the given scope
 * (assets/data/career.json for Tom, assets/data/career-sabrina.json for
 * Sabrina). Source of truth is vault markdown; regenerate with
 *   node dashboard/scripts/generate-career-data.js
 * then call refresh(scope) to refetch. One stream per scope's dataUrl,
 * created lazily and cached in a Map so each portal gets its own
 * independent refresh cycle.
 */
@Injectable({ providedIn: 'root' })
export class CareerService {
  private http = inject(HttpClient);

  private streams = new Map<string, { refresh$: BehaviorSubject<void>; data$: Observable<CareerData> }>();

  private streamFor(scope: CareerScope): { refresh$: BehaviorSubject<void>; data$: Observable<CareerData> } {
    let stream = this.streams.get(scope.dataUrl);
    if (!stream) {
      const refresh$ = new BehaviorSubject<void>(undefined);
      const data$ = refresh$.pipe(
        switchMap(() => this.http.get<CareerData>(scope.dataUrl)),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
      stream = { refresh$, data$ };
      this.streams.set(scope.dataUrl, stream);
    }
    return stream;
  }

  getCareerData(scope: CareerScope): Observable<CareerData> {
    return this.streamFor(scope).data$;
  }

  refresh(scope: CareerScope): void {
    this.streamFor(scope).refresh$.next();
  }

  getApplication(scope: CareerScope, id: string): Observable<CareerApplication | undefined> {
    return this.getCareerData(scope).pipe(map((d) => d.applications.find((a) => a.id === id)));
  }

  getOpportunity(scope: CareerScope, id: string): Observable<PipelineOpportunity | undefined> {
    return this.getCareerData(scope).pipe(map((d) => d.pipeline.find((p) => p.id === id)));
  }

  getDrillProblem(scope: CareerScope, id: string): Observable<DrillProblem | undefined> {
    return this.getCareerData(scope).pipe(map((d) => d.drills.problems.find((p) => p.id === id)));
  }
}
