import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { KbData, KbQuestion } from './career.model';

const ANSWERED_KEY = 'shadow.quiz.answered.v1';
const PENDING_KEY = 'shadow.quiz.pending.v1';
const DEAD_KEY = 'shadow.quiz.dead.v1';
const MAX_PENDING = 200;
const MAX_DEAD = 50;

export type QuizResult = 'pass' | 'miss';

export type EncounterOutcome = 'caught' | 'xp' | 'fled';

export interface QuizAnswer {
  pick: string;
  result: QuizResult;
  answered: string;
  town?: string;
  species?: string;
  outcome?: EncounterOutcome;
}

export interface EncounterContext {
  town: string;
  species: string;
}

export interface QuizPendingEntry {
  questionId: string | null;
  topic: string | null;
  pick: string | null;
  answer: string | null;
  result: QuizResult | null;
  answered: string;
  town?: string;
  species?: string;
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

  /** Bumped after every record, free catch and successful encounter response. */
  readonly version = signal(0);

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

  record(q: KbQuestion, pick: string, encounter?: EncounterContext): QuizAnswer {
    const existing = this.answered[q.id];
    if (existing) return existing;

    const result: QuizResult = pick === q.answer ? 'pass' : 'miss';
    const answer: QuizAnswer = { pick, result, answered: this.localIsoString() };
    if (encounter) {
      answer.town = encounter.town;
      answer.species = encounter.species;
    }

    this.answered = { ...this.answered, [q.id]: answer };
    this.writeAnswered(this.answered);

    const entry: QuizPendingEntry = {
      questionId: q.id,
      topic: q.topic,
      pick,
      answer: q.answer,
      result,
      answered: answer.answered,
    };
    if (encounter) {
      entry.town = encounter.town;
      entry.species = encounter.species;
    }
    this.enqueue(entry);

    this.bump();
    void this.flush();
    return answer;
  }

  recordFreeCatch(ctx: EncounterContext, season: number): QuizAnswer {
    const key = `free:${season}:${ctx.species}`;
    const existing = this.answered[key];
    if (existing) return existing;

    const answer: QuizAnswer = {
      pick: '',
      result: 'pass',
      answered: this.localIsoString(),
      town: ctx.town,
      species: ctx.species,
    };
    this.answered = { ...this.answered, [key]: answer };
    this.writeAnswered(this.answered);

    this.enqueue({
      questionId: null,
      topic: null,
      pick: null,
      answer: null,
      result: null,
      answered: answer.answered,
      town: ctx.town,
      species: ctx.species,
    });

    this.bump();
    void this.flush();
    return answer;
  }

  private enqueue(entry: QuizPendingEntry): void {
    this.pending.push(entry);
    if (this.pending.length > MAX_PENDING) {
      this.pending = this.pending.slice(this.pending.length - MAX_PENDING);
    }
    this.writePending(this.pending);
  }

  private bump(): void {
    this.version.update((v) => v + 1);
  }

  private keyFor(entry: QuizPendingEntry): string {
    if (entry.questionId) return entry.questionId;
    // Free catch keys carry the season, find the stored key for this species.
    const suffix = `:${entry.species}`;
    const keys = Object.keys(this.answered);
    for (let i = keys.length - 1; i >= 0; i--) {
      if (keys[i].indexOf('free:') === 0 && keys[i].slice(-suffix.length) === suffix) return keys[i];
    }
    return `free:0:${entry.species}`;
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending[0];
        const url = next.town ? '/api/game/encounter' : '/api/quiz/attempt';
        try {
          const res = await firstValueFrom(this.http.post<{ row?: { result?: EncounterOutcome } }>(url, next));
          const outcome = res && res.row ? res.row.result : undefined;
          if (outcome) {
            const key = this.keyFor(next);
            const stored = this.answered[key];
            if (stored) {
              this.answered = { ...this.answered, [key]: { ...stored, outcome } };
              this.writeAnswered(this.answered);
            }
          }
          if (next.town) this.bump();
        } catch (err) {
          const status = err instanceof HttpErrorResponse ? err.status : 0;
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            console.warn(`[quiz] server rejected an outbox entry (${status}), moved to the dead letter list`);
            this.bury(next);
          } else {
            break;
          }
        }
        this.pending = this.pending.slice(1);
        this.writePending(this.pending);
      }
    } finally {
      this.flushing = false;
    }
  }

  private bury(entry: QuizPendingEntry): void {
    try {
      const raw = localStorage.getItem(DEAD_KEY);
      const dead: QuizPendingEntry[] = raw ? (JSON.parse(raw) as QuizPendingEntry[]) : [];
      dead.push(entry);
      localStorage.setItem(DEAD_KEY, JSON.stringify(dead.slice(-MAX_DEAD)));
    } catch {
      /* storage unavailable, drop it */
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
