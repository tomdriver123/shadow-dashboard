import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { formatDate } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CareerService } from '../../../services/career.service';
import { careerScopeFromRoute } from '../../../services/career-scope';
import { KbAttempt, KbQuestion } from '../../../services/career.model';

// versions is suppressed in the header when it holds a level word rather
// than a real version range (ng-007..ng-010 today carry `versions:
// fundamentals`, see vault/skills/quiz/SKILL.md).
const KB_LEVEL_WORDS = new Set(['fundamentals', 'medium', 'senior']);

/**
 * Knowledge base question detail: stem, plain options, and a reveal that
 * marks the correct answer plus Tom's latest pick, why / rubric / model
 * answer, and the attempt history. Data source:
 * CareerService.getKbQuestion(id), cross referenced against
 * getCareerData for the null-kb guard (Sabrina's scope can reach this
 * route with kb: null).
 */
@Component({
  selector: 'app-career-kb-detail',
  templateUrl: './kb-detail.page.html',
  styleUrls: ['./kb-detail.page.scss'],
  standalone: false,
})
export class KbDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly careerService = inject(CareerService);

  readonly scope = careerScopeFromRoute(inject(ActivatedRoute));

  loading = true;
  error = false;
  question: KbQuestion | null = null;
  revealed = false;

  private sub: Subscription | null = null;

  ngOnInit(): void {
    // Subscribe to paramMap (not snapshot): Ionic reuses the cached page
    // instance when navigating back to a visited question URL, so the
    // reveal must reset on every id change, not just on first load.
    this.sub = this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.revealed = false;
          this.loading = true;
          const id = params.get('id') ?? '';
          return combineLatest([
            this.careerService.getKbQuestion(this.scope, id),
            this.careerService.getCareerData(this.scope),
          ]);
        }),
      )
      .subscribe({
        next: ([question, data]) => {
          this.question = data.kb ? question ?? null : null;
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

  toggleReveal(): void {
    this.revealed = !this.revealed;
  }

  get showVersions(): boolean {
    const v = this.question?.versions;
    if (v === null || v === undefined || v === '') return false;
    return !KB_LEVEL_WORDS.has(v);
  }

  private latestMcqAttempt(q: KbQuestion): KbAttempt | null {
    let latest: KbAttempt | null = null;
    for (const a of q.attempts) {
      if (a.mode !== 'mcq') continue;
      if (!latest || a.date >= latest.date) latest = a;
    }
    return latest;
  }

  private get latestPick(): string | null {
    return this.question ? this.latestMcqAttempt(this.question)?.pick ?? null : null;
  }

  isCorrect(letter: string): boolean {
    return !!this.question && letter === this.question.answer;
  }

  isPicked(letter: string): boolean {
    return !!this.latestPick && letter === this.latestPick;
  }

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

  private get todayIso(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get isOverdue(): boolean {
    if (!this.question) return false;
    return this.question.status === 'due' && !!this.question.due && this.question.due < this.todayIso;
  }

  get statusLabel(): string {
    if (!this.question) return '';
    return this.isOverdue ? 'overdue' : this.question.status;
  }

  formatDateOrDash(dateStr: string | null): string {
    if (!dateStr) return '—';
    return formatDate(new Date(`${dateStr}T12:00:00`), 'MMM d', 'en-US');
  }

  get sortedAttempts(): KbAttempt[] {
    if (!this.question) return [];
    return [...this.question.attempts].sort((a, b) => b.date.localeCompare(a.date));
  }
}
