import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { VerdictResponse } from './jobs.model';

// Sabrina's queue thumbs. Relative URL, same origin via the dev proxy
// (like feedback.service.ts), not the absolute :18790 URL jobs.service.ts
// uses for Tom's voice server route. Write side: dashboard/server/feedback-api.js.
@Injectable({ providedIn: 'root' })
export class CareerVerdictService {
  private http = inject(HttpClient);

  postVerdict(id: string, verdict: 'liked' | 'passed'): Observable<VerdictResponse> {
    return this.http.post<VerdictResponse>('/api/feedback/jobs/verdict', { id, verdict });
  }
}
