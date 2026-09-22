import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { KbData, KbQuestion } from './career.model';

const ANSWERED_KEY = 'shadow.quiz.answered.v1';
const PENDING_KEY = 'shadow.quiz.pending.v1';
const MAX_PENDING = 200;

export type QuizResult = 'pass' | 'miss';

export interface QuizAnswer {
  pick: string;
  result: QuizResult;
  answered: string;
}

interface QuizPendingEntry {
  questionId: string;
  topic: string;
  pick: string;
  answer: string;
  result: QuizResult;
  answered: string;
}

type AnsweredMap = Record<string, QuizAnswer>;

// Always visible knowledge check card, gradable entirely client side: the
// correct answer already ships in career.json, so there is no server round
// trip on the grading path. localStorage is the source of truth for what
// Tom has already answered (a stale career.json queue therefore cannot
// resurrect a question he already passed or missed); the pending outbox is
// a best effort mirror to /api/quiz/attempt in the spirit of
// FeedbackService's offline outbox, much simpler since there is nothing to
// merge back in.
@Injectable({ providedIn: 'root' })
export class QuizCardService {
  private http = inject(HttpClient);

  private answered: AnsweredMap = this.readAnswered();
  private pending: QuizPendingEntry[] = this.readPending();
  private flushing = false;

  constructor() {
    void this.flush();
    window.addEventListener('online', () => void this.flush());
  }

  /** kb.queue mapped through kb.items, misses and already answered ids dropped, queue order preserved. */
  queueFor(kb: KbData | null): KbQuestion[] {
    if (!kb) return [];
    const byId = new Map(kb.items.map((q) => [q.id, q]));
    const out: KbQuestion[] = [];
    for (const id of kb.queue) {
      if (this.answered[id]) continue;
      const q = byId.get(id);
      if (q) out.push(q);
    }
    return out;
  }

  answerOf(id: string): QuizAnswer | null {
    return this.answered[id] ?? null;
  }

  record(q: KbQuestion, pick: string): QuizAnswer {
    const result: QuizResult = pick === q.answer ? 'pass' : 'miss';
    const answer: QuizAnswer = { pick, result, answered: this.localIsoString() };

    this.answered = { ...this.answered, [q.id]: answer };
    this.writeAnswered(this.answered);

    this.pending.push({
      questionId: q.id,
      topic: q.topic,
      pick,
      answer: q.answer,
      result,
      answered: answer.answered,
    });
    if (this.pending.length > MAX_PENDING) {
      this.pending = this.pending.slice(this.pending.length - MAX_PENDING);
    }
    this.writePending(this.pending);

    void this.flush();
    return answer;
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending[0];
        try {
          await firstValueFrom(this.http.post('/api/quiz/attempt', next));
        } catch {
          break;
        }
        this.pending = this.pending.slice(1);
        this.writePending(this.pending);
      }
    } finally {
      this.flushing = false;
    }
  }

  private readAnswered(): AnsweredMap {
    try {
      const raw = localStorage.getItem(ANSWERED_KEY);
      return raw ? (JSON.parse(raw) as AnsweredMap) : {};
    } catch {
      return {};
    }
  }

  private writeAnswered(map: AnsweredMap): void {
    try {
      localStorage.setItem(ANSWERED_KEY, JSON.stringify(map));
    } catch {
      /* storage unavailable, keep going in memory only */
    }
  }

  private readPending(): QuizPendingEntry[] {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as QuizPendingEntry[]) : [];
    } catch {
      return [];
    }
  }

  private writePending(list: QuizPendingEntry[]): void {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable, keep going in memory only */
    }
  }

  // Date#toISOString() only emits UTC (a trailing "Z"); the vault contract
  // wants the local wall clock time with its own offset, built by hand.
  private localIsoString(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const offsetMin = -now.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
    return `${date}T${time}${offset}`;
  }
}
