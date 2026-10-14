import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, inject, signal } from '@angular/core';
import { GameData } from './game';

const LOAD_ERROR = 'Could not load game data.';
const GAME_URL = 'assets/data/game.json';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly http = inject(HttpClient);

  private readonly gameState = signal<GameData | null>(null);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);

  readonly game: Signal<GameData | null> = this.gameState.asReadonly();
  readonly loading: Signal<boolean> = this.loadingState.asReadonly();
  readonly error: Signal<string | null> = this.errorState.asReadonly();

  constructor() {
    this.fetch(GAME_URL);
  }

  /** Refetches game.json past any cache, for after an encounter changes the ledger. */
  reload(): void {
    this.fetch(`${GAME_URL}?v=${Date.now()}`);
  }

  private fetch(url: string): void {
    this.http.get<unknown>(url).subscribe({
      next: (body) => {
        if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
          this.gameState.set(body as GameData);
          this.errorState.set(null);
        } else {
          this.fail();
        }
        this.loadingState.set(false);
      },
      error: () => {
        this.fail();
        this.loadingState.set(false);
      },
    });
  }

  private fail(): void {
    this.gameState.set(null);
    this.errorState.set(LOAD_ERROR);
  }
}
