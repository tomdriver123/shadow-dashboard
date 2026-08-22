import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, switchMap } from 'rxjs';
import { JobsData, VerdictResponse } from './jobs.model';

const API_PORT = 18790;

@Injectable({
  providedIn: 'root',
})
export class JobsService {
  private refresh$ = new BehaviorSubject<void>(undefined);

  constructor(private http: HttpClient) {}

  getJobsData(): Observable<JobsData> {
    return this.refresh$.pipe(
      switchMap(() => this.http.get<JobsData>('assets/data/jobs.json'))
    );
  }

  refresh(): void {
    this.refresh$.next();
  }

  postVerdict(id: string, verdict: 'liked' | 'passed'): Observable<VerdictResponse> {
    // Local dev: http://localhost:18790 (uvicorn on 127.0.0.1).
    // Phone: https://{mac}.ts.net:18790 — a `tailscale serve` proxy fronting
    // the same localhost server; https origin requires the https scheme here.
    const host = window.location.hostname || 'localhost';
    const scheme = window.location.protocol === 'https:' ? 'https' : 'http';
    return this.http.post<VerdictResponse>(
      `${scheme}://${host}:${API_PORT}/api/jobs/verdict`,
      { id, verdict }
    );
  }
}
