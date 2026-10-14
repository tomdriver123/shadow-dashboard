import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { map } from 'rxjs';
import { GameService } from './data/game-service';
import { TownsService } from './data/towns-service';
import { TownMap } from './map/town-map';
import { EncounterCard } from './encounter/encounter-card';
import { TownPanel } from './panel/town-panel';
import { POKE_PATH, TOWN_PARAM } from './poke-paths';

// Keep in sync with the 768px breakpoint in poke.page.css
const MOBILE_QUERY = '(max-width: 767.98px)';

@Component({
  selector: 'app-poke-page',
  imports: [IonicModule, RouterLink, TownPanel, TownMap, EncounterCard],
  templateUrl: './poke.page.html',
  styleUrl: './poke.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'poke-page' },
})
export class PokePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly townsService = inject(TownsService);
  private readonly gameService = inject(GameService);

  /** The selected town from `?town=`; undefined in list mode. */
  protected readonly id = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get(TOWN_PARAM) ?? undefined)),
    { initialValue: undefined as string | undefined },
  );

  protected readonly pokePath = POKE_PATH;
  protected readonly towns = this.townsService.towns;
  protected readonly game = this.gameService.game;
  /** The selected town when it hosts encounters; home shows the trainer card instead. */
  protected readonly encounterTown = computed(() => {
    const id = this.id();
    const town = id === undefined ? undefined : this.townsService.towns().find((t) => t.id === id);
    return town && town.mode !== 'home' ? town : undefined;
  });
  protected readonly routes = computed(() => this.gameService.game()?.routes ?? []);
  protected readonly loading = this.townsService.loading;
  protected readonly error = this.townsService.error;

  /**
   * A town detail opens with the sheet expanded so the encounter is on screen;
   * returning to the list drops it back to peek so the map shows. The toggle
   * still flips it either way.
   */
  protected readonly expanded = linkedSignal({
    source: this.id,
    computation: (id) => id !== undefined,
  });
  /** Incremented by Recenter; TownMap refits when it changes. */
  protected readonly fitRequest = signal(0);
  protected readonly isMobile = signal(false);
  private readonly sheetHeight = signal(0);
  protected readonly centerOffset = computed(() => (this.isMobile() ? this.sheetHeight() : 0));

  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');

  constructor() {
    const destroyRef = inject(DestroyRef);

    if (typeof matchMedia === 'function') {
      const query = matchMedia(MOBILE_QUERY);
      this.isMobile.set(query.matches);
      const onChange = (event: MediaQueryListEvent): void => this.isMobile.set(event.matches);
      query.addEventListener('change', onChange);
      destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    }

    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.sheetHeight.set(entry.contentRect.height);
        }
      });
      observer.observe(this.sheet().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected toggleSheet(): void {
    this.expanded.update((value) => !value);
  }

  protected recenter(): void {
    this.fitRequest.update((value) => value + 1);
    if (this.isMobile()) {
      this.expanded.set(false);
    }
  }

  /** A marker reached by Tab must not sit behind the expanded sheet. */
  protected onMapFocusIn(): void {
    if (this.isMobile()) {
      this.expanded.set(false);
    }
  }

  protected onSelect(id: string): void {
    void this.router.navigate([POKE_PATH], { queryParams: { [TOWN_PARAM]: id } });
  }
}
