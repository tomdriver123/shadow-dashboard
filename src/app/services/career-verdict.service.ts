import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AlertController } from '@ionic/angular';
import { Observable, firstValueFrom } from 'rxjs';
import { VerdictResponse } from './jobs.model';
import { JobsService } from './jobs.service';
import { FeedbackService } from './feedback.service';
import { CareerService } from './career.service';
import { CareerScope } from './career-scope';
import { CareerQueueRow } from './career.model';

export type Verdict = 'liked' | 'passed';
export type VoteOutcome = 'ok' | 'aborted' | 'failed';

// The queue thumbs gesture, shared by the career overview preview and the
// applications Queue sub tab. Sabrina's verdicts post to the zero dependency
// feedback API (relative URL, same origin via the dev proxy, like
// feedback.service.ts); Tom's keep going to the voice server through
// JobsService. Write side for hers: dashboard/server/feedback-api.js.
@Injectable({ providedIn: 'root' })
export class CareerVerdictService {
  private http = inject(HttpClient);
  private jobs = inject(JobsService);
  private feedback = inject(FeedbackService);
  private career = inject(CareerService);
  private alerts = inject(AlertController);

  postVerdict(id: string, verdict: Verdict): Observable<VerdictResponse> {
    return this.http.post<VerdictResponse>('/api/feedback/jobs/verdict', { id, verdict });
  }

  /**
   * Full gesture: optional why note on a pass (when the scope enables it),
   * post to the person's write path, log the note as a feedback entry, then
   * refresh the scope's career data so every page refetches the regenerated
   * JSON. `onPosting` fires after the note dialog and before the request so
   * callers can show a spinner without racing the alert.
   */
  async vote(scope: CareerScope, row: CareerQueueRow, verdict: Verdict, onPosting?: () => void): Promise<VoteOutcome> {
    let note = '';
    if (verdict === 'passed' && scope.features.queueVerdictNote) {
      const answer = await this.askWhy(row);
      if (answer === null) return 'aborted';
      note = answer;
    }

    onPosting?.();
    const request$ = scope.person === 'sabrina'
      ? this.postVerdict(row.id, verdict)
      : this.jobs.postVerdict(row.id, verdict);

    let res: VerdictResponse;
    try {
      res = await firstValueFrom(request$);
    } catch {
      return 'failed';
    }
    if (!res.ok) return 'failed';

    row.status = verdict;
    this.career.refresh(scope);
    if (note) {
      void this.feedback.submit(
        scope.person,
        `[queue verdict ${row.id}] Passed on ${row.company} ${row.role}: ${note}`,
        [],
      );
    }
    return 'ok';
  }

  // Optional one line why note on a pass. Decided from the dismissal role,
  // not button handlers: Ionic runs the cancel role handler on a backdrop or
  // Escape dismiss too, which would turn an abort into a silent pass. Skip
  // resolves '', Save resolves the trimmed text, anything else resolves null.
  private async askWhy(row: CareerQueueRow): Promise<string | null> {
    const alert = await this.alerts.create({
      header: `Passed on ${row.company}`,
      message: 'Want to say why? Optional.',
      inputs: [{ name: 'why', type: 'textarea', placeholder: 'Optional note' }],
      buttons: [
        { text: 'Skip', role: 'cancel' },
        { text: 'Save', role: 'save' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values?: { why?: string } }>();
    if (role === 'save') return (data?.values?.why ?? '').trim();
    if (role === 'cancel') return '';
    return null; // backdrop, Escape, hardware back
  }
}
