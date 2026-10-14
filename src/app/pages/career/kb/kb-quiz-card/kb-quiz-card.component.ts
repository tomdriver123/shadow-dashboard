import { Component, DestroyRef, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CareerScope } from '../../../../services/career-scope';
import { KbData, KbQuestion } from '../../../../services/career.model';
import { QuizAnswer, QuizCardService } from '../../../../services/quiz-card.service';

/**
 * Always visible knowledge check card: one MCQ from kb.queue at a time,
 * graded entirely from data already in the career.json payload (the
 * correct answer ships with each question), so there is no server or LLM
 * round trip on the grading path. See QuizCardService for the localStorage
 * contract. Sabrina's scope has features.kb false and kb: null, so this
 * component renders the empty state and nothing else there.
 */
@Component({
  selector: 'app-kb-quiz-card',
  templateUrl: './kb-quiz-card.component.html',
  styleUrls: ['./kb-quiz-card.component.scss'],
  standalone: false,
})
export class KbQuizCardComponent implements OnChanges {
  private readonly quizCardService = inject(QuizCardService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() scope!: CareerScope;
  @Input() kb: KbData | null = null;

  queue: KbQuestion[] = [];
  current: KbQuestion | null = null;
  answer: QuizAnswer | null = null;

  constructor() {
    toObservable(this.quizCardService.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.queue = this.quizCardService.queueFor(this.kb);
        if (this.current && !this.answer) {
          const done = this.quizCardService.answerOf(this.current.id);
          if (done) this.answer = done;
        }
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kb']) {
      this.queue = this.quizCardService.queueFor(this.kb);
      this.setCurrent(this.queue[0] ?? null);
    }
  }

  private setCurrent(q: KbQuestion | null): void {
    this.current = q;
    this.answer = q ? this.quizCardService.answerOf(q.id) : null;
  }

  pick(letter: string): void {
    if (!this.current || this.answer) return;
    this.answer = this.quizCardService.record(this.current, letter);
  }

  next(): void {
    if (!this.current) return;
    const idx = this.queue.findIndex((q) => q.id === this.current!.id);
    const rest = this.queue.slice(idx + 1).filter((q) => !this.quizCardService.answerOf(q.id));
    this.setCurrent(rest[0] ?? null);
  }

  isCorrect(letter: string): boolean {
    return !!this.current && letter === this.current.answer;
  }

  isPicked(letter: string): boolean {
    return !!this.answer && letter === this.answer.pick;
  }
}
