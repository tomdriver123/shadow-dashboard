import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonicModule } from '@ionic/angular';
import { MarkdownComponent } from 'ngx-markdown';
import { map } from 'rxjs';
import { KbQuestion } from '../../../services/career.model';
import { CAREER_SCOPES } from '../../../services/career-scope';
import { CareerService } from '../../../services/career.service';
import { EncounterOutcome, QuizCardService } from '../../../services/quiz-card.service';
import { GameData } from '../data/game';
import { GameService } from '../data/game-service';
import { PoolEntry, Town } from '../data/town';

// Matches the API's debounced regeneration (3 s) with a little slack.
const RELOAD_DELAY_MS = 4500;

interface Frozen {
  townId: string;
  question: KbQuestion;
  species: PoolEntry;
}

function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// FNV-1a, 32 bit.
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

@Component({
  selector: 'app-encounter-card',
  imports: [IonicModule, MarkdownComponent],
  templateUrl: './encounter-card.html',
  styleUrl: './encounter-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EncounterCard {
  readonly town = input.required<Town>();
  readonly game = input<GameData | null>(null);

  private readonly quiz = inject(QuizCardService);
  private readonly gameService = inject(GameService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly kb = toSignal(
    inject(CareerService)
      .getCareerData(CAREER_SCOPES.tom)
      .pipe(map((d) => d?.kb ?? null)),
    { initialValue: null },
  );

  protected readonly kbLoading = computed(() => this.kb() === null);

  protected readonly isQuestionMode = computed(() => {
    const mode = this.town().mode;
    return mode === 'mcq' || mode === 'scout' || mode === 'league';
  });

  protected readonly candidates = computed(() => {
    this.quiz.version();
    const queue = this.quiz.queueFor(this.kb());
    const town = this.town();
    if (town.mode === 'league') {
      return queue.filter((q) => q.level === 'fundamentals');
    }
    return queue.filter((q) => town.banks.indexOf(q.topic) >= 0);
  });

  /** Slugs caught this season: the ledger plus local passes not yet in game.json. */
  private readonly caughtSet = computed(() => {
    this.quiz.version();
    const set = new Set<string>();
    for (const e of this.game()?.pokedex?.entries ?? []) {
      if (e.caught) set.add(e.species);
    }
    for (const a of this.quiz.answeredEntries()) {
      if (a.species && a.result === 'pass') set.add(a.species);
    }
    return set;
  });

  private caughtThisSeason(species: string): boolean {
    const season = this.game()?.season?.number;
    const entry = (this.game()?.pokedex?.entries ?? []).find((e) => e.species === species);
    const ledger = !!entry && !!entry.caught && (season === undefined || entry.seasons.indexOf(season) >= 0);
    if (ledger) return true;
    return this.quiz.answeredEntries().some((a) => a.species === species && a.result === 'pass');
  }

  private gateOpen(species: string): boolean {
    const gate = this.town().gates.find((g) => g.scope === 'species' && g.species === species);
    return !!gate && gate.open;
  }

  /** Gated pool entries whose gate is open and which are not yet caught this season. */
  protected readonly openGated = computed(() => {
    this.quiz.version();
    return this.town().pool.filter((p) => p.gated && this.gateOpen(p.species) && !this.caughtThisSeason(p.species));
  });

  private rollPool(): PoolEntry[] {
    const town = this.town();
    if (town.mode === 'league') return this.openGated();
    return town.pool.filter((p) => !p.gated && !p.gift);
  }

  protected readonly current = signal<Frozen | null>(null);
  protected readonly ballSpecies = signal<string[]>([]);

  constructor() {
    effect(() => {
      const town = this.town();
      const candidates = this.candidates();
      this.quiz.version();
      const cur = untracked(() => this.current());
      if (cur && cur.townId === town.id) return;
      if (!this.isQuestionMode() || candidates.length === 0) {
        if (cur) this.current.set(null);
        return;
      }
      const pool = untracked(() => this.rollPool());
      if (pool.length === 0) {
        if (cur) this.current.set(null);
        return;
      }
      const n = untracked(() => this.quiz.answeredEntries(town.id).filter((a) => a.answered.slice(0, 10) === localToday()).length);
      const index = fnv1a(`${town.id}|${localToday()}|${n}`) % pool.length;
      this.current.set({ townId: town.id, question: candidates[0], species: pool[index] });
    });
    this.destroyRef.onDestroy(() => this.timers.forEach((t) => clearTimeout(t)));
  }

  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  protected readonly answer = computed(() => {
    this.quiz.version();
    const cur = this.current();
    return cur ? this.quiz.answerOf(cur.question.id) : null;
  });

  protected readonly outcome = computed<EncounterOutcome | null>(() => {
    const cur = this.current();
    const a = this.answer();
    if (!cur || !a) return null;
    if (a.outcome) return a.outcome;
    if (a.result !== 'pass') return 'fled';
    // The answer just given is itself a local pass; leave it out of the prediction.
    const seen = new Set<string>();
    for (const e of this.game()?.pokedex?.entries ?? []) {
      if (e.caught) seen.add(e.species);
    }
    for (const x of this.quiz.answeredEntries()) {
      if (x.result === 'pass' && x.species && x.answered !== a.answered) seen.add(x.species);
    }
    return seen.has(cur.species.species) ? 'xp' : 'caught';
  });

  protected readonly scoutReason = computed(() => this.game()?.scout?.reason ?? null);

  protected readonly externalXp = computed(() => {
    const track = this.town().track;
    const slot = (this.game()?.party ?? []).find((s) => s.track === track);
    return slot ? slot.xp : null;
  });

  protected readonly townGate = computed(() => this.town().gates.find((g) => g.scope === 'town') ?? null);

  /** Mewtwo style gated species that are thrown for, not quizzed for. */
  protected readonly ballTargets = computed(() => {
    if (this.town().mode === 'league') return [];
    const thrown = this.ballSpecies();
    return this.openGated().concat(
      this.town().pool.filter((p) => p.gated && thrown.indexOf(p.species) >= 0 && this.openGated().indexOf(p) < 0),
    );
  });

  protected isThrown(species: string): boolean {
    return this.ballSpecies().indexOf(species) >= 0;
  }

  protected pick(letter: string): void {
    const cur = this.current();
    if (!cur || this.answer()) return;
    this.quiz.record(cur.question, letter, { town: cur.townId, species: cur.species.species });
    this.scheduleReload();
  }

  protected next(): void {
    this.current.set(null);
    this.gameService.reload();
  }

  protected throwBall(entry: PoolEntry): void {
    const season = this.game()?.season?.number ?? 1;
    this.quiz.recordFreeCatch({ town: this.town().id, species: entry.species }, season);
    this.ballSpecies.update((list) => list.concat(entry.species));
    this.scheduleReload();
  }

  private scheduleReload(): void {
    this.timers.push(setTimeout(() => this.gameService.reload(), RELOAD_DELAY_MS));
  }

  protected isCorrect(letter: string): boolean {
    return letter === this.current()?.question.answer;
  }

  protected isPicked(letter: string): boolean {
    return letter === this.answer()?.pick;
  }

  protected bankList(): string {
    return this.town().banks.join(', ');
  }
}
