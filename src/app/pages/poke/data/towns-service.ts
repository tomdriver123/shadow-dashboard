import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, inject, signal } from '@angular/core';
import { normalizeTowns } from './normalize';
import { Town } from './town';

const LOAD_ERROR = 'Could not load towns.';

@Injectable({ providedIn: 'root' })
export class TownsService {
  private readonly http = inject(HttpClient);

  private readonly townsState = signal<Town[]>([]);
  private readonly loadingState = signal(true);
  private readonly errorState = signal<string | null>(null);

  readonly towns: Signal<Town[]> = this.townsState.asReadonly();
  readonly loading: Signal<boolean> = this.loadingState.asReadonly();
  readonly error: Signal<string | null> = this.errorState.asReadonly();

  constructor() {
    this.http.get<unknown>('assets/data/towns.json').subscribe({
      next: (body) => {
        try {
          this.townsState.set(normalizeTowns(body));
          this.errorState.set(null);
        } catch {
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
    this.townsState.set([]);
    this.errorState.set(LOAD_ERROR);
  }
}
